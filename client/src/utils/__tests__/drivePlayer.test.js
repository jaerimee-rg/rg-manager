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
