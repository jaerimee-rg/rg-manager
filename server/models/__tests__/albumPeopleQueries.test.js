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
