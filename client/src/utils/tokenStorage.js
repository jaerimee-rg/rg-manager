/**
 * 토큰 저장 유틸리티
 * localStorage + cookie 이중 저장으로 iOS Safari 브라우저 닫기 후에도 로그인 유지
 */

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const LAST_ROLE_KEY = 'lastRole';
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
