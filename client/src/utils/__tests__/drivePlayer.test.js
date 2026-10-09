import { DRIVE_PLAYER_MIN_WIDTH, drivePlayerFrame } from '../drivePlayer';

describe('drivePlayerFrame', () => {
  it('아래 막대 배치가 나오는 폭은 Drive 의 경계(500px)보다 넓다', () => {
    expect(DRIVE_PLAYER_MIN_WIDTH).toBeGreaterThanOrEqual(500);
  });

  it('좁은 칸이면 최소 폭으로 그리고 칸 폭만큼 줄인다 — 줄인 결과가 칸과 같은 크기다', () => {
    // 아이폰 세로: 390×645 칸
    const frame = drivePlayerFrame(390, 645);
    expect(frame).toEqual({ scale: 0.75, width: 520, height: 860 });
    expect(frame.width * frame.scale).toBeCloseTo(390, 5);
    expect(frame.height * frame.scale).toBeCloseTo(645, 0);
  });

  it.each([
    [320, 500],
    [375, 600],
    [414, 700],
    [519, 900]
  ])('%i×%i 칸 — 줄인 뒤에도 칸을 빈틈없이 채운다', (width, height) => {
    const frame = drivePlayerFrame(width, height);
    expect(frame.scale).toBeLessThan(1);
    expect(frame.width).toBe(DRIVE_PLAYER_MIN_WIDTH);
    expect(frame.width * frame.scale).toBeCloseTo(width, 5);
    // 높이는 정수 px 로 맞추므로 1px 안쪽 오차
    expect(Math.abs(frame.height * frame.scale - height)).toBeLessThan(1);
  });

  it.each([
    [520, 700],
    [768, 900],
    [900, 600]
  ])('%i×%i 칸 — 충분히 넓으면 줄이지 않고 칸을 그대로 채운다', (width, height) => {
    expect(drivePlayerFrame(width, height)).toEqual({ scale: 1, width: null, height: null });
  });

  it.each([
    [0, 0],
    [0, 600],
    [390, 0],
    [undefined, undefined],
    [NaN, 600]
  ])('크기를 아직 못 쟀으면(%p×%p) 칸을 그대로 채운다', (width, height) => {
    expect(drivePlayerFrame(width, height)).toEqual({ scale: 1, width: null, height: null });
  });

  it('최소 폭을 바꿔 쓸 수 있다', () => {
    expect(drivePlayerFrame(300, 400, 600)).toEqual({ scale: 0.5, width: 600, height: 800 });
  });
});

describe('누르는 즉시 재생 — 준비 상태', () => {
  const {
    readyPreviewUrl, hasSeenFrameTap, rememberFrameTap, isTouchDevice, shouldPrewarm
  } = require('../drivePlayer');

  const fakeStorage = () => {
    const data = {};
    return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
  };
  const brokenStorage = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); }
  };

  it('준비용 주소는 autoplay=1 을 붙인다 — 이미 쿼리가 있으면 & 로 잇는다', () => {
    expect(readyPreviewUrl('https://drive.google.com/file/d/abc/preview')).toBe('https://drive.google.com/file/d/abc/preview?autoplay=1');
    expect(readyPreviewUrl('https://drive.google.com/file/d/abc/preview?usp=x')).toBe('https://drive.google.com/file/d/abc/preview?usp=x&autoplay=1');
    expect(readyPreviewUrl(null)).toBeNull();
    expect(readyPreviewUrl('')).toBe('');
  });

  it('탭 신호는 한 번 보면 기억한다', () => {
    const storage = fakeStorage();
    expect(hasSeenFrameTap(storage)).toBe(false);
    rememberFrameTap(storage);
    expect(hasSeenFrameTap(storage)).toBe(true);
  });

  it('저장소가 막혀 있거나 없으면 "본 적 없음" — 예전 방식으로 남는다', () => {
    expect(hasSeenFrameTap(brokenStorage)).toBe(false);
    expect(() => rememberFrameTap(brokenStorage)).not.toThrow();
    expect(hasSeenFrameTap(null)).toBe(false);
    expect(() => rememberFrameTap(null)).not.toThrow();
  });

  it('터치 기기 판별 — 손가락만 쓰는 기기(hover 없음 · 굵은 포인터)일 때만', () => {
    const win = (matches) => ({ matchMedia: jest.fn(() => ({ matches })) });
    const touch = win(true);
    expect(isTouchDevice(touch)).toBe(true);
    expect(touch.matchMedia).toHaveBeenCalledWith('(hover: none) and (pointer: coarse)');
    expect(isTouchDevice(win(false))).toBe(false);
    expect(isTouchDevice({})).toBe(false);
    expect(isTouchDevice(null)).toBe(false);
    expect(isTouchDevice({ matchMedia: () => { throw new Error('x'); } })).toBe(false);
  });

  it.each([
    [{ src: 'u', touch: true, sawTap: true }, true],
    [{ src: 'u', touch: true, sawTap: false }, false],   // 신호를 본 적 없는 기기 — 겹친 사진을 못 치울 수 있다
    [{ src: 'u', touch: false, sawTap: true }, false],   // PC — 자동 재생이 허용돼 있으면 사진 뒤에서 재생된다
    [{ src: null, touch: true, sawTap: true }, false]
  ])('준비 상태로 띄울지 %j → %s', (input, expected) => {
    expect(shouldPrewarm(input)).toBe(expected);
  });
});

