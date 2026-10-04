import {
  DISMISS_DISTANCE, FLICK_MIN, SWIPE_SLOP,
  ignoresSwipe, insideScrolled, releaseVelocity, scrimOpacity, shouldDismiss, swipeIntent
} from '../sheetSwipe';

describe('swipeIntent — 처음 움직임으로 제스처를 정한다', () => {
  it('조금 움직인 것은 아직 모른다', () => {
    expect(swipeIntent(0, 0)).toBe('wait');
    expect(swipeIntent(SWIPE_SLOP - 1, -(SWIPE_SLOP - 1))).toBe('wait');
  });

  it('아래로 더 많이 움직이면 시트를 끌어내린다', () => {
    expect(swipeIntent(0, SWIPE_SLOP)).toBe('down');
    expect(swipeIntent(-5, 12)).toBe('down');
  });

  it('위로·옆으로(사진 넘기기)·정확히 대각선은 브라우저 몫', () => {
    expect(swipeIntent(0, -12)).toBe('other');
    expect(swipeIntent(20, 8)).toBe('other');
    expect(swipeIntent(-20, 8)).toBe('other');
    expect(swipeIntent(10, 10)).toBe('other');
  });
});

describe('shouldDismiss — 놓았을 때 닫을지', () => {
  it('충분히 끌어내리면 닫는다 — 시트가 낮으면 높이의 30% 면 된다', () => {
    expect(shouldDismiss({ offset: DISMISS_DISTANCE, height: 800 })).toBe(true);
    expect(shouldDismiss({ offset: DISMISS_DISTANCE - 1, height: 800 })).toBe(false);
    expect(shouldDismiss({ offset: 90, height: 300 })).toBe(true);
    expect(shouldDismiss({ offset: 89, height: 300 })).toBe(false);
  });

  it('높이를 모르면(0) 거리 기준만 쓴다 — 0 이라고 무엇이든 닫지 않는다', () => {
    expect(shouldDismiss({ offset: 10, height: 0 })).toBe(false);
    expect(shouldDismiss({ offset: DISMISS_DISTANCE })).toBe(true);
  });

  it('빠르게 튕기면 짧게 끌어도 닫는다 — 손끝 떨림은 빼고', () => {
    expect(shouldDismiss({ offset: FLICK_MIN, velocity: 0.8, height: 800 })).toBe(true);
    expect(shouldDismiss({ offset: FLICK_MIN - 1, velocity: 3, height: 800 })).toBe(false);
    expect(shouldDismiss({ offset: 60, velocity: 0.2, height: 800 })).toBe(false);
    expect(shouldDismiss({ offset: 60, velocity: -1, height: 800 })).toBe(false);
  });
});

describe('releaseVelocity — 놓는 순간의 속도', () => {
  it('최근 100ms 의 움직임으로 잰다', () => {
    const samples = [{ y: 0, t: 0 }, { y: 10, t: 300 }, { y: 30, t: 350 }, { y: 70, t: 400 }];
    expect(releaseVelocity(samples)).toBeCloseTo(60 / 100);
  });

  it('최근 움직임이 하나뿐이면 바로 앞 위치와 비교한다', () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 100, t: 500 }])).toBeCloseTo(0.2);
  });

  it('위로 올리던 중이면 음수, 잴 수 없으면 0', () => {
    expect(releaseVelocity([{ y: 100, t: 0 }, { y: 50, t: 50 }])).toBeLessThan(0);
    expect(releaseVelocity([{ y: 0, t: 0 }])).toBe(0);
    expect(releaseVelocity([{ y: 0, t: 5 }, { y: 10, t: 5 }])).toBe(0);
    expect(releaseVelocity()).toBe(0);
  });
});

describe('insideScrolled · ignoresSwipe', () => {
  const tree = () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="body"><p><span>글</span></p><input><div data-sheet-swipe="off"><b>칸</b></div></div>';
    return root;
  };

  it('닿은 곳부터 시트까지 아래로 스크롤된 칸이 있으면 true', () => {
    const root = tree();
    const span = root.querySelector('span');
    expect(insideScrolled(span, root)).toBe(false);
    root.querySelector('.body').scrollTop = 40;
    expect(insideScrolled(span, root)).toBe(true);
  });

  it('시트 바깥(root 위)은 보지 않는다', () => {
    const outer = document.createElement('div');
    const root = tree();
    outer.appendChild(root);
    outer.scrollTop = 40;
    expect(insideScrolled(root.querySelector('span'), root)).toBe(false);
  });

  it('입력 칸과 data-sheet-swipe="off" 안에서 시작한 제스처는 가져가지 않는다', () => {
    const root = tree();
    expect(ignoresSwipe(root.querySelector('input'))).toBe(true);
    expect(ignoresSwipe(root.querySelector('b'))).toBe(true);
    expect(ignoresSwipe(root.querySelector('span'))).toBe(false);
    expect(ignoresSwipe(null)).toBe(false);
  });
});

describe('scrimOpacity', () => {
  it('끌어내린 만큼 옅어진다', () => {
    expect(scrimOpacity(0, 800)).toBe(1);
    expect(scrimOpacity(400, 800)).toBe(0.5);
    expect(scrimOpacity(1200, 800)).toBe(0);
    expect(scrimOpacity(100, 0)).toBe(1);
  });
});
