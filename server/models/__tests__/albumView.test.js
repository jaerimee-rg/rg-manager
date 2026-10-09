import { jest } from '@jest/globals';

jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const { default: AlbumView, VIEW_DEDUPE_MS } = await import('../AlbumView.js');

beforeEach(() => pool.query.mockReset());

describe('AlbumView — 학부모가 본 기록', () => {
  it('같은 사람·같은 대상이 창 안에 이미 있으면 남기지 않는다 — 앨범 30분, 사진 10분', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1 }] });
    const now = new Date('2026-10-09T10:00:00.000Z');

    expect(await AlbumView.record({ eventId: 3, mediaId: 41, userId: 9, kind: 'media', now })).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE NOT EXISTS/);
    expect(sql).toMatch(/"mediaId" IS NOT DISTINCT FROM \$2 AND "createdAt" >= \$6/);
    expect(params).toEqual([3, 41, 9, 'media', now.toISOString(), new Date(now.getTime() - VIEW_DEDUPE_MS.media).toISOString()]);
    expect(VIEW_DEDUPE_MS).toEqual({ album: 30 * 60 * 1000, media: 10 * 60 * 1000 });
  });

  it('창 안에 이미 있으면(삽입 0행) false · 앨범 열기는 mediaId 없음', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    expect(await AlbumView.record({ eventId: 3, userId: 9, kind: 'album' })).toBe(false);
    expect(pool.query.mock.calls[0][1][1]).toBeNull();
  });

  it('보기 통계 — 본 학부모 수 · 앨범 연 횟수 · 사진 본 횟수, 빈 값은 0', async () => {
    pool.query.mockResolvedValue({ rows: [{ viewers: 4, albumOpens: 6, mediaViews: null }] });
    expect(await AlbumView.albumStats(3)).toEqual({ viewers: 4, albumOpens: 6, mediaViews: 0 });
    expect(pool.query.mock.calls[0][0]).toMatch(/COUNT\(DISTINCT "userId"\)/);
  });

  it('앨범마다 본 학부모 수 · 사진마다 본 횟수 — 빈 목록이면 쿼리 없이 {}', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ eventId: 3, viewers: 2 }] });
    expect(await AlbumView.viewersByEvent([3, 4])).toEqual({ 3: 2 });
    pool.query.mockResolvedValueOnce({ rows: [{ mediaId: 41, views: 5 }] });
    expect(await AlbumView.viewsByMedia([41])).toEqual({ 41: 5 });
    expect(await AlbumView.viewersByEvent([])).toEqual({});
    expect(await AlbumView.viewsByMedia([])).toEqual({});
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('많이 본 사진 — 지금 있는 사진만, 본 횟수 순', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    await AlbumView.topViewed(3, 4);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/m\.status = 'ready'/);
    expect(sql).toMatch(/ORDER BY views DESC/);
    expect(params).toEqual([3, 4]);
  });

  it('관리자 로그: 최근 것부터, kind 로 거른다', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [{ n: 7 }] });

    expect(await AlbumView.adminLog({ limit: 20, offset: 40, kind: 'media' })).toEqual({ rows: [{ id: 1 }], total: 7 });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/WHERE v\.kind = \$3/);
    expect(sql).toMatch(/ORDER BY v\."createdAt" DESC, v\.id DESC/);
    expect(sql).toMatch(/LEFT JOIN event_media m ON m\.id = v\."mediaId"/);
    expect(params).toEqual([20, 40, 'media']);
    expect(pool.query.mock.calls[1]).toEqual([expect.stringMatching(/WHERE v\.kind = \$1/), ['media']]);
  });
});
