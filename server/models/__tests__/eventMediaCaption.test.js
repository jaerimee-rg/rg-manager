import { jest } from '@jest/globals';

// 사진 설명 저장 — 다른 이벤트의 사진은 고치지 못하도록 쿼리가 이벤트까지 묶는지 본다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const EventMedia = (await import('../EventMedia.js')).default;

describe('EventMedia.setCaption', () => {
  beforeEach(() => pool.query.mockReset());

  it('사진 id 와 이벤트 id 가 함께 맞을 때만 바꾸고 바뀐 설명을 돌려준다', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 5, caption: '리본 연기' }] });

    const row = await EventMedia.setCaption(5, '리본 연기', 3);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE event_media SET caption = \$2/);
    expect(sql).toMatch(/WHERE id = \$1 AND "eventId" = \$4/);
    expect(params[0]).toBe(5);
    expect(params[1]).toBe('리본 연기');
    expect(params[3]).toBe(3);
    expect(row).toEqual({ id: 5, caption: '리본 연기' });
  });

  it('다른 이벤트의 사진이면 null', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await EventMedia.setCaption(5, '무대', 99)).toBeNull();
  });
});
