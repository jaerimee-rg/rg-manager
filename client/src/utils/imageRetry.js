/**
 * 썸네일이 못 뜬 칸을 다시 불러오는 규칙 (순수 함수, components/album/RetryImage).
 *
 * Drive 썸네일은 이따금 실패한다 — 방금 올린 사진·영상은 Drive 가 썸네일을 만드는 동안 얼마간 에러를 주고,
 * 한꺼번에 많이 부르면 잠깐 거절되기도 한다. 예전에는 한 번 실패하면 그 칸을 숨겨 새로고침할 때까지 빈칸이었다.
 */

/** 다시 부르기까지 기다리는 시간 — 차례로 (ms). 다 쓰면 그만두고 아이콘을 보인다 */
export const RETRY_DELAYS = [1000, 3000, 8000];

/** attempt 번째 실패 뒤 기다릴 시간. 더 시도하지 않으면 null */
export const retryDelay = (attempt, delays = RETRY_DELAYS) => (attempt < delays.length ? delays[attempt] : null);

/**
 * 다시 부를 주소. 같은 주소를 다시 넣으면 브라우저가 새로 받지 않으므로 retry=n 을 붙인다
 * (lh3 · drive.google.com 모두 모르는 값은 무시하고 같은 그림을 준다 — 2026-10-09 확인).
 */
export const retryUrl = (src, attempt) => {
  if (!src || !(attempt > 0)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;
};
