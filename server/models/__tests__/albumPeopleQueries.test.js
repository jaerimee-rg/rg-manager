import { jest } from '@jest/globals';

// 앨범 위 얼굴 목록이 쓰는 쿼리 — 묶을 얼굴·태그를 읽는 조건과, 한 사람의 사진만 거르는 조건. DB 없이 보낸 SQL 만 본다.
const query = jest.fn().mockResolvedValue({ rows: [] });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const { default: EventMedia } = await import('../EventMedia.js');
const { default: MediaFace } = await import('../MediaFace.js');
const { default: MediaTag } = await import('../MediaTag.js');

const squash = (sql) => sql.replace(/\s+/g, ' ').trim();
const lastCall = () => query.mock.calls.at(-1);

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [] });
});

describe('EventMedia.list — mediaIds (얼굴 목록에서 고른 사람)', () => {
  it('그 사진들만', async () => {
    await EventMedia.list(3, { mediaIds: [4, 9] });

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain('AND m.id = ANY($2::int[])');
    expect(params[1]).toEqual([4, 9]);
  });

  it('빈 목록이면 아무것도 — 거르기를 빼먹고 전부 보여 주지 않는다', async () => {
    await EventMedia.list(3, { mediaIds: [] });

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain('m.id = ANY($2::int[])');
    expect(params[1]).toEqual([]);
  });

  it('주지 않으면 거르지 않는다', async () => {
    await EventMedia.list(3, {});
    expect(squash(lastCall()[0])).not.toContain('m.id = ANY');
  });
});

describe('묶을 얼굴 · 태그 읽기', () => {
  it('MediaFace.listForAlbum — 올라간 사진의 얼굴만, 학부모 화면이면 숨긴 사진 빼고, 특징값은 풀어서', async () => {
    const descriptor = Buffer.from(new Float32Array(512).fill(0.5).buffer).toString('base64');
    query.mockResolvedValue({ rows: [{ id: 1, mediaId: 2, box: '{"x":0.1,"y":0.2,"w":0.3,"h":0.3}', score: 0.9, descriptor, driveFileId: 'f2' }] });

    const rows = await MediaFace.listForAlbum(3);

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain(`WHERE m."eventId" = $1 AND m.status = 'ready' AND m.kind = 'image' AND m."isHidden" = FALSE`);
    expect(params).toEqual([3]);
    expect(rows[0].box).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.3 });
    expect(rows[0].descriptor).toHaveLength(512);
    expect(rows[0].driveFileId).toBe('f2');
  });

  it('선생님 화면은 숨긴 사진도', async () => {
    await MediaFace.listForAlbum(3, { includeHidden: true });
    expect(squash(lastCall()[0])).not.toContain('isHidden');

    await MediaTag.listForAlbum(3, { includeHidden: true });
    expect(squash(lastCall()[0])).not.toContain('isHidden');
  });

  it('MediaTag.listForAlbum — 같은 조건, 묶는 데 필요한 칸만', async () => {
    await MediaTag.listForAlbum(3);

    const sql = squash(lastCall()[0]);
    expect(sql).toContain(`SELECT t."mediaId", t."studentId", t.source, t."faceId"`);
    expect(sql).toContain(`WHERE m."eventId" = $1 AND m.status = 'ready' AND m."isHidden" = FALSE`);
  });
});

