import { jest } from '@jest/globals';

// 같은 파일 건너뛰기 — 앨범에 올라가 있는(ready) 파일 중 크기가 맞는 것만 읽는지 본다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const EventMedia = (await import('../EventMedia.js')).default;

describe('EventMedia.listReadyNamesBySize', () => {
  beforeEach(() => pool.query.mockReset());

  it('이 앨범의 ready 행 중 크기가 맞는 것의 이름·크기만 읽는다 (숨김 여부는 따지지 않는다)', async () => {
    pool.query.mockResolvedValue({ rows: [{ originalName: 'a.jpg', size: '1000' }] });

    const rows = await EventMedia.listReadyNamesBySize(3, [1000, 2000]);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/SELECT "originalName", size FROM event_media/);
    expect(sql).toMatch(/"eventId" = \$1 AND status = 'ready' AND size = ANY\(\$2::bigint\[\]\)/);
    expect(sql).not.toMatch(/isHidden/);
    expect(params).toEqual([3, [1000, 2000]]);
    expect(rows).toEqual([{ originalName: 'a.jpg', size: '1000' }]);
  });

  it('같은 크기는 한 번만, 숫자가 아니거나 0 이하인 크기는 빼고 묻는다', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await EventMedia.listReadyNamesBySize(3, [1000, '1000', undefined, -1, 0, 'x', 1.5]);

    expect(pool.query.mock.calls[0][1]).toEqual([3, [1000]]);
  });

  it('물어볼 크기가 없으면 DB 에 가지 않는다', async () => {
    expect(await EventMedia.listReadyNamesBySize(3, [undefined, null])).toEqual([]);
    expect(await EventMedia.listReadyNamesBySize(3, [])).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
