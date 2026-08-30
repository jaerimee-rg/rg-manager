/**
 * 역할과 화면을 잇는 순수 함수 (docs/accounts-roles 02 §5.3).
 * 역할 값은 DB 와 같은 문자열을 쓴다 — 'admin' | 'user'(선생님) | 'parent'.
 */

export const ROLE_ORDER = ['admin', 'user', 'parent'];

const LABELS = { admin: '관리자', user: '선생님', parent: '학부모' };

export const roleLabel = (role) => LABELS[role] || role || '';

/** 그 역할의 시작 화면 */
export const homePathFor = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'parent') return '/parent/schedule';
  return '/';
};

/**
 * 역할 계정을 막 만든 뒤 갈 곳.
 * 선생님은 이름을 정해야 하고(기존 신규 선생님과 같다), 학부모는 아이를 등록해야 한다.
 */
export const afterCreatePath = (role, { isNewUser, needsOnboarding } = {}) => {
  if (role === 'user' && isNewUser) return '/register-name';
  if (role === 'parent' && needsOnboarding) return '/parent/onboarding';
  return homePathFor(role);
};

export default { ROLE_ORDER, roleLabel, homePathFor, afterCreatePath };
