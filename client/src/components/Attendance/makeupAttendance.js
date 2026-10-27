import { matchKoreanSearch } from '../../utils/koreanSearch';

/**
 * 보강 출석 추가 대화상자의 규칙 — 화면 없이 테스트할 수 있게 따로 둔다.
 */

/** 그날 기록 중 고른 수업에 이미 출석한 학생 id. 수업을 안 골랐으면 비어 있다. */
export function attendedStudentIds(records, classId) {
  const id = Number(classId);
  if (!id || !Array.isArray(records)) return new Set();
  return new Set(records.filter((r) => r.classId === id).map((r) => r.studentId));
}

/** 고른 학생 목록에 넣거나 뺀다. 고른 순서를 지킨다. */
export function toggleId(ids, id) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** 실제로 추가할 학생 — 고른 학생 중 그 수업에 아직 출석하지 않은 학생 (고른 순서). */
export function pendingStudentIds(selectedIds, attended) {
  return selectedIds.filter((id) => !attended.has(id));
}

/** 이름 검색 (초성 검색 포함). 검색어가 없으면 전체. */
export function searchStudents(students, query) {
  const text = query.trim();
  if (!text) return students;
  return students.filter((s) => matchKoreanSearch(text, s.name));
}

/** 추가 버튼 글자 — 고른 인원이 보이게 */
export function addButtonLabel(count) {
  return count > 0 ? `${count}명 추가` : '추가';
}

/** 서버 응답({added, skipped})을 한 줄 안내로 */
export function makeupResultMessage({ added = [], skipped = [] } = {}) {
  if (added.length === 0) return '고른 학생은 모두 이미 출석해 있어요.';
  const message = `보강 출석 ${added.length}명을 추가했어요.`;
  return skipped.length > 0 ? `${message} 이미 출석한 ${skipped.length}명은 건너뛰었어요.` : message;
}
