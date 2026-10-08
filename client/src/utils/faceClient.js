/**
 * 얼굴 특징값을 브라우저에서 뽑는다.
 *
 * 서버(Vercel)에 tfjs 를 올리지 않는 이유와 배경은
 * docs/photo-sharing/03-implementation-plan.md C-2 에 있다. 여기서 중요한 것은
 * **실패해도 업로드를 막지 않는다**는 것 — 못 뽑으면 null 을 돌려주고
 * 서버는 그 사진을 '분석 안 됨'(skipped)으로 남긴다. 나중에 다시 분석하거나
 * 선생님이 직접 이름을 붙일 수 있다.
 *
 * **null(실패)과 빈 배열(얼굴 없음)은 다른 뜻이다.** 빈 배열을 보내면 서버는 'none' 으로
 * 적고 다시 분석할 목록에서 뺀다 — 실패를 빈 배열로 돌려주면 모델을 못 받은 사진이
 * "얼굴 없는 사진" 으로 영영 묻힌다.
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

/**
 * 얼굴을 찾는 방식의 버전 — **server/utils/faceVector.js 의 FACE_ANALYZER_VERSION 과 같아야 한다.**
 * 결과와 함께 서버로 보내고, 서버는 이보다 낮은 버전으로 분석한 사진을 다시 찾을 목록에 넣는다.
 * 아래 크기·검출 설정을 바꿔 예전 결과를 다시 봐야 할 때 두 파일에서 함께 올린다.
 */
export const FACE_ANALYZER_VERSION = 2;

/** 분석할 축소본의 긴 변(px). 재분석은 Drive 의 같은 크기 썸네일(=s1920)을 쓴다. */
export const ANALYSIS_LONG_SIDE = 1920;

/**
 * 검출 입력 크기. TinyFaceDetector 는 입력 크기로 줄인 그림에서 대략 50px 보다 작은 얼굴을 못 찾는다.
 * - 512 만 쓰면: 운영 단체 사진(얼굴 폭 7~9%)에서 한 명도 못 찾았다(2026-10 실측).
 * - 1024 만 쓰면: 화면을 크게 채운 얼굴을 놓친다(같은 실측, 샘플 사진 2명 → 1명).
 * 그래서 512 로 찾고, 1024 로 상자만 먼저 찾아 본 뒤 새 얼굴이 있을 때만 1024 로 특징값까지 계산해 합친다.
 */
const BIG_FACE_INPUT = 512;
const SMALL_FACE_INPUT = 1024;
const options = (inputSize) => new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });

/** 두 상자가 이만큼(IoU) 겹치면 같은 얼굴로 본다. */
const SAME_FACE_OVERLAP = 0.3;

/**
 * 너무 작은 얼굴은 특징값이 흔들려 오히려 방해가 된다 — 얼굴 상자의 짧은 변이 사진 긴 변의 2% 미만이면 뺀다.
 * (예전에는 가로·세로를 각각 4% 로 쟀는데, 세로 사진에서는 같은 얼굴도 높이 비율이 작게 나와 빠졌다.)
 */
const MIN_FACE_RATIO = 0.02;

/** 두 상자 {x, y, width, height} 의 IoU (0~1) */
export const boxOverlap = (a, b) => {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

/**
 * 두 크기에서 찾은 결과를 합친다 — 점수가 높은 것부터 남기고, 이미 남긴 얼굴과 겹치면 버린다.
 * results: face-api 결과 [{ detection: { box, score }, ... }]
 */
export const mergeDetections = (results) => {
  const kept = [];
  [...results]
    .sort((a, b) => b.detection.score - a.detection.score)
    .forEach((result) => {
      if (!kept.some((other) => boxOverlap(other.detection.box, result.detection.box) > SAME_FACE_OVERLAP)) {
        kept.push(result);
      }
    });
  return kept;
};

const describeFaces = (api, element, inputSize) => api
  .detectAllFaces(element, options(inputSize))
  .withFaceLandmarks(true)
  .withFaceDescriptors();

/** 큰 얼굴(512) + 작은 얼굴(1024). 1024 의 특징값 계산은 512 가 놓친 얼굴이 있을 때만 한다. */
const findFaces = async (api, element) => {
  const big = await describeFaces(api, element, BIG_FACE_INPUT);
  const smallBoxes = await api.detectAllFaces(element, options(SMALL_FACE_INPUT));
  const missed = smallBoxes.some((detection) => (
    !big.some((result) => boxOverlap(result.detection.box, detection.box) > SAME_FACE_OVERLAP)
  ));
  if (!missed) return big;
  return mergeDetections([...big, ...await describeFaces(api, element, SMALL_FACE_INPUT)]);
};

/**
 * 이미지에서 얼굴을 찾아 특징값을 뽑는다.
 * → [{ box: {x,y,w,h} 0~1, score, descriptor: number[128] }]  — 얼굴이 없으면 []
 *
 * 분석하지 못하면(모델을 못 받음, 이미지를 못 읽음, 계산 오류) **null** 을 돌려준다.
 * 던지지 않으므로 호출한 쪽은 그대로 업로드를 이어 간다.
 */
export const detectFaces = async (source) => {
  let element = null;
  try {
    const api = await loadFaceApi();
    element = await toElement(source);
    if (!element) return null;

    const width = element.width || element.naturalWidth || element.videoWidth || 1;
    const height = element.height || element.naturalHeight || element.videoHeight || 1;
    const longSide = Math.max(width, height);

    const results = await findFaces(api, element);

    return results
      .filter((result) => Math.min(result.detection.box.width, result.detection.box.height) / longSide >= MIN_FACE_RATIO)
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
      .slice(0, 50);
  } catch (error) {
    console.error('얼굴 분석 실패(건너뜁니다):', error?.message || error);
    return null;
  } finally {
    if (element) releaseElement(element, source);
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
  if (!faces) return { ok: false, reason: 'failed' };
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

export default {
  FACE_ANALYZER_VERSION, ANALYSIS_LONG_SIDE, loadFaceApi, detectFaces, detectSingleFace, isFaceApiReady, resetFaceApi,
  boxOverlap, mergeDetections
};
