// 전체 화면 뷰어를 옆으로 밀어 이전·다음 장으로 넘기기 — 화면을 모르는 판단만 둔다. 손가락을 따라가는 일은 hooks/useSwipeToPage.
import { FLICK_MIN, SWIPE_SLOP } from './sheetSwipe';

/** 이만큼 밀면 넘긴다 — 화면이 좁으면 폭의 25% (px) */
export const PAGE_DISTANCE = 120;
/** 놓는 순간 이보다 빠르게 밀고 있었으면 조금만 밀어도 넘긴다 (px/ms) */
export const PAGE_VELOCITY = 0.4;
/** 지금 장과 옆 장 사이의 틈 (px) — 밀 때 두 장이 붙어 보이지 않게 */
export const PAGE_GAP = 16;

/**
 * 처음 움직임으로 이 제스처가 무엇인지 정한다.
 * 'wait' — 아직 모른다 · 'page' — 옆으로 넘긴다 · 'other' — 위아래 움직임, 브라우저 몫
 */
export const pageIntent = (dx, dy, slop = SWIPE_SLOP) => {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return 'wait';
  return Math.abs(dx) > Math.abs(dy) ? 'page' : 'other';
};

/**
 * 놓았을 때 몇 장 넘길지 — 1 다음 장 · -1 이전 장 · 0 제자리.
 * offset 은 손가락이 옆으로 간 거리(왼쪽으로 밀면 음수 = 다음 장), velocity 는 놓는 순간의 가로 속도.
 * width 를 모르면(0) 거리 기준만 쓴다.
 */
export const pageStep = ({ offset, velocity = 0, width = 0 }) => {
  const direction = Math.sign(offset);
  if (!direction) return 0;
  const moving = Math.abs(velocity) >= PAGE_VELOCITY ? Math.sign(velocity) : 0;
  // 멀리 밀었다가 되돌리며 놓았다 — 넘기지 않는다
  if (moving && moving !== direction) return 0;

  const distance = width > 0 ? Math.min(PAGE_DISTANCE, width * 0.25) : PAGE_DISTANCE;
  const far = Math.abs(offset) >= distance;
  const flick = moving === direction && Math.abs(offset) >= FLICK_MIN;
  if (!far && !flick) return 0;
  return direction < 0 ? 1 : -1;
};

/** 한 장을 다 넘겼을 때 움직인 거리 (px) */
export const pageDistance = (width) => width + PAGE_GAP;
