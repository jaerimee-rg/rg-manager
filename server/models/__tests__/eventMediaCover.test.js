import { jest } from '@jest/globals';

// 앨범 카드 미리보기 — 선생님이 고른 대표 사진이 맨 앞에 오고, 쓸 수 없는 대표 사진은 조건에서 빠진다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const EventMedia = (await import('../EventMedia.js')).default;

/** 미리보기 쿼리(대표 사진 순서를 매기는 것)에만 rows 를 주고, 개수 쿼리들은 빈 결과 */
const answer = (previewRows) => {
  pool.query.mockImplementation(async (sql) => (/albumCoverMediaId/.test(sql) ? { rows: previewRows } : { rows: [] }));
};
const previewSql = () => pool.query.mock.calls.map(([sql]) => sql).find((sql) => /albumCoverMediaId/.test(sql));

describe('앨범 카드 미리보기와 대표 사진', () => {
  beforeEach(() => pool.query.mockReset());

  it('대표 사진을 맨 앞에 두고 cover 로 알려 준다 (선생님 목록)', async () => {
    answer([
      { eventId: 31, driveFileId: 'c1', isCover: true },
      { eventId: 31, driveFileId: 'd1', isCover: false },
      { eventId: 32, driveFileId: 'd2', isCover: false }
    ]);

    const out = await EventMedia.summariesForTeacher([31, 32]);

    expect(out[31]).toMatchObject({ previews: ['c1', 'd1'], cover: 'c1' });
    expect(out[32]).toMatchObject({ previews: ['d2'], cover: null });
  });

  it('학부모 목록도 같은 표지 — 대표 사진이 미리보기 맨 앞', async () => {
    answer([{ eventId: 5, driveFileId: 'c9', isCover: true }, { eventId: 5, driveFileId: 'd8', isCover: false }]);

    const out = await EventMedia.summaries([5], { studentIds: [] });

    expect(out[5].previews).toEqual(['c9', 'd8']);
  });

  it('쿼리: 이 앨범의 준비된·숨기지 않은 사진 중에서만 고르고, 대표 사진을 CASE 로 먼저 세운다', async () => {
    answer([]);

    await EventMedia.summariesForTeacher([31]);

    const sql = previewSql();
    expect(sql).toMatch(/JOIN events e ON e\.id = m\."eventId"/);
    // 사진·영상을 가리지 않는다 — 영상도 대표가 된다
    expect(sql).not.toMatch(/kind/);
    expect(sql).toMatch(/m\.status = 'ready' AND NOT m\."isHidden" AND m\."driveFileId" IS NOT NULL/);
    // m.id = NULL 은 NULL — DESC 로 세우면 NULL 이 맨 앞에 와서 대표 사진이 없는 앨범의 순서가 흐트러진다
    expect(sql).toMatch(/ORDER BY CASE WHEN m\.id = e\."albumCoverMediaId" THEN 0 ELSE 1 END, m\."takenAt" DESC, m\.id DESC/);
    expect(sql).toMatch(/rn <= 4/);
    expect(sql).toMatch(/ORDER BY "eventId", rn/);
  });

  it('미리보기가 없는 앨범은 빈 목록과 cover null', async () => {
    answer([]);

    const out = await EventMedia.summariesForTeacher([31]);

    expect(out[31]).toMatchObject({ previews: [], cover: null });
  });

  it('앨범이 없으면 쿼리를 하지 않는다', async () => {
    expect(await EventMedia.summariesForTeacher([])).toEqual({});
    expect(pool.query).not.toHaveBeenCalled();
  });
});
