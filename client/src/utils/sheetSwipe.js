// 바텀시트를 손가락으로 끌어내려 닫기 — 화면을 모르는 판단만 둔다. 손가락을 따라가는 일은 hooks/useSwipeToClose.

/** 이만큼 움직이기 전에는 어느 쪽으로 미는지 정하지 않는다 (px) */
export const SWIPE_SLOP = 6;
/** 이만큼 끌어내리면 닫는다 — 시트가 낮으면 시트 높이의 30% (px) */
export const DISMISS_DISTANCE = 140;
/** 놓는 순간 이보다 빠르게 내리고 있었으면 조금만 끌어도 닫는다 (px/ms) */
export const DISMISS_VELOCITY = 0.5;
/** 튕겨 닫기에도 최소한 이만큼은 끌어야 한다 — 손끝이 떨린 것을 닫기로 보지 않는다 (px) */
export const FLICK_MIN = 24;
/** 놓는 순간의 속도는 이 시간 안의 움직임으로 잰다 (ms) */
const VELOCITY_WINDOW = 100;

/**
 * 처음 움직임으로 이 제스처가 무엇인지 정한다.
 * 'wait' — 아직 모른다 · 'down' — 시트를 끌어내린다 · 'other' — 가로 넘기기·위로 스크롤 등 브라우저 몫
 */
export const swipeIntent = (dx, dy, slop = SWIPE_SLOP) => {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return 'wait';
  return dy > 0 && dy > Math.abs(dx) ? 'down' : 'other';
};

/** 놓았을 때 닫을지. height 를 모르면(0) 거리 기준만 쓴다 */
export const shouldDismiss = ({ offset, velocity = 0, height = 0 }) => {
  const distance = height > 0 ? Math.min(DISMISS_DISTANCE, height * 0.3) : DISMISS_DISTANCE;
  return offset >= distance || (velocity >= DISMISS_VELOCITY && offset >= FLICK_MIN);
};

/**
 * 최근 손가락 위치 [{ y, t }] → 놓는 순간 아래로 내리던 속도 (px/ms, 위로 올리던 중이면 음수).
 * axis 를 'x' 로 주면 [{ x, t }] 로 가로 속도(오른쪽이 양수)를 잰다 — 뷰어 넘기기(utils/viewerSwipe).
 */
export const releaseVelocity = (samples = [], axis = 'y') => {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const recent = samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW);
  const first = recent.length > 1 ? recent[0] : samples[samples.length - 2];
  const dt = last.t - first.t;
  return dt > 0 ? (last[axis] - first[axis]) / dt : 0;
};

/** 손가락이 닿은 곳부터 시트까지 이미 아래로 스크롤된 칸이 있는가 — 있으면 끌어내리기 대신 그 칸을 스크롤한다 */
export const insideScrolled = (target, root) => {
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
};

/** 손가락을 따로 쓰는 칸(입력·슬라이더 등)에서 시작한 제스처는 시트가 가져가지 않는다 */
const SWIPE_IGNORE = 'input, textarea, select, [contenteditable="true"], [data-sheet-swipe="off"]';
export const ignoresSwipe = (target) => Boolean(target?.closest?.(SWIPE_IGNORE));

/** 끌어내린 만큼 뒤 스크림을 옅게 */
export const scrimOpacity = (offset, height) => (height > 0 ? Math.max(0, 1 - offset / height) : 1);
