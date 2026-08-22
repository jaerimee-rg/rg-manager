import {
  isAdminViewing,
  isKakaoNotifyCooling,
  ADMIN_PRESENCE_WINDOW_MS,
  KAKAO_NOTIFY_COOLDOWN_MS
} from '../chatPresence.js';

const NOW = new Date('2026-08-22T10:00:00.000Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('isAdminViewing', () => {
  it('presence 를 보낸 적이 없으면 보고 있지 않은 것으로 본다', () => {
    expect(isAdminViewing(null, NOW)).toBe(false);
    expect(isAdminViewing(undefined, NOW)).toBe(false);
    expect(isAdminViewing('', NOW)).toBe(false);
  });

  it('하트비트 주기 안이면 보고 있는 중이다', () => {
    expect(isAdminViewing(ago(0), NOW)).toBe(true);
    expect(isAdminViewing(ago(20000), NOW)).toBe(true);
    expect(isAdminViewing(ago(ADMIN_PRESENCE_WINDOW_MS - 1), NOW)).toBe(true);
  });

  it('유효 시간이 지나면 자리를 비운 것으로 본다', () => {
    expect(isAdminViewing(ago(ADMIN_PRESENCE_WINDOW_MS), NOW)).toBe(false);
    expect(isAdminViewing(ago(ADMIN_PRESENCE_WINDOW_MS + 1000), NOW)).toBe(false);
    expect(isAdminViewing(ago(10 * 60 * 1000), NOW)).toBe(false);
  });

  it('깨진 시각 값은 보고 있지 않은 것으로 처리한다', () => {
    expect(isAdminViewing('not-a-date', NOW)).toBe(false);
  });

  it('시계가 어긋나 미래 시각이 들어와도 보고 있는 중으로 본다', () => {
    const future = new Date(NOW + 5000).toISOString();
    expect(isAdminViewing(future, NOW)).toBe(true);
  });
});

describe('isKakaoNotifyCooling', () => {
  it('보낸 적이 없으면 쿨다운이 아니다', () => {
    expect(isKakaoNotifyCooling(null, NOW)).toBe(false);
  });

  it('쿨다운 안에 보낸 알림이 있으면 건너뛴다', () => {
    expect(isKakaoNotifyCooling(ago(60 * 1000), NOW)).toBe(true);
    expect(isKakaoNotifyCooling(ago(KAKAO_NOTIFY_COOLDOWN_MS - 1), NOW)).toBe(true);
  });

  it('쿨다운이 지나면 다시 보낼 수 있다', () => {
    expect(isKakaoNotifyCooling(ago(KAKAO_NOTIFY_COOLDOWN_MS), NOW)).toBe(false);
    expect(isKakaoNotifyCooling(ago(30 * 60 * 1000), NOW)).toBe(false);
  });
});
