/**
 * 학부모 채팅 방문자 키 저장
 *
 * 이 키로 기기(브라우저)와 대화를 연결한다. 키가 바뀌면 이전 대화를 못 찾고
 * 대화명부터 다시 입력해야 한다.
 *
 * localStorage 만 쓰면 모바일에서 자주 끊긴다 — iOS Safari 는 한동안 방문이 없으면
 * 사이트 데이터를 지우고, 카카오톡 인앱 브라우저는 저장소가 분리되거나 초기화될 수 있다.
 * 그래서 관리자 토큰(tokenStorage.js)과 같이 localStorage + 쿠키 이중 저장을 쓴다.
 */

const VISITOR_KEY = 'faqChatVisitorKey';
// 대화가 오래 이어질 수 있으므로 넉넉하게 잡는다.
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1년 (초)

const createVisitorKey = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const readLocal = () => {
  try {
    return localStorage.getItem(VISITOR_KEY);
  } catch (e) {
    // 시크릿 모드 등에서 접근이 막힐 수 있다
    return null;
  }
};

const writeLocal = (value) => {
  try {
    localStorage.setItem(VISITOR_KEY, value);
  } catch (e) {
    // 저장이 막혀도 쿠키가 있으면 유지된다
  }
};

const readCookie = () => {
  try {
    const match = document.cookie.match(new RegExp(`(^| )${VISITOR_KEY}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
  } catch (e) {
    return null;
  }
};

const writeCookie = (value) => {
  try {
    const secure = window.location.protocol === 'https:' ? ';Secure' : '';
    document.cookie =
      `${VISITOR_KEY}=${encodeURIComponent(value)};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax${secure}`;
  } catch (e) {
    // 쿠키가 막혀도 localStorage 가 있으면 유지된다
  }
};

/**
 * 이 기기의 방문자 키를 돌려준다. 없으면 새로 만들어 양쪽에 저장한다.
 * 한쪽만 남아 있으면 다른 쪽을 복구해 다음 방문에 더 잘 살아남게 한다.
 */
export const getVisitorKey = () => {
  const fromLocal = readLocal();
  const fromCookie = readCookie();
  const existing = fromLocal || fromCookie;

  if (existing) {
    // 지워진 쪽을 다시 채워 넣는다
    if (!fromLocal) writeLocal(existing);
    if (!fromCookie) writeCookie(existing);
    return existing;
  }

  const created = createVisitorKey();
  writeLocal(created);
  writeCookie(created);
  return created;
};

export const clearVisitorKey = () => {
  try {
    localStorage.removeItem(VISITOR_KEY);
  } catch (e) {
    // 무시
  }
  try {
    document.cookie = `${VISITOR_KEY}=;path=/;max-age=0;SameSite=Lax`;
  } catch (e) {
    // 무시
  }
};
