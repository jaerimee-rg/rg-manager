/**
 * 얼굴을 찾고 특징값을 뽑는다 — **Vercel Python 함수(face_engine/)** 가 InsightFace buffalo_l
 * (SCRFD 검출 + ArcFace 512차원)로 계산한다.
 *
 * 2026-10 까지는 이 브라우저에서 face-api(128차원)를 돌렸는데, 운영 사진 102장 중 51장에서 얼굴을 못 찾고
 * 서로 다른 아이를 한 아이로 묶었다. 같은 사진을 InsightFace 로 보면 93장에서 찾고 아이끼리 확실히 갈렸다.
 * 브라우저는 이미 메모리에 있는 축소본(긴 변 1920px)을 JPEG 로 보내고 결과만 받는다 — 사진은 서버에 남지 않는다.
 *
 * **실패해도 업로드를 막지 않는다** — 못 뽑으면 null 을 돌려주고 서버는 그 사진을 '분석 안 됨'(skipped)으로
 * 남긴다. 나중에 [얼굴 찾기] 로 다시 분석하거나 선생님이 직접 이름을 붙일 수 있다.
 *
 * **null(실패)과 빈 배열(얼굴 없음)은 다른 뜻이다.** 빈 배열을 보내면 서버는 'none' 으로 적고 다시 분석할 목록에서
 * 뺀다 — 분석 서버가 꺼져 있던 사진을 [] 로 돌려주면 "얼굴 없는 사진" 으로 영영 묻힌다.
 */
import { getToken } from './tokenStorage';

const ENGINE_URL = '/api/face-engine/detect';

/**
 * 얼굴을 찾는 방식의 버전 — **server/utils/faceVector.js · face_engine/service.py 의 값과 같아야 한다.**
 * 결과와 함께 서버로 보내고, 서버는 이보다 낮은 버전으로 분석한 사진을 다시 찾을 목록에 넣는다.
 */
export const FACE_ANALYZER_VERSION = 3;

/** 분석할 축소본의 긴 변(px). 재분석은 Drive 의 같은 크기 사진(=s1920)을 쓴다. */
export const ANALYSIS_LONG_SIDE = 1920;

export const DESCRIPTOR_LENGTH = 512;
const MAX_FACES = 50;
const JPEG_QUALITY = 0.9;

/** 함수가 쉬고 있다 처음 깨어나면 모델(약 176MB)을 받느라 수십 초 걸릴 수 있다. */
const REQUEST_TIMEOUT_MS = 90_000;

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const isUsableFace = (face) => Array.isArray(face?.descriptor)
  && face.descriptor.length === DESCRIPTOR_LENGTH
  && face.descriptor.every((value) => typeof value === 'number' && Number.isFinite(value));

/** 캔버스·File·Blob·URL(Drive lh3 =s1920) → 보낼 사진 Blob. 못 만들면 null */
const toBlob = async (source) => {
  if (!source) return null;
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source;
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return new Promise((resolve) => source.toBlob((blob) => resolve(blob || null), 'image/jpeg', JPEG_QUALITY));
  }
  if (typeof source === 'string') {
    const response = await fetch(source);
    return response.ok ? response.blob() : null;
  }
  return null;
};

/**
 * 사진에서 얼굴을 찾아 특징값을 뽑는다.
 * → [{ box: {x,y,w,h} 0~1, score, descriptor: number[512] }]  — 얼굴이 없으면 []
 *
 * 분석하지 못하면(사진을 못 읽음, 분석 서버가 꺼짐·시간 초과, 로그인 만료) **null** 을 돌려준다.
 * 던지지 않으므로 호출한 쪽은 그대로 업로드를 이어 간다.
 */
export const detectFaces = async (source) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const blob = await toBlob(source);
    if (!blob) return null;

    const token = getToken();
    const response = await fetch(ENGINE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: blob,
      signal: controller?.signal
    });
    if (!response.ok) {
      console.error('얼굴 분석 실패(건너뜁니다):', response.status);
      return null;
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.faces)) return null;

    return payload.faces
      .filter(isUsableFace)
      .slice(0, MAX_FACES)
      .map((face) => ({
        box: { x: clamp01(face.box?.x), y: clamp01(face.box?.y), w: clamp01(face.box?.w), h: clamp01(face.box?.h) },
        score: Number(Number(face.score || 0).toFixed(3)),
        descriptor: face.descriptor
      }));
  } catch (error) {
    console.error('얼굴 분석 실패(건너뜁니다):', error?.message || error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 여러 얼굴 중 하나가 다른 얼굴보다 이만큼(넓이 배수) 크면 그 얼굴을 주인공으로 본다.
 * 지금 검출기는 뒤에 작게 찍힌 사람까지 찾아서, "한 명만" 을 고집하면 아이 사진 대부분이 거절된다.
 */
const MAIN_FACE_AREA_RATIO = 3;

/** 얼굴이 하나면 그것, 여럿이면 다른 얼굴보다 확실히 큰 하나 — 없으면 null */
export const pickMainFace = (faces) => {
  if (!faces?.length) return null;
  if (faces.length === 1) return faces[0];
  const sorted = [...faces].sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h));
  const [first, second] = sorted;
  return first.box.w * first.box.h >= MAIN_FACE_AREA_RATIO * second.box.w * second.box.h ? first : null;
};

/**
 * 기준 얼굴 등록용 — 얼굴이 하나이거나, 한 얼굴이 확실히 클 때만 통과시킨다.
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
  const main = pickMainFace(faces);
  if (!main) return { ok: false, reason: 'multiple' };
  return { ok: true, descriptor: main.descriptor, box: main.box };
};

export default { FACE_ANALYZER_VERSION, ANALYSIS_LONG_SIDE, DESCRIPTOR_LENGTH, detectFaces, detectSingleFace, pickMainFace };
