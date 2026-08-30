/**
 * 카카오 OAuth 의 `state` 에 실어 보내는 값 (docs/accounts-roles 02 §2.7).
 *
 * 카카오는 인가 요청의 state 를 콜백에 그대로 돌려주므로 서버 세션 없이
 *   - prefer  : 이 브라우저가 마지막으로 쓰던 역할 (로그인할 계정 선택 힌트)
 *   - invite  : 학부모 초대 토큰
 *   - tinvite : 선생님 초대 토큰
 * 세 가지를 운반한다. DB 를 건드리지 않는 순수 함수라 단위 테스트로 고정한다.
 */

export const ROLES = ['admin', 'user', 'parent'];

/** 계정이 여럿일 때 고르는 순서 (FR-302) */
export const ROLE_PRIORITY = ['admin', 'user', 'parent'];

const STATE_VERSION = 1;

/**
 * 값이 하나도 없으면 undefined 를 돌려준다 → 호출부가 state 자체를 생략해
 * 지금까지와 완전히 같은 인가 URL 이 만들어진다.
 */
export const encodeState = ({ prefer, invite, tinvite } = {}) => {
  const payload = { v: STATE_VERSION };

  if (ROLES.includes(prefer)) payload.p = prefer;
  if (invite) payload.i = String(invite);
  if (tinvite) payload.t = String(tinvite);

  if (Object.keys(payload).length === 1) return undefined;

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

/**
 * 하위 호환 (FR-307):
 *   - 빈 값        → {} (힌트도 초대도 없음)
 *   - 우리 포맷    → { prefer, invite, tinvite }
 *   - 그 밖의 문자열 → 옛 클라이언트가 보낸 **학부모 초대 토큰 원문**으로 본다
 */
export const decodeState = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return {};

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

    if (!parsed || parsed.v !== STATE_VERSION) {
      return { invite: value, legacy: true };
    }

    const out = {};
    if (ROLES.includes(parsed.p)) out.prefer = parsed.p;
    if (parsed.i) out.invite = String(parsed.i);
    if (parsed.t) out.tinvite = String(parsed.t);
    return out;
  } catch {
    // base64 도 JSON 도 아니면 옛 초대 토큰이다
    return { invite: value, legacy: true };
  }
};

/**
 * 같은 카카오 계정의 여러 행 중 로그인시킬 하나를 고른다 (FR-302).
 * 힌트가 가리키는 역할이 있으면 그것, 없으면 관리자 > 선생님 > 학부모 순.
 */
export const pickAccount = (accounts, prefer) => {
  const rows = Array.isArray(accounts) ? accounts : [];
  if (rows.length === 0) return null;

  if (prefer) {
    const hinted = rows.find((row) => row.role === prefer);
    if (hinted) return hinted;
  }

  for (const role of ROLE_PRIORITY) {
    const found = rows.find((row) => row.role === role);
    if (found) return found;
  }

  return rows[0];
};

/**
 * 초대 링크 전체를 붙여넣어도 받아준다.
 * `https://…/invite/abc123` · `https://…/teacher-invite/abc123?x=1` → `abc123`
 */
export const extractInviteToken = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return raw;

  try {
    const path = new URL(raw).pathname.replace(/\/+$/, '');
    return decodeURIComponent(path.split('/').pop() || '');
  } catch {
    return raw;
  }
};

export default { ROLES, ROLE_PRIORITY, encodeState, decodeState, pickAccount, extractInviteToken };
