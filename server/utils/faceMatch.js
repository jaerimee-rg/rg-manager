/**
 * 태그 병합 규칙 (순수 함수).
 *
 * 미디어 × 학생 당 태그는 하나뿐이고, 출처에 우선순위가 있다.
 *   manual(선생님) > parent_confirmed(학부모 확인) > face(자동) > candidate(후보)
 * excluded 는 "아니라고 확인한 것" 이라 자동 매칭이 되살리지 못한다.
 *
 * 표 전체는 docs/photo-sharing/02-data-model-api.md §1.6 에 있다.
 */

export const TAG_SOURCES = ['face', 'candidate', 'manual', 'parent_confirmed', 'excluded'];

/** 사람이 정한 태그(자동 매칭이 덮어쓰면 안 되는 것) */
const HUMAN_SOURCES = new Set(['manual', 'parent_confirmed', 'excluded']);

export const isHumanSource = (source) => HUMAN_SOURCES.has(source);

/**
 * 현재 태그와 새로 들어온 태그를 놓고 무엇을 남길지 정한다.
 * 반환: 남길 source 문자열 | 'keep'(그대로 두기) | 'delete'(지우기)
 */
export const nextTagSource = (current, incoming) => {
  if (!TAG_SOURCES.includes(incoming)) return 'keep';

  // 사람이 정한 태그는 사람만 바꾼다.
  if (isHumanSource(current) && !isHumanSource(incoming)) return 'keep';

  // 이미 자동 태그인데 후보로 내려오는 경우는 유지한다 (임계값 근처에서 깜빡이지 않게).
  if (current === 'face' && incoming === 'candidate') return 'keep';

  return incoming;
};

/**
 * 재매칭 결과를 기존 태그에 적용할 계획을 만든다.
 *
 * existing: [{ studentId, source, distance, faceId }]
 * matches:  [{ studentId, source, distance, faceId }]   ← 이번에 계산된 자동/후보 태그만
 * → { upsert: [...], remove: [studentId] }
 *
 * 이번 계산에서 빠진 자동 태그(face/candidate)는 지운다 — 기준 얼굴이 삭제됐거나
 * 임계값이 바뀌어 더는 맞지 않는 경우다. 사람이 정한 태그는 건드리지 않는다.
 */
export const mergeMatches = (existing = [], matches = []) => {
  const byStudent = new Map((existing || []).map((tag) => [tag.studentId, tag]));
  const upsert = [];
  const seen = new Set();

  for (const match of matches || []) {
    seen.add(match.studentId);
    const current = byStudent.get(match.studentId);
    const next = nextTagSource(current?.source, match.source);
    if (next === 'keep' || next === 'delete') continue;
    // 값이 하나도 바뀌지 않으면 쓰기를 아낀다.
    if (current && current.source === next && current.distance === match.distance && current.faceId === match.faceId) continue;
    upsert.push({ ...match, source: next });
  }

  const remove = (existing || [])
    .filter((tag) => !isHumanSource(tag.source) && !seen.has(tag.studentId))
    .map((tag) => tag.studentId);

  return { upsert, remove };
};

export default { TAG_SOURCES, isHumanSource, nextTagSource, mergeMatches };
