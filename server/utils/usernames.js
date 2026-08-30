/**
 * users.username 은 UNIQUE 다. 한 사람이 역할별로 계정을 여러 개 가지면
 * 이름이 겹치므로 뒤에 숫자를 붙인다 (docs/accounts-roles FR-312).
 *
 * 원래 authController 안의 `uniqueParentUsername` 이었고, 선생님·관리자 행 생성에도
 * 쓰이게 되어 이곳으로 옮겼다. 동작은 그대로다.
 */

export const USERNAME_MAX = 30;

/**
 * @param {string} base      쓰고 싶은 이름 (카카오 닉네임 또는 현재 계정 이름)
 * @param {(name: string) => Promise<boolean>} exists  이미 쓰이는 이름인지
 * @param {string} fallback  base 가 비었을 때 쓸 이름
 */
export const uniqueUsername = async (base, exists, fallback = '사용자') => {
  const trimmed = String(base ?? '').trim().slice(0, USERNAME_MAX) || fallback;

  if (!(await exists(trimmed))) return trimmed;

  for (let i = 2; i < 100; i += 1) {
    // 접미사까지 합쳐 최대 길이를 넘지 않게 자른다
    const suffix = `_${i}`;
    const candidate = `${trimmed.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  const stamp = `_${Date.now()}`;
  return `${trimmed.slice(0, USERNAME_MAX - stamp.length)}${stamp}`;
};

export default { uniqueUsername, USERNAME_MAX };
