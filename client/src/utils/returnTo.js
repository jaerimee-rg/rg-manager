/**
 * "로그인 뒤 돌아갈 곳" (공유 링크 · 딥링크).
 *
 * 학부모가 카톡으로 받은 이벤트 링크(`/parent/events/12`)를 눌렀는데 로그인이 안 돼 있으면
 * 로그인 화면으로 보내면서 원래 주소를 여기 남겨 둔다. 카카오 인가는 다른 도메인을 거쳐
 * 돌아오므로 라우터 state 로는 살아남지 못한다 — 그래서 localStorage 에 둔다.
 *
 * 안전 규칙:
 *   - **상대 경로만** 받는다 (`/…`). `//evil.com`, `https://…` 같은 오픈 리다이렉트는 거른다.
 *   - 로그인·콜백 화면 자체는 돌아갈 곳이 아니다.
 *   - 한 시간이 지나면 버린다 — 며칠 전 눌렀던 링크로 느닷없이 튀지 않게.
 *   - 역할이 맞는 트리로만 보낸다 (`returnPathFor`): 선생님 계정으로 학부모 링크를 열면 그냥 홈.
 */

const KEY = 'returnTo';
const MAX_AGE_MS = 60 * 60 * 1000;

const NEVER_RETURN_TO = /^\/(login|signup|oauth\/|register-name|invite\/|teacher-invite\/)/;

/** 저장해도 되는 경로인가 — 앱 안의 상대 경로이고, 로그인 관련 화면이 아니다 */
export const isSafeReturnPath = (path) => {
  if (typeof path !== 'string' || path.length < 2) return false;
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false;
  if (/[\s\\]/.test(path)) return false;
  return !NEVER_RETURN_TO.test(path);
};

/** @returns {boolean} 실제로 저장했는지 */
export const saveReturnTo = (path, now = Date.now()) => {
  if (!isSafeReturnPath(path)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: now }));
    return true;
  } catch {
    // localStorage 를 못 쓰면 로그인 뒤 홈으로 간다 — 링크가 깨지는 건 아니다
    return false;
  }
};

export const clearReturnTo = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
};

/** 지우지 않고 읽는다. 오래됐거나 이상한 값이면 지우고 null */
export const peekReturnTo = (now = Date.now()) => {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const { path, at } = JSON.parse(raw);
    if (!isSafeReturnPath(path) || typeof at !== 'number' || now - at > MAX_AGE_MS) {
      clearReturnTo();
      return null;
    }
    return path;
  } catch {
    clearReturnTo();
    return null;
  }
};

/** 읽고 바로 지운다 — 한 번만 쓰는 값이다 */
export const consumeReturnTo = (now = Date.now()) => {
  const path = peekReturnTo(now);
  clearReturnTo();
  return path;
};

/**
 * 그 역할로 로그인한 사람을 이 경로로 보내도 되는가.
 * 학부모 트리(`/parent/…`)와 관리자 트리(`/admin…`)는 서로 열리지 않으므로
 * 맞지 않으면 null — 호출부가 역할 기본 화면으로 보낸다.
 */
export const returnPathFor = (role, path) => {
  if (!isSafeReturnPath(path)) return null;
  const parentTree = path.startsWith('/parent/');
  const adminTree = path === '/admin' || path.startsWith('/admin/');

  if (role === 'parent') return parentTree ? path : null;
  if (role === 'admin') return parentTree ? null : path;
  if (role === 'user') return parentTree || adminTree ? null : path;
  return null;
};

/** 공유받은 이벤트 링크인가 — 로그인 화면의 안내 문구용 */
export const isEventSharePath = (path) => /^\/parent\/events\/\d+(\?.*)?$/.test(String(path ?? ''));

export default {
  isSafeReturnPath, saveReturnTo, clearReturnTo, peekReturnTo, consumeReturnTo, returnPathFor, isEventSharePath
};
