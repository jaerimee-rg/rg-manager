/**
 * 얼굴 특징값(512차원, InsightFace ArcFace)을 다루는 순수 함수 모음.
 *
 * 저장 형식은 base64(Float32Array) 다. JSON 배열보다 절반 이하로 작고
 * 파싱이 빠르다(2048바이트 → 2732자). pgvector 를 쓰지 않는 이유는
 * 운영 Supabase 의 앱 계정이 확장을 설치할 권한이 없기 때문이며,
 * 규모(선생님 1명당 수백~수천 얼굴)에서는 여기 거리 계산으로 충분하다.
 * 자세한 배경은 docs/photo-sharing/03-implementation-plan.md C-1 참조.
 *
 * 특징값은 Vercel Python 함수(face_engine/)가 계산한다. 2026-10 까지 쓰던 브라우저 face-api(128차원)
 * 값은 길이가 달라 decodeDescriptor 가 null 로 읽고 매칭에서 빠진다 — 사진은 다시 분석하고
 * 기준 얼굴은 다시 등록해야 한다.
 */

export const DESCRIPTOR_LENGTH = 512;

/**
 * 얼굴을 찾는 방식의 버전 — **face_engine/service.py ANALYZER_VERSION · client/src/utils/faceClient.js 와 같아야 한다.**
 * 찾는 방식이 바뀌어 예전 결과를 다시 봐야 하면 올린다. 이보다 낮은(또는 기록이 없는) 버전으로
 * 분석한 사진은 "얼굴 없음" 이었어도 다시 찾을 목록에 들어간다.
 *   1 — 1280px 축소본 · 검출 입력 512 (기록 없음 = 1)
 *   2 — 1920px 축소본 · 검출 입력 512 + 1024 (작은 얼굴, 2026-10)
 *   3 — InsightFace buffalo_l (SCRFD + ArcFace 512차원), Vercel 에서 분석 (2026-10)
 */
export const FACE_ANALYZER_VERSION = 3;

/** 브라우저가 보낸 버전 → 양의 정수, 아니면 null (기록 없음 = 예전 방식으로 취급된다) */
export const parseAnalyzerVersion = (value) => {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 && version < 1000 ? version : null;
};

/**
 * 기본 임계값 — **코사인 거리(1 − 코사인 유사도)** 기준이다. 관리자가 app_settings 로 조정할 수 있다.
 *
 * 운영 사진 102장으로 잰 값(2026-10): 같은 아이의 정면 사진끼리는 유사도 0.7~0.9(거리 0.1~0.3),
 * 다른 아이와는 0.40 이하(거리 0.6 이상), 한 사진 속 서로 다른 사람은 최대 0.51.
 * 다만 눈을 감았거나 머리카락에 가린 기준 사진이면 다른 아이가 유사도 0.53~0.61 까지 올라왔다 —
 * 그래서 자동 태그는 0.65 이상(거리 0.35 이하)으로 좁히고, 옆얼굴처럼 0.50~0.65 인 것은 학부모가
 * [맞아요/아니에요] 로 고르는 후보로 둔다.
 *
 * (예전 face-api 는 유클리드 거리였고 같은 아이 0.35~0.37 · 다른 아이 0.32~0.52 로 겹쳐서 임계값으로 가를 수 없었다.)
 */
export const DEFAULT_MATCH_THRESHOLD = 0.35;
export const DEFAULT_CANDIDATE_THRESHOLD = 0.50;

/**
 * 태그를 붙이는 **방식**의 버전 — 임계값 말고 규칙 자체가 바뀌면 올린다.
 *   1 — 얼굴마다 모든 학생과 비교 (한 얼굴이 여러 아이로 태그될 수 있었다)
 *   2 — 한 얼굴은 가장 가까운 아이 한 명에게만 (bestPerStudent)
 *   3 — 512차원 ArcFace + 코사인 거리 (2026-10)
 */
export const FACE_MATCH_RULES_VERSION = 3;

/**
 * 지금의 매칭 규칙을 한 줄로 — 방식 버전 + 두 임계값. 앨범마다 "이 규칙으로 계산했다" 를 적어 두고
 * (events."albumMatchRules"), 다르면 다시 매칭한다. 임계값을 바꾸거나 규칙을 고쳐도 예전 자동 태그가 남던 것을 막는다
 * (운영 2026-10: 0.50 에서 붙은 태그가 0.35 로 좁힌 뒤에도 남아 "우리 아이만 보기" 에 다른 아이가 나왔다).
 */
export const matchRulesSignature = (thresholds = {}) => {
  const match = Number.isFinite(thresholds.match) ? thresholds.match : DEFAULT_MATCH_THRESHOLD;
  const candidate = Number.isFinite(thresholds.candidate) ? thresholds.candidate : DEFAULT_CANDIDATE_THRESHOLD;
  return `r${FACE_MATCH_RULES_VERSION}:${match}:${candidate}`;
};

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
 * base64 → Float32Array. 저장된 값이 깨졌거나 예전 길이(128)면 null 을 돌려준다
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
 * 코사인 거리 = 1 − 코사인 유사도 (0 에 가까울수록 같은 사람, 0~2).
 * 둘 중 하나라도 없거나 길이가 다르거나 0 벡터면 Infinity — "매칭 안 됨" 으로 취급된다.
 */
export const faceDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return Infinity;
  return 1 - dot / Math.sqrt(normA * normB);
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
 * 얼굴들 × 프로필들 → 학생별 가장 가까운 얼굴.
 *
 * faces:    [{ id, descriptor: Float32Array }]
 * profiles: [{ studentId, descriptor: Float32Array }]
 * → [{ studentId, distance, faceId }] (거리 오름차순)
 *
 * **한 얼굴은 가장 가까운 학생 한 명에게만 붙는다.** 예전에는 얼굴마다 모든 학생과 거리를 재서
 * 같은 얼굴이 두 아이로 함께 태그됐다(운영 2026-10: 한 얼굴이 0.378 · 0.436 으로 두 아이에게 자동 태그).
 * 한 학생에 기준 얼굴이 여러 장이면 그 중 가장 가까운 것으로 잰다.
 */
export const bestPerStudent = (faces, profiles) => {
  const best = new Map();
  for (const face of faces || []) {
    if (!face?.descriptor) continue;
    let nearest = null;
    for (const profile of profiles || []) {
      if (!profile?.descriptor) continue;
      const distance = faceDistance(face.descriptor, profile.descriptor);
      if (!Number.isFinite(distance)) continue;
      if (!nearest || distance < nearest.distance) {
        nearest = { studentId: profile.studentId, distance, faceId: face.id ?? null };
      }
    }
    if (!nearest) continue;
    const previous = best.get(nearest.studentId);
    if (!previous || nearest.distance < previous.distance) best.set(nearest.studentId, nearest);
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
};

export default {
  FACE_MATCH_RULES_VERSION,
  matchRulesSignature,
  FACE_ANALYZER_VERSION,
  parseAnalyzerVersion,
  DESCRIPTOR_LENGTH,
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_CANDIDATE_THRESHOLD,
  isValidDescriptor,
  encodeDescriptor,
  decodeDescriptor,
  faceDistance,
  classifyDistance,
  bestPerStudent
};
