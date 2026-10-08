import { jest } from '@jest/globals';

// 앨범의 자동 태그를 어떤 규칙으로 계산했는지 적어 두는 칸(events."albumMatchRules"). DB 없이 보낸 SQL 만 본다.
const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const Event = (await import('../Event.js')).default;

const squash = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Event — albumMatchRules', () => {
  it('setAlbumMatchRules — 규칙만 적고 updatedAt 은 건드리지 않는다(앨범을 열었다고 이벤트가 수정된 것은 아니다)', async () => {
    await Event.setAlbumMatchRules(3, 'r2:0.35:0.4');

    const [sql, params] = query.mock.calls[0];
    expect(squash(sql)).toBe('UPDATE events SET "albumMatchRules" = $2 WHERE id = $1');
    expect(sql).not.toContain('updatedAt');
    expect(params).toEqual([3, 'r2:0.35:0.4']);
  });

  it('invalidateAlbumMatches — 그 선생님의 앨범만 "다시 매칭해야 함" 으로 돌린다', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 4 });

    await expect(Event.invalidateAlbumMatches(7)).resolves.toBe(4);

    const [sql, params] = query.mock.calls[0];
    expect(squash(sql)).toBe('UPDATE events SET "albumMatchRules" = NULL WHERE "userId" = $1 AND "albumMatchRules" IS NOT NULL');
    expect(params).toEqual([7]);
  });
});
