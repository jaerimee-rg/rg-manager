// 학부모 ↔ 학생 연결 화면에서 쓰는 순수 함수. 화면과 분리해 테스트한다.

const squash = (value) => String(value ?? '').replace(/\s+/g, '');

/**
 * 선생님 화면에 보여줄 학부모 이름.
 * 가입 때 정한 이름("예림엄마")을 쓰고, 아직 정하지 않은 옛 계정은 카카오 닉네임으로 되돌린다.
 */
export const parentLabel = (parent) => parent?.displayName || parent?.username || '';

/**
 * 확인 대기 자녀와 이름 또는 생년월일이 같은 학생을 추천한다.
 * (오타·띄어쓰기 때문에 자동 연결이 안 된 경우를 사람이 빨리 고르도록)
 */
export const suggestStudents = (child, students) => {
  if (!child) return [];
  const name = squash(child.childName);
  const birth = child.childBirthdate;
  return (students || []).filter((s) => squash(s.name) === name || s.birthdate === birth);
};

/** 학생 기준으로 뒤집은 목록 — 학생별 보기에서 쓴다 */
export const buildStudentView = (students, parents) => {
  const linksByStudent = new Map();
  const pendingChildren = [];

  for (const parent of parents || []) {
    for (const child of parent.children || []) {
      if (child.studentId) {
        if (!linksByStudent.has(child.studentId)) linksByStudent.set(child.studentId, []);
        linksByStudent.get(child.studentId).push({ parent, child });
      } else {
        pendingChildren.push({ parent, child });
      }
    }
  }

  return (students || []).map((student) => ({
    student,
    links: linksByStudent.get(student.id) || [],
    // 이 학생과 이름·생일이 겹치는 확인 대기 자녀 (한 번에 연결하도록)
    suggestions: pendingChildren.filter(
      ({ child }) => squash(child.childName) === squash(student.name) || child.childBirthdate === student.birthdate
    )
  }));
};

/** 검색어로 학부모를 거른다 (학부모 이름·카카오 닉네임 또는 아이 이름) */
export const filterParents = (parents, query) => {
  const q = squash(query);
  if (!q) return parents || [];
  return (parents || []).filter(
    (p) =>
      squash(p.displayName).includes(q) ||
      squash(p.username).includes(q) ||
      (p.children || []).some((c) => squash(c.childName).includes(q))
  );
};

export const hasPending = (parent) => (parent.children || []).some((c) => c.status !== 'linked');

/** 확인 대기가 있는 학부모를 위로 */
export const sortParents = (parents) =>
  [...(parents || [])].sort((a, b) => (hasPending(b) ? 1 : 0) - (hasPending(a) ? 1 : 0));
