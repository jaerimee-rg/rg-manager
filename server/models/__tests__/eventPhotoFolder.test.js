import { jest } from '@jest/globals';

// 사진 전용 폴더(photo-menu FR-517) — 무엇을 만들고, 어디서 빠지는지를 쿼리로 확인한다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn(), connect: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const Event = (await import('../Event.js')).default;

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [{ id: 50, title: '가을 소풍', date: '2026-09-27', options: '[]' }] });
});

const lastSql = () => pool.query.mock.calls.at(-1)[0];

describe('Event.createForPhotos — 사진 전용 폴더를 만든다', () => {
  it("type='folder' 로, 신청 없이, 앨범 범위는 모든 학부모로 만든다", async () => {
    const event = await Event.createForPhotos({ userId: 7, title: '가을 소풍', date: '2026-09-27' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/VALUES \(\$1, 'folder', \$2, \$3, '\[\]', FALSE, TRUE, FALSE, 'all', \$4, \$4\)/);
    expect(sql).toMatch(/"isPublished", "registrationOpen",\s+"albumAudience"/);
    expect(params.slice(0, 3)).toEqual([7, '가을 소풍', '2026-09-27']);
    // 앨범 공개는 하지 않는다 — albumPublished 는 컬럼 기본값(false) 그대로
    expect(sql).not.toMatch(/albumPublished/);
    expect(event).toMatchObject({ id: 50, options: [] });
  });
});

describe('Event.updateFolder — 사진 폴더의 이름·날짜 (FR-519)', () => {
  it("type='folder' 행만 고친다 — 같은 id 의 이벤트는 건드리지 못한다", async () => {
    await Event.updateFolder(50, { title: '가을 운동회', date: '2026-10-03' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE events SET title = \$1, date = \$2, "updatedAt" = \$3\s+WHERE id = \$4 AND type = 'folder'/);
    expect(params.slice(0, 2)).toEqual(['가을 운동회', '2026-10-03']);
    expect(params[3]).toBe(50);
  });

  it('고칠 행이 없으면 null', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await Event.updateFolder(31, { title: 'x', date: '2026-10-03' })).toBeNull();
  });
});

describe('사진 폴더는 이벤트 화면에 나오지 않는다', () => {
  it('선생님 이벤트 관리 목록(getAll)에서 뺀다 — 종류 필터가 있어도 없어도', async () => {
    await Event.getAll(7, 'user', { includePast: true });
    expect(lastSql()).toMatch(/e\.type <> 'folder'/);

    await Event.getAll(null, 'admin', { type: 'special', includePast: false, today: '2026-10-08' });
    expect(lastSql()).toMatch(/e\.type <> 'folder'/);
  });

  it('학부모 일정(다가오는 · 지난)에서 뺀다', async () => {
    await Event.listUpcomingForParent([7], '2026-10-08', '2026-12-31');
    expect(lastSql()).toMatch(/e\.type <> 'folder'/);

    await Event.listPastForParent([7], '2026-10-08');
    expect(lastSql()).toMatch(/e\.type <> 'folder'/);
  });

  it('학부모 단건 조회는 기본으로 빼고(이벤트 상세 · 신청), 앨범만 includeFolders 로 읽는다', async () => {
    await Event.getPublishedForParent(50, [7]);
    expect(lastSql()).toMatch(/e\.type <> 'folder'/);

    await Event.getPublishedForParent(50, [7], { includeFolders: true });
    expect(lastSql()).not.toMatch(/folder/);
  });

  it('학부모 사진 탭(listWithAlbumsForParent)과 선생님 사진 메뉴(listForPhotos)에는 남는다', async () => {
    await Event.listWithAlbumsForParent([7]);
    expect(lastSql()).not.toMatch(/folder/);

    await Event.listForPhotos(7);
    expect(lastSql()).not.toMatch(/folder/);
  });
});

describe('Event.removeAlbum — 이벤트 앨범만 지운다, 이벤트는 남긴다 (FR-519)', () => {
  let client;
  const sqls = () => client.query.mock.calls.map(([sql]) => sql);

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockReset();
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => {
      if (/^UPDATE events/.test(sql.trim())) return { rows: [{ id: 31, type: 'special', options: '[]', driveFolderId: null }] };
      if (/^DELETE FROM event_media/.test(sql.trim())) return { rowCount: 4, rows: [] };
      return { rows: [] };
    });
  });

  it('한 트랜잭션에서 앨범 컬럼을 앨범 만들기 전으로 돌리고, 그 이벤트의 사진 기록을 지운다', async () => {
    const result = await Event.removeAlbum(31);

    expect(sqls()[0]).toBe('BEGIN');
    expect(sqls().at(-1)).toBe('COMMIT');
    const update = sqls().find((sql) => /UPDATE events/.test(sql));
    for (const column of ['driveFolderId', 'driveFolderName', 'driveAccountId', 'albumCreatedAt', 'albumCheckedAt',
      'albumPublishedAt', 'albumCoverMediaIds', 'albumMatchRules']) {
      expect(update).toMatch(new RegExp(`"${column}" = NULL`));
    }
    expect(update).toMatch(/"albumStatus" = 'none'/);
    expect(update).toMatch(/"albumPublished" = FALSE/);
    expect(update).toMatch(/"albumAudience" = 'participants'/);
    expect(update).toMatch(/"albumUploadOpen" = TRUE/);
    // 사진 전용 폴더는 행째 지운다(delete) — 여기서 빈 행으로 남기지 않는다
    expect(update).toMatch(/WHERE id = \$1 AND type <> 'folder'/);
    // 이벤트 행·신청은 지우지 않는다
    expect(sqls().some((sql) => /DELETE FROM events|event_registrations|competition/.test(sql))).toBe(false);

    const [deleteSql, deleteParams] = client.query.mock.calls.find(([sql]) => /DELETE FROM event_media/.test(sql));
    expect(deleteSql).toMatch(/WHERE "eventId" = \$1/);
    expect(deleteParams).toEqual([31]);
    expect(result).toEqual({ event: expect.objectContaining({ id: 31, options: [] }), mediaCount: 4 });
    expect(client.release).toHaveBeenCalled();
  });

  it('지울 이벤트 앨범이 없으면(사진 폴더 · 없는 id) 아무것도 지우지 않고 null', async () => {
    client.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));

    expect(await Event.removeAlbum(50)).toBeNull();
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls().some((sql) => /DELETE FROM event_media/.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('도중에 실패하면 되돌리고 던진다', async () => {
    client.query.mockImplementation(async (sql) => {
      if (/^DELETE FROM event_media/.test(sql.trim())) throw new Error('boom');
      if (/^UPDATE events/.test(sql.trim())) return { rows: [{ id: 31, options: '[]' }] };
      return { rows: [] };
    });

    await expect(Event.removeAlbum(31)).rejects.toThrow('boom');
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls()).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
