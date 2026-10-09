import { FLICK_MIN, SWIPE_SLOP } from '../sheetSwipe';
import { PAGE_DISTANCE, PAGE_GAP, PAGE_VELOCITY, pageDistance, pageIntent, pageStep } from '../viewerSwipe';

describe('pageIntent — 처음 움직임으로 제스처를 정한다', () => {
  it('조금 움직인 것은 아직 모른다', () => {
    expect(pageIntent(0, 0)).toBe('wait');
    expect(pageIntent(SWIPE_SLOP - 1, -(SWIPE_SLOP - 1))).toBe('wait');
  });

  it('옆으로 더 많이 움직이면 넘긴다 — 왼쪽이든 오른쪽이든', () => {
    expect(pageIntent(-SWIPE_SLOP, 0)).toBe('page');
    expect(pageIntent(14, -5)).toBe('page');
  });

  it('위아래·정확히 대각선은 브라우저 몫', () => {
    expect(pageIntent(3, 12)).toBe('other');
    expect(pageIntent(0, -SWIPE_SLOP)).toBe('other');
    expect(pageIntent(10, 10)).toBe('other');
  });
});

describe('pageStep — 놓았을 때 몇 장 넘길지', () => {
  it('왼쪽으로 충분히 밀면 다음 장, 오른쪽이면 이전 장', () => {
    expect(pageStep({ offset: -PAGE_DISTANCE })).toBe(1);
    expect(pageStep({ offset: PAGE_DISTANCE })).toBe(-1);
  });

  it('덜 밀고 천천히 놓으면 제자리', () => {
    expect(pageStep({ offset: -(PAGE_DISTANCE - 1) })).toBe(0);
    expect(pageStep({ offset: 0, velocity: 2 })).toBe(0);
  });

  it('좁은 화면에서는 폭의 25% 만 밀어도 넘긴다', () => {
    expect(pageStep({ offset: -98, width: 390 })).toBe(1);
    expect(pageStep({ offset: -97, width: 390 })).toBe(0);
    // 넓은 화면은 PAGE_DISTANCE 가 상한
    expect(pageStep({ offset: PAGE_DISTANCE, width: 1600 })).toBe(-1);
  });

  it('빠르게 튕기면 조금만 밀어도 넘긴다 — 손끝이 떨린 정도는 빼고', () => {
    expect(pageStep({ offset: -FLICK_MIN, velocity: -PAGE_VELOCITY })).toBe(1);
    expect(pageStep({ offset: FLICK_MIN, velocity: 1 })).toBe(-1);
    expect(pageStep({ offset: -(FLICK_MIN - 1), velocity: -2 })).toBe(0);
  });

  it('멀리 밀었다가 되돌리며 놓으면 넘기지 않는다', () => {
    expect(pageStep({ offset: -200, velocity: PAGE_VELOCITY })).toBe(0);
    expect(pageStep({ offset: 200, velocity: -1 })).toBe(0);
    // 되돌리는 속도가 느리면 거리대로
    expect(pageStep({ offset: -200, velocity: 0.1 })).toBe(1);
  });
});

it('pageDistance — 한 장 넘기면 폭 + 틈만큼 간다', () => {
  expect(pageDistance(390)).toBe(390 + PAGE_GAP);
});
