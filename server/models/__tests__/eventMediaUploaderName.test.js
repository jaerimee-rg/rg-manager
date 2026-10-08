import { jest } from '@jest/globals';

// 선생님 사진 화면의 "올린 사람" — 학부모가 정한 이름을 읽어 오는지 쿼리로 확인한다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const EventMedia = (await import('../EventMedia.js')).default;

describe('EventMedia.list — 올린 사람 이름', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 1, uploaderRole: 'parent', uploaderName: '예림엄마' }] });
  });

  it('학부모 계정의 학부모명(parent_accounts.displayName)을 username 보다 먼저 쓴다', async () => {
    const rows = await EventMedia.list(31, {});

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN parent_accounts pa ON pa\."userId" = m\."uploaderUserId"/);
    expect(sql).toContain(`COALESCE(NULLIF(pa."displayName", ''), NULLIF(u."displayName", ''), u.username) AS "uploaderName"`);
    expect(rows[0].uploaderName).toBe('예림엄마');
  });
});
