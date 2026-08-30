/**
 * 토큰 저장 유틸리티
 * localStorage + cookie 이중 저장으로 iOS Safari 브라우저 닫기 후에도 로그인 유지
 */

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const LAST_ROLE_KEY = 'lastRole';
const IMPERSONATOR_KEY = 'impersonator';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일 (초)

function setCookie(name, value, maxAge = COOKIE_MAX_AGE) {
  const secure = window.location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax${secure}`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax`;
}

export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    // localStorage 사용 불가 시 무시
  }
  setCookie(TOKEN_KEY, token);
}

export function getToken() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    // localStorage 사용 불가
  }
  if (!token) {
    token = getCookie(TOKEN_KEY);
    // cookie에서 복구한 경우 localStorage에도 저장
    if (token) {
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch (e) {
        // 무시
      }
    }
  }
  return token;
}

export function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    // 무시
  }
  deleteCookie(TOKEN_KEY);
}

export function saveUser(user) {
  const userStr = JSON.stringify(user);
  try {
    localStorage.setItem(USER_KEY, userStr);
  } catch (e) {
    // 무시
  }
  setCookie(USER_KEY, userStr);
}

export function getUser() {
  let userStr = null;
  try {
    userStr = localStorage.getItem(USER_KEY);
  } catch (e) {
    // 무시
  }
  if (!userStr) {
    userStr = getCookie(USER_KEY);
    if (userStr) {
      try {
        localStorage.setItem(USER_KEY, userStr);
      } catch (e) {
        // 무시
      }
    }
  }
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

export function removeUser() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    // 무시
  }
  deleteCookie(USER_KEY);
}

export function clearAuth() {
  removeToken();
  removeUser();
  // 마지막 역할은 일부러 남긴다 — 다음 카카오 로그인에서 어느 계정으로 들어갈지
  // 정하는 힌트로만 쓰이고, 로그인 상태와는 무관하다 (docs/accounts-roles FR-393).
}

/* ── 다른 계정으로 로그인 (docs/accounts-roles FR-388) ──
   관리자가 다른 계정으로 들어가 있는 동안 돌아올 관리자 세션을 따로 둔다.
   localStorage 에만 두고 cookie 에는 넣지 않는다 — 잃어버려도 관리자가 다시
   로그인하면 그만이고, 관리자 토큰을 두 곳에 흩뿌리지 않는 편이 낫다. */

/** @param {{ id:number, username:string, token:string, user:object }} actor 원래 관리자와 그 세션 */
export function saveImpersonator(actor) {
  try {
    localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(actor));
  } catch (e) {
    // localStorage 를 못 쓰면 배너의 "돌아가기" 대신 로그아웃만 된다
  }
}

export function getImpersonator() {
  try {
    const raw = localStorage.getItem(IMPERSONATOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearImpersonator() {
  try {
    localStorage.removeItem(IMPERSONATOR_KEY);
  } catch (e) {
    // 무시
  }
}

/**
 * 저장해 둔 관리자 세션을 다시 현재 세션으로 올리고 대신 로그인 기록을 지운다.
 * 돌아갈 세션이 없으면 null — 호출한 쪽이 로그아웃으로 처리한다.
 */
export function restoreImpersonatorSession() {
  const actor = getImpersonator();
  clearImpersonator();
  if (!actor?.token || !actor?.user) return null;

  saveToken(actor.token);
  saveUser(actor.user);
  return { token: actor.token, user: actor.user };
}

/**
 * 이 브라우저가 마지막으로 쓴 역할.
 * 한 카카오 계정이 관리자·선생님·학부모 계정을 모두 가질 수 있어(FR-310),
 * 로그인할 때 어느 계정으로 들어갈지 고르는 힌트가 된다 (FR-301).
 */
export function saveLastRole(role) {
  if (!role) return;
  try {
    localStorage.setItem(LAST_ROLE_KEY, role);
  } catch (e) {
    // localStorage 를 못 쓰면 힌트 없이 우선순위로 정해진다
  }
}

export function getLastRole() {
  try {
    return localStorage.getItem(LAST_ROLE_KEY);
  } catch (e) {
    return null;
  }
}