describe('영상 위에서도 밀어 넘기기 — 넘기기 판', () => {
  const { swipeBands, shouldCoverForSwipe, SWIPE_TOP, SWIPE_BOTTOM, SWIPE_HOLE } = require('../drivePlayer');

  // 390×645 칸에서 각 조각이 차지하는 사각형 (CSS 의 calc 를 같은 식으로 푼다)
  const solve = (value, size) => {
    const m = /^calc\(50% ([+-]) (\d+)px\)$/.exec(value);
    if (m) return size / 2 + (m[1] === '+' ? 1 : -1) * Number(m[2]);
    return Number(value.replace('px', ''));
  };
  const rects = (width, height, scale = 1) => swipeBands({ scale }).map((band) => ({
    key: band.key,
    x1: solve(band.left, width), x2: width - solve(band.right, width),
    y1: solve(band.top, height), y2: height - solve(band.bottom, height)
  }));
  const covered = (list, x, y) => list.some((r) => x >= r.x1 && x < r.x2 && y >= r.y1 && y < r.y2);

  it('가운데 재생 버튼 자리 · 맨 위 · 맨 아래 막대는 비우고, 나머지는 덮는다', () => {
    const list = rects(390, 645);
    // Drive 의 재생 버튼(가운데)
    expect(covered(list, 195, 322)).toBe(false);
    expect(covered(list, 195 - SWIPE_HOLE / 2 + 1, 322 - SWIPE_HOLE / 2 + 1)).toBe(false);
    // 아래 막대 · 오른쪽 위 버튼
    expect(covered(list, 30, 645 - SWIPE_BOTTOM + 1)).toBe(false);
    expect(covered(list, 370, SWIPE_TOP - 1)).toBe(false);
    // 사람들이 흔히 미는 자리 — 오른쪽 · 왼쪽 · 위아래 가운데
    [[330, 322], [60, 322], [195, 150], [195, 500], [20, SWIPE_TOP], [370, 645 - SWIPE_BOTTOM - 1]].forEach(([x, y]) => {
      expect(covered(list, x, y)).toBe(true);
    });
  });

  it('줄여 보인 플레이어(휴대폰)에서는 위·아래 비울 높이도 같은 비율로 준다 — 진행 막대가 판 밖에 있다', () => {
    // 412px 폭 휴대폰: 520px 로 그려 0.79 배로 보인다. 진행 막대는 바닥에서 102px(플레이어 px) → 화면에서 약 81px 위
    const scale = 412 / 520;
    const list = rects(412, 731, scale);
    expect(covered(list, 206, 731 - 81)).toBe(false);
    expect(covered(list, 206, 731 - 81 - 16)).toBe(false); // 손끝 여유
    expect(covered(list, 206, 731 - Math.round(SWIPE_BOTTOM * scale) - 1)).toBe(true);
    // '새 창에서 열기' 버튼(화면에서 위 40px 안)
    expect(covered(list, 390, 40)).toBe(false);
    // 줄이지 않은 플레이어(scale 1 · 모르는 값)는 그대로
    expect(swipeBands({ scale: 1 })).toEqual(swipeBands());
    expect(swipeBands({ scale: 0 })).toEqual(swipeBands());
  });

  it('조각끼리 겹치거나 틈이 나지 않는다 — 구멍 둘레를 정확히 두른다', () => {
    const [above, below, left, right] = rects(390, 645);
    expect(above.y2).toBe(left.y1);
    expect(left.y2).toBe(below.y1);
    expect(left.x2).toBe(195 - SWIPE_HOLE / 2);
    expect(right.x1).toBe(195 + SWIPE_HOLE / 2);
    expect(right.y1).toBe(left.y1);
  });

  it.each([
    [{ touch: true, canPage: true }, true],
    [{ touch: false, canPage: true }, false],   // 마우스 기기 — Drive 화면 어디든 눌려야 한다
    [{ touch: true, canPage: false }, false]    // 넘길 다른 장이 없다
  ])('판을 덮을지 %j → %s', (input, expected) => {
    expect(shouldCoverForSwipe(input)).toBe(expected);
  });
});
