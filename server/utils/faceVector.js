/**
 * 얼굴 특징값(128차원)을 다루는 순수 함수 모음.
 *
 * 저장 형식은 base64(Float32Array) 다. JSON 배열보다 절반 이하로 작고
 * 파싱이 빠르다(512바이트 → 684자). pgvector 를 쓰지 않는 이유는
 * 운영 Supabase 의 앱 계정이 확장을 설치할 권한이 없기 때문이며,
 * 규모(선생님 1명당 수백~수천 얼굴)에서는 여기 거리 계산으로 충분하다.
 * 자세한 배경은 docs/photo-sharing/03-implementation-plan.md C-1 참조.
 */

export const DESCRIPTOR_LENGTH = 128;

/**
 * 얼굴을 찾는 방식(브라우저 client/src/utils/faceClient.js)의 버전 — **두 파일의 값이 같아야 한다.**
 * 찾는 방식이 바뀌어 예전 결과를 다시 봐야 하면 올린다. 이보다 낮은(또는 기록이 없는) 버전으로
 * 분석한 사진은 "얼굴 없음" 이었어도 다시 찾을 목록에 들어간다.
 *   1 — 1280px 축소본 · 검출 입력 512 (기록 없음 = 1)
 *   2 — 1920px 축소본 · 검출 입력 512 + 1024 (작은 얼굴, 2026-10)
 */
export const FACE_ANALYZER_VERSION = 2;

/** 브라우저가 보낸 버전 → 양의 정수, 아니면 null (기록 없음 = 예전 방식으로 취급된다) */
export const parseAnalyzerVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 && version < 1000 ? version : null;
};

/**
 * 기본 임계값. 관리자가 app_settings 로 조정할 수 있다.
 * 처음엔 0.50 / 0.60 이었는데 "어느 정도만 비슷해도 보이게" 로 넓혔다(2026-10) — 놓치는 것보다
 * 학부모가 [맞아요/아니에요] 로 고르는 편이 낫다. 확인한 태그(parent_confirmed·excluded)는 다시 매칭해도
 * 바뀌지 않는다(faceMatch.js).
 */
export const DEFAULT_MATCH_THRESHOLD = 0.55;
export const DEFAULT_CANDIDATE_THRESHOLD = 0.65;

/**
 * 배열이 쓸 수 있는 얼굴 벡터인지 본다.
 * 길이가 맞고 모든 값이 유한한 수여야 한다 (NaN·Infinity 는 거리 계산을 오염시킨다).
 */
export const isValidDescriptor = (values) => {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) return false;
  if (values.length !== DESCRIPTOR_LENGTH) return false;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }
  return true;
};

/** 숫자 배열 → base64. 저장 직전에 한 번 부른다. */
export const encodeDescriptor = (values) => {
  if (!isValidDescriptor(values)) throw new Error('얼굴 특징값이 올바르지 않습니다.');
  const floats = Float32Array.from(values);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString('base64');
};

/**
 * base64 → Float32Array. 저장된 값이 깨졌으면 null 을 돌려준다
 * (한 행이 망가졌다고 매칭 전체가 실패하면 안 된다).
 */
export const decodeDescriptor = (encoded) => {
  if (typeof encoded !== 'string' || !encoded) return null;
  try {
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.byteLength !== DESCRIPTOR_LENGTH * 4) return null;
    // Buffer 는 풀에서 잘라 쓰므로 byteOffset 이 4의 배수가 아닐 수 있다. 복사해서 정렬을 맞춘다.
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    return new Float32Array(copy.buffer);
  } catch {
    return null;
  }
};

/**
 * 유클리드 거리. face-api 의 기준과 같다 (0 에 가까울수록 같은 사람).
 * 둘 중 하나라도 없거나 길이가 다르면 Infinity — "매칭 안 됨" 으로 취급된다.
 */
export const euclideanDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

/**
 * 거리 → 태그 출처.
 * match 이하는 자동 태그, candidate 이하는 "혹시 우리 아이?" 후보, 그 밖은 없음.
 */
export const classifyDistance = (distance, thresholds = {}) => {
  const match = Number.isFinite(thresholds.match) ? thresholds.match : DEFAULT_MATCH_THRESHOLD;
  const candidate = Number.isFinite(thresholds.candidate) ? thresholds.candidate : DEFAULT_CANDIDATE_THRESHOLD;
  if (!Number.isFinite(distance)) return null;
  if (distance <= match) return 'face';
  if (distance <= candidate) return 'candidate';
  return null;
};

/**
 * 얼굴들 × 프로필들 → 학생별 최소 거리.
 *
 * faces:    [{ id, descriptor: Float32Array }]
 * profiles: [{ studentId, descriptor: Float32Array }]
 * → [{ studentId, distance, faceId }] (거리 오름차순)
 *
 * 한 학생에 기준 얼굴이 여러 장이면 그 중 가장 가까운 것만 남긴다.
 */
export const bestPerStudent = (faces, profiles) => {
  const best = new Map();
  for (const face of faces || []) {
    if (!face?.descriptor) continue;
    for (const profile of profiles || []) {
      if (!profile?.descriptor) continue;
      const distance = euclideanDistance(face.descriptor, profile.descriptor);
      if (!Number.isFinite(distance)) continue;
      const previous = best.get(profile.studentId);
      if (!previous || distance < previous.distance) {
        best.set(profile.studentId, { studentId: profile.studentId, distance, faceId: face.id ?? null });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
};

export default {
  FACE_ANALYZER_VERSION,
  parseAnalyzerVersion,
  DESCRIPTOR_LENGTH,
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_CANDIDATE_THRESHOLD,
  isValidDescriptor,
  encodeDescriptor,
  decodeDescriptor,
  euclideanDistance,
  classifyDistance,
  bestPerStudent
};
