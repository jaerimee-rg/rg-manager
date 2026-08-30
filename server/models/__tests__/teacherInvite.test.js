import { jest } from '@jest/globals';

// 모델은 DB 를 쓰지만 statusOf/isUsable 은 순수 함수라 pool 만 대체하면 된다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const TeacherInvite = (await import('../TeacherInvite.js')).default;

const NOW = Date.parse('2026-08-30T00:00:00.000Z');

describe('TeacherInvite.statusOf — 초대 상태는 컬럼이 아니라 파생된다', () => {
  it('아무 표시도 없으면 대기', () => {
    expect(TeacherInvite.statusOf({ expiresAt: '2026-09-13T00:00:00.000Z' }, NOW)).toBe('pending');
    expect(TeacherInvite.statusOf({ expiresAt: null }, NOW)).toBe('pending');
  });

  it('사용됐으면 used', () => {
    expect(TeacherInvite.statusOf({ usedAt: '2026-08-20T00:00:00.000Z' }, NOW)).toBe('used');
  });

  it('회수는 사용보다 앞선다', () => {
    expect(
      TeacherInvite.statusOf({ usedAt: '2026-08-20T00:00:00.000Z', revokedAt: '2026-08-21T00:00:00.000Z' }, NOW)
    ).toBe('revoked');
  });

  it('만료 시각이 지났으면 expired', () => {
    expect(TeacherInvite.statusOf({ expiresAt: '2026-08-29T23:59:59.000Z' }, NOW)).toBe('expired');
  });

  it('만료 시각을 읽을 수 없으면 만료로 보지 않는다', () => {
    expect(TeacherInvite.statusOf({ expiresAt: '언젠가' }, NOW)).toBe('pending');
  });

  it('초대가 없으면 invalid', () => {
    expect(TeacherInvite.statusOf(null, NOW)).toBe('invalid');
  });
});

describe('TeacherInvite.isUsable', () => {
  it('대기 상태에서만 가입할 수 있다', () => {
    expect(TeacherInvite.isUsable({ expiresAt: null }, NOW)).toBe(true);
    expect(TeacherInvite.isUsable({ usedAt: '2026-08-01T00:00:00.000Z' }, NOW)).toBe(false);
    expect(TeacherInvite.isUsable({ revokedAt: '2026-08-01T00:00:00.000Z' }, NOW)).toBe(false);
    expect(TeacherInvite.isUsable({ expiresAt: '2026-08-01T00:00:00.000Z' }, NOW)).toBe(false);
    expect(TeacherInvite.isUsable(null, NOW)).toBe(false);
  });
});
