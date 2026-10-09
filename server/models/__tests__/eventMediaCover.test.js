import { jest } from '@jest/globals';

// 앨범 카드 미리보기 — 선생님이 고른 대표 사진들(최대 4장)이 고른 순서대로 맨 앞에 오고, 쓸 수 없는 것은 조건에서 빠진다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const EventMedia = (await import('../EventMedia.js')).default;

/** 미리보기 쿼리(대표 사진 순서를 매기는 것)에만 rows 를 주고, 개수 쿼리들은 빈 결과 */
const answer = (previewRows) => {
  pool.query.mockImplementation(async (sql) => (/albumCoverMediaIds/.test(sql) ? { rows: previewRows } : { rows: [] }));
};
const previewSql = () => pool.query.mock.calls.map(([sql]) => sql).find((sql) => /albumCoverMediaIds/.test(sql));

describe('앨범 카드 미리보기와 대표 사진', () => {
  beforeEach(() => pool.query.mockReset());

  it('대표 사진들을 고른 순서로 맨 앞에 두고 covers 로 알려 준다 (선생님 목록)', async () => {
    answer([
      { eventId: 31, driveFileId: 'c2', coverCrop: { x: 20, y: 80, zoom: 1.5 }, isCover: true },
      { eventId: 31, driveFileId: 'c1', coverCrop: null, isCover: true },
      { eventId: 31, driveFileId: 'd1', coverCrop: { x: 1, y: 1, zoom: 1 }, isCover: false },
      { eventId: 32, driveFileId: 'd2', isCover: false }
    ]);

    const out = await EventMedia.summariesForTeacher([31, 32]);

    // 대표 사진은 보일 부분과 함께 — 대표가 아닌 사진의 보일 부분은 쓰이지 않는다
    expect(out[31]).toMatchObject({
      previews: ['c2', 'c1', 'd1'],
      covers: [{ driveFileId: 'c2', crop: { x: 20, y: 80, zoom: 1.5 } }, { driveFileId: 'c1', crop: null }]
    });
    expect(out[32]).toMatchObject({ previews: ['d2'], covers: [] });
  });

  it('학부모 목록도 같은 표지 — covers 와 맨 앞 미리보기', async () => {
    answer([{ eventId: 5, driveFileId: 'c9', isCover: true }, { eventId: 5, driveFileId: 'd8', isCover: false }]);

    const out = await EventMedia.summaries([5], { studentIds: [] });

    expect(out[5]).toMatchObject({ previews: ['c9', 'd8'], covers: [{ driveFileId: 'c9', crop: null }] });
  });

  it('쿼리: 이 앨범의 준비된·숨기지 않은 사진 중에서만, 고른 순서(array_position)대로 먼저 세운다', async () => {
    answer([]);

    await EventMedia.summariesForTeacher([31]);

    const sql = previewSql();
    expect(sql).toMatch(/JOIN events e ON e\.id = m\."eventId"/);
    expect(sql).toMatch(/m\."coverCrop"/);
    expect(sql).toMatch(/m\.status = 'ready' AND NOT m\."isHidden" AND m\."driveFileId" IS NOT NULL/);
    expect(sql).toMatch(/\(m\.id = ANY\(e\."albumCoverMediaIds"\)\) IS TRUE AS "isCover"/);
    // 대표가 아닌 사진은 array_position 이 NULL — 뒤로 보내야 대표 사진이 없는 앨범도 최근 순 그대로다
    expect(sql).toMatch(/ORDER BY array_position\(e\."albumCoverMediaIds", m\.id\) ASC NULLS LAST, m\."takenAt" DESC, m\.id DESC/);
    expect(sql).toMatch(/rn <= 4/);
    expect(sql).toMatch(/ORDER BY "eventId", rn/);
    // 사진·영상을 가리지 않는다 — 영상도 대표가 된다
    expect(sql).not.toMatch(/kind/);
  });

  it('미리보기가 없는 앨범은 빈 목록', async () => {
    answer([]);

    const out = await EventMedia.summariesForTeacher([31]);

    expect(out[31]).toMatchObject({ previews: [], covers: [] });
  });

  it('앨범이 없으면 쿼리를 하지 않는다', async () => {
    expect(await EventMedia.summariesForTeacher([])).toEqual({});
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('EventMedia.coverRows · coverableIds — 저장된 대표 사진 중 지금도 쓸 수 있는 것', () => {
  beforeEach(() => pool.query.mockReset());

  it('coverRows: 썸네일에 쓸 종류·Drive 파일 id · 보일 부분과 함께, 저장된 순서 그대로', async () => {
    pool.query.mockResolvedValue({ rows: [
      { id: 4, kind: 'image', driveFileId: 'd4', coverCrop: null },
      { id: 9, kind: 'video', driveFileId: 'v9', coverCrop: { x: 10, y: 90, zoom: 2 } }
    ] });

    expect(await EventMedia.coverRows(3, [9, 4])).toEqual([
      { id: 9, kind: 'video', driveFileId: 'v9', coverCrop: { x: 10, y: 90, zoom: 2 } },
      { id: 4, kind: 'image', driveFileId: 'd4', coverCrop: null }
    ]);
    expect(pool.query.mock.calls[0][0]).toMatch(/SELECT id, kind, "driveFileId", "coverCrop" FROM event_media/);
  });

  it('setCoverCrops: 이 앨범의 사진만, 한 번에 — null 은 "고르지 않음"', async () => {
    pool.query.mockResolvedValue({ rowCount: 2 });

    expect(await EventMedia.setCoverCrops(3, { 9: { x: 10, y: 90, zoom: 2 }, 4: null })).toBe(2);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE event_media m SET "coverCrop" = NULLIF\(c\.value, 'null'::jsonb\)/);
    expect(sql).toMatch(/FROM jsonb_each\(\$2::jsonb\) c/);
    expect(sql).toMatch(/WHERE m\."eventId" = \$1 AND m\.id = c\.key::int/);
    expect(params[0]).toBe(3);
    expect(JSON.parse(params[1])).toEqual({ 9: { x: 10, y: 90, zoom: 2 }, 4: null });
  });

  it('setCoverCrops: 적을 것이 없으면 쿼리를 하지 않는다', async () => {
    expect(await EventMedia.setCoverCrops(3, {})).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('이 앨범의 준비된·숨기지 않은 것만, 저장된 순서 그대로(중복은 한 번)', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 4 }, { id: 9 }] });

    expect(await EventMedia.coverableIds(3, [9, 7, 4, 9])).toEqual([9, 4]);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/"eventId" = \$1 AND id = ANY\(\$2::int\[\]\)/);
    expect(sql).toMatch(/status = 'ready' AND NOT "isHidden" AND "driveFileId" IS NOT NULL/);
    expect(params).toEqual([3, [9, 7, 4, 9]]);
  });

  it.each([[null], [undefined], [[]]])('저장된 것이 없으면(%p) 쿼리 없이 빈 목록', async (ids) => {
    expect(await EventMedia.coverableIds(3, ids)).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
