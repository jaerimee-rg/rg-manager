/**
 * 학부모가 입력한 아이를 선생님의 학생과 맞춰보는 규칙.
 *
 * 이름은 공백을 무시하고, 생년월일은 `2018-3-5` 처럼 자리수가 다른 값도 흡수한다
 * (기존 students.birthdate 는 TEXT 라 포맷이 섞여 있을 수 있다).
 * 정확히 한 명일 때만 자동 연결하고, 0명이거나 2명 이상이면 선생님 확인으로 넘긴다.
 */

export const normalizeName = (name) => String(name ?? '').replace(/\s+/g, '');

export const normalizeDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 20180305 처럼 구분자가 없는 경우
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;

  return raw;
};

/**
 * @returns {{ status: 'linked'|'pending', studentId: number|null, candidates: number }}
 */
export const matchChild = (students, { name, birthdate }) => {
  const targetName = normalizeName(name);
  const targetBirth = normalizeDate(birthdate);

  if (!targetName || !targetBirth) return { status: 'pending', studentId: null, candidates: 0 };

  const hits = (students || []).filter(
    (s) => normalizeName(s.name) === targetName && normalizeDate(s.birthdate) === targetBirth
  );

  return hits.length === 1
    ? { status: 'linked', studentId: hits[0].id, candidates: 1 }
    : { status: 'pending', studentId: null, candidates: hits.length };
};

export default { normalizeName, normalizeDate, matchChild };
