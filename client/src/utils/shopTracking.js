// 공개 상점 방문·클릭 기록 (FR-440~443).
// 기록이 이동을 막으면 안 된다 — 응답을 기다리지 않고, 실패해도 조용히 넘어간다.
// 값은 쿼리스트링에만 싣는다: sendBeacon 에 JSON 본문을 실으면 브라우저마다 동작이 갈린다.
import { getVisitorKey } from './visitorStorage';

const VIEWED_PREFIX = 'shopViewed:';

const send = (url) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) {
      return;
    }
  } catch {
    // 아래 fetch 로 한 번 더
  }
  try {
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    // 기록 실패는 무시한다
  }
};

const withVisitor = (path) => `${path}?visitorKey=${encodeURIComponent(getVisitorKey())}`;

export const trackClick = (publicId, productId) => {
  send(withVisitor(`/api/shop/public/${encodeURIComponent(publicId)}/products/${encodeURIComponent(productId)}/click`));
};

/** 브라우저 세션당 한 번만 센다 — 새로고침·칩 이동은 방문이 아니다 */
export const trackViewOnce = (publicId) => {
  const key = `${VIEWED_PREFIX}${publicId}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // sessionStorage 가 막힌 인앱 브라우저 — 서버가 30분 중복을 걸러 준다
  }
  send(withVisitor(`/api/shop/public/${encodeURIComponent(publicId)}/view`));
  return true;
};
