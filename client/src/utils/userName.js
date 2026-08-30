/**
 * 사람에게 보여줄 계정 이름.
 * `users.username` 은 UNIQUE 한 식별자라 초대·역할 추가로 만든 선생님 행은
 * `카카오_1788076610466` 같은 자동 이름을 갖는다. 설정에서 정한 표시 이름(`displayName`)이
 * 있으면 그것을, 없으면 username 을 쓴다 — 학부모의 `parentLabel()` 과 같은 규칙.
 */
export const userLabel = (user) => {
  const display = String(user?.displayName ?? '').trim();
  if (display) return display;
  return String(user?.username ?? '').trim();
};

export default userLabel;