describe('전체 사진 — 여러 앨범을 한 번에 (선생님 사진 메뉴)', () => {
  it('EventMedia.listAcross — 내 앨범들의 사진을 같은 조건·순서로, 고른 사람의 사진만 거를 수 있다', async () => {
    await EventMedia.listAcross([3, 5], { mediaIds: [4, 9], includeHidden: true, limit: 60 });

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain(`WHERE m."eventId" = ANY($1::int[]) AND m.status = 'ready' AND m.id = ANY($2::int[])`);
    expect(squash(sql)).toContain('ORDER BY m."takenAt" DESC, m.id DESC');
    expect(sql).not.toContain('isHidden');
    expect(params).toEqual([[3, 5], [4, 9], 60]);
  });

  it('EventMedia.listAcross — 커서는 앨범 하나와 같다(찍은 시각, id)', async () => {
    await EventMedia.listAcross([3, 5], { cursor: { takenAt: '2026-10-01T00:00:00Z', id: 40 } });

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain('(m."takenAt", m.id) < ($2, $3)');
    expect(squash(sql)).toContain('m."isHidden" = FALSE');
    expect(params).toEqual([[3, 5], '2026-10-01T00:00:00Z', 40, 60]);
  });

  it('EventMedia.list 는 그대로 앨범 하나', async () => {
    await EventMedia.list(3, {});
    expect(squash(lastCall()[0])).toContain(`WHERE m."eventId" = $1 AND m.status = 'ready'`);
    expect(lastCall()[1][0]).toBe(3);
  });

  it('MediaFace · MediaTag.listForAlbums — 같은 조건을 앨범 여러 개로', async () => {
    await MediaFace.listForAlbums([3, 5], { includeHidden: true });
    let [sql, params] = lastCall();
    expect(squash(sql)).toContain(`WHERE m."eventId" = ANY($1::int[]) AND m.status = 'ready' AND m.kind = 'image'`);
    expect(sql).not.toContain('isHidden');
    expect(params).toEqual([[3, 5]]);

    await MediaTag.listForAlbums([3, 5]);
    [sql, params] = lastCall();
    expect(squash(sql)).toContain(`WHERE m."eventId" = ANY($1::int[]) AND m.status = 'ready' AND m."isHidden" = FALSE`);
    expect(params).toEqual([[3, 5]]);
  });

  it('앨범이 없으면 쿼리 없이 빈 목록', async () => {
    await expect(EventMedia.listAcross([])).resolves.toEqual([]);
    await expect(MediaFace.listForAlbums([])).resolves.toEqual([]);
    await expect(MediaTag.listForAlbums([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('얼굴 목록에서 사람 빼기', () => {
  const client = { query: jest.fn() };

  beforeEach(() => {
    client.query.mockReset();
  });

  it('MediaTag.removeAutoTagsForFaces — 그 얼굴로 붙은 자동 태그(face·candidate)만, 트랜잭션 클라이언트로', async () => {
    client.query.mockResolvedValue({ rowCount: 2 });

    await expect(MediaTag.removeAutoTagsForFaces([11, 12], client)).resolves.toBe(2);

    const [sql, params] = client.query.mock.calls[0];
    expect(squash(sql)).toBe(`DELETE FROM media_tags WHERE "faceId" = ANY($1::int[]) AND source IN ('face', 'candidate')`);
    expect(params).toEqual([[11, 12]]);
    expect(query).not.toHaveBeenCalled();
  });

  it('MediaFace.deleteForAlbum — 이 앨범의 얼굴만 지우고, 지운 얼굴의 사진 id 를 돌려준다', async () => {
    client.query.mockResolvedValue({ rows: [{ mediaId: 4 }, { mediaId: 4 }, { mediaId: 7 }] });

    await expect(MediaFace.deleteForAlbum([11, 12, 13], 3, client)).resolves.toEqual([4, 4, 7]);

    const [sql, params] = client.query.mock.calls[0];
    expect(squash(sql)).toContain(`WHERE f.id = ANY($1::int[]) AND m.id = f."mediaId" AND m."eventId" = $2 RETURNING f."mediaId"`);
    expect(params).toEqual([[11, 12, 13], 3]);
  });

  it('EventMedia.refreshFaceCounts — 얼굴 수를 다시 세고, 0 이면 none, 분석 버전은 건드리지 않는다', async () => {
    client.query.mockResolvedValue({ rowCount: 2 });

    await expect(EventMedia.refreshFaceCounts([4, 7], client)).resolves.toBe(2);

    const [sql, params] = client.query.mock.calls[0];
    expect(squash(sql)).toContain(`SET "faceCount" = c.n, "faceStatus" = CASE WHEN c.n = 0 THEN 'none' ELSE m."faceStatus" END`);
    expect(sql).not.toContain('faceAnalyzerVersion');
    expect(params[0]).toEqual([4, 7]);
  });

  it('빈 목록이면 아무 쿼리도 보내지 않는다', async () => {
    await expect(MediaTag.removeAutoTagsForFaces([], client)).resolves.toBe(0);
    await expect(MediaFace.deleteForAlbum([], 3, client)).resolves.toEqual([]);
    await expect(EventMedia.refreshFaceCounts([], client)).resolves.toBe(0);
    expect(client.query).not.toHaveBeenCalled();
  });
});
