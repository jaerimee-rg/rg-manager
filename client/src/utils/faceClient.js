/**
 * 얼굴 특징값을 브라우저에서 뽑는다.
 *
 * 서버(Vercel)에 tfjs 를 올리지 않는 이유와 배경은
 * docs/photo-sharing/03-implementation-plan.md C-2 에 있다. 여기서 중요한 것은
 * **실패해도 업로드를 막지 않는다**는 것 — 못 뽑으면 빈 배열을 돌려주고
 * 서버는 그 사진을 '분석 안 됨'으로 남긴다. 나중에 다시 분석하거나
 * 선생님이 직접 이름을 붙일 수 있다.
 *
 * 모델은 업로드·얼굴 등록 화면에서 처음 쓸 때 한 번만 내려받는다(약 6.5MB, 이후 캐시).
 */

const MODEL_URL = '/models';

let loadPromise = null;
let faceapi = null;

/** 라이브러리와 모델을 준비한다. 여러 번 불러도 한 번만 내려받는다. */
export const loadFaceApi = async () => {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const module = await import('@vladmandic/face-api');
    faceapi = module.default || module;

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    return faceapi;
  })().catch((error) => {
    // 다음에 다시 시도할 수 있게 실패한 약속은 버린다.
    loadPromise = null;
    throw error;
  });

  return loadPromise;
};

export const isFaceApiReady = () => Boolean(faceapi);

/** 내부 상태를 비운다 (테스트용) */
export const resetFaceApi = () => {
  loadPromise = null;
  faceapi = null;
};

const OPTIONS = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 });

/** 너무 작은 얼굴은 특징값이 흔들려 오히려 방해가 된다. */
const MIN_FACE_RATIO = 0.04;

/**
 * 이미지에서 얼굴을 찾아 특징값을 뽑는다.
 * → [{ box: {x,y,w,h} 0~1, score, descriptor: number[128] }]
 *
 * 실패하면 빈 배열을 돌려준다 (호출한 쪽은 그대로 업로드를 이어 간다).
 */
export const detectFaces = async (source) => {
  try {
    const api = await loadFaceApi();
    const element = await toElement(source);
    if (!element) return [];

    const width = element.width || element.naturalWidth || element.videoWidth || 1;
    const height = element.height || element.naturalHeight || element.videoHeight || 1;

    const results = await api
      .detectAllFaces(element, OPTIONS())
      .withFaceLandmarks(true)
      .withFaceDescriptors();

    releaseElement(element, source);

    return results
      .map((result) => {
        const box = result.detection.box;
        return {
          box: {
            x: clamp01(box.x / width),
            y: clamp01(box.y / height),
            w: clamp01(box.width / width),
            h: clamp01(box.height / height)
          },
          score: Number(result.detection.score.toFixed(3)),
          descriptor: Array.from(result.descriptor)
        };
      })
      .filter((face) => face.box.w >= MIN_FACE_RATIO && face.box.h >= MIN_FACE_RATIO)
      .slice(0, 50);
  } catch (error) {
    console.error('얼굴 분석 실패(건너뜁니다):', error?.message || error);
    return [];
  }
};

/**
 * 기준 얼굴 등록용 — 얼굴이 **정확히 하나**일 때만 통과시킨다.
 * → { ok: true, descriptor } | { ok: false, reason: 'none'|'multiple'|'failed' }
 */
export const detectSingleFace = async (source) => {
  let faces;
  try {
    faces = await detectFaces(source);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  if (!faces.length) return { ok: false, reason: 'none' };
  if (faces.length > 1) return { ok: false, reason: 'multiple' };
  return { ok: true, descriptor: faces[0].descriptor, box: faces[0].box };
};

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/** File·Blob·URL·엘리먼트를 모두 받아 그릴 수 있는 것으로 바꾼다. */
const toElement = async (source) => {
  if (!source) return null;
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) return source;
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) return source;

  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const image = new Image();
  image.crossOrigin = 'anonymous';

  const loaded = await new Promise((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });

  if (!loaded) {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
    return null;
  }
  image.dataset.objectUrl = typeof source === 'string' ? '' : url;
  return image;
};

const releaseElement = (element, source) => {
  if (typeof source !== 'string' && element?.dataset?.objectUrl) {
    URL.revokeObjectURL(element.dataset.objectUrl);
  }
};

export default { loadFaceApi, detectFaces, detectSingleFace, isFaceApiReady, resetFaceApi };
