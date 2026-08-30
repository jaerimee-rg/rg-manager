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

/* ───────── 표시 이름 (users."displayName") ─────────
   username 은 UNIQUE 한 **식별자**다. 초대·역할 추가로 만든 선생님 행은 `카카오_<ts>`
   같은 자동 이름을 받고, 같은 사람의 관리자 행이 이미 "최재웅" 이면 선생님 행은 그
   이름을 쓸 수 없다. 그래서 사람에게 보이는 이름은 따로 둔다 — 학부모의
   `parent_accounts.displayName` 과 같은 규칙이다 (UNIQUE 아님, 없으면 username). */

/** `카카오_1788076610466` · `카카오1234` · `카카오_…_2` — 이름이 아니라 자동 식별자 */
const PLACEHOLDER_RE = /^카카오_?\d+(_\d+)?$/;

export const isPlaceholderName = (name) => PLACEHOLDER_RE.test(String(name ?? '').trim());

/** 새 선생님 행의 username. 이름은 표시 이름으로 따로 받는다. */
export const placeholderUsername = () => `카카오_${Date.now()}`;

/**
 * 다른 사람에게 보여줄 이름. 표시 이름 → username 순이고, username 이 자동 이름이면
 * null 을 준다 (그건 이름이 아니므로 학부모에게 보여주지 않는다).
 */
export const displayNameOf = (user) => {
  const display = String(user?.displayName ?? '').trim();
  if (display) return display;

  const username = String(user?.username ?? '').trim();
  return username && !isPlaceholderName(username) ? username : null;
};

/** SQL 에서 같은 규칙으로 이름을 고를 때 — `COALESCE(NULLIF(u."displayName", ''), u.username)` */
export const displayNameSql = (alias) => `COALESCE(NULLIF(${alias}."displayName", ''), ${alias}.username)`;

export default { uniqueUsername, USERNAME_MAX, isPlaceholderName, placeholderUsername, displayNameOf, displayNameSql };
