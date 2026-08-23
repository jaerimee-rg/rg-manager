// 관리자가 대화창을 열어둔 동안에는 AI 가 대신 답하지 않도록 하기 위한 판정 로직.
// 클라이언트가 주기적으로 presence 를 갱신하고, 그 시각이 창(window) 안이면 "보고 있는 중"으로 본다.

// 하트비트 주기(20초)보다 넉넉하게 잡아 한 번 놓쳐도 끊기지 않게 한다.
export const ADMIN_PRESENCE_WINDOW_MS = 45 * 1000;

const isWithin = (isoString, windowMs, now) => {
  if (!isoString) return false;

  const at = new Date(isoString).getTime();
  if (Number.isNaN(at)) return false;

  // 서버·DB 시계가 어긋나 미래 시각이 들어와도 "최근"으로 취급한다.
  return now - at < windowMs;
};

/**
 * 관리자가 지금 이 대화를 보고 있는지 여부
 */
export const isAdminViewing = (adminViewingAt, now = Date.now()) =>
  isWithin(adminViewingAt, ADMIN_PRESENCE_WINDOW_MS, now);
