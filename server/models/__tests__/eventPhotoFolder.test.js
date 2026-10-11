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

describe('Event.updateAlbumEvent — 이벤트 앨범의 이름·날짜 (FR-519, 2026-10-11)', () => {
  let client;
  const sqls = () => client.query.mock.calls.map(([sql]) => sql);
  const eventRow = (overrides = {}) => ({ id: 4, type: 'competition', title: '제13회 샤인컵', date: '2026-04-06', competitionId: 6, options: '[]', ...overrides });

  beforeEach(() => {
    client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockReset();
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation(async (sql) => (/^UPDATE events/.test(sql.trim()) ? { rows: [eventRow()] } : { rows: [] }));
  });

  it('한 트랜잭션에서 이벤트의 제목·날짜·종료일과 대회 행의 이름·날짜를 함께 고친다', async () => {
    const result = await Event.updateAlbumEvent(4, { title: '제13회 샤인컵', date: '2026-04-06', endDate: null });

    expect(sqls()[0]).toBe('BEGIN');
    expect(sqls().at(-1)).toBe('COMMIT');
    const [eventSql, eventParams] = client.query.mock.calls.find(([sql]) => /UPDATE events/.test(sql));
    expect(eventSql).toMatch(/SET title = \$1, date = \$2, "endDate" = \$3, "updatedAt" = \$4/);
    // 사진 전용 폴더·휴관일은 건드리지 못한다
    expect(eventSql).toMatch(/WHERE id = \$5 AND type IN \('competition', 'special'\)/);
    // 장소·옵션·신청·공개 여부는 그대로다
    expect(eventSql).not.toMatch(/location|options|isPublished|registration/);
    expect(eventParams).toEqual(['제13회 샤인컵', '2026-04-06', null, expect.any(String), 4]);

    const [compSql, compParams] = client.query.mock.calls.find(([sql]) => /UPDATE competitions/.test(sql));
    expect(compSql).toMatch(/SET name = \$1, date = \$2 WHERE id = \$3/);
    expect(compSql).not.toMatch(/location/);
    expect(compParams).toEqual(['제13회 샤인컵', '2026-04-06', 6]);
    expect(result).toMatchObject({ id: 4, title: '제13회 샤인컵', options: [] });
    expect(client.release).toHaveBeenCalled();
  });

  it('대회 행이 없는 스페셜은 이벤트만 고친다', async () => {
    client.query.mockImplementation(async (sql) => (/^UPDATE events/.test(sql.trim())
      ? { rows: [eventRow({ type: 'special', competitionId: null })] } : { rows: [] }));

    await Event.updateAlbumEvent(4, { title: '봄 캠프', date: '2026-05-30', endDate: '2026-06-01' });

    expect(sqls().some((sql) => /competitions/.test(sql))).toBe(false);
    expect(client.query.mock.calls.find(([sql]) => /UPDATE events/.test(sql))[1].slice(0, 3)).toEqual(['봄 캠프', '2026-05-30', '2026-06-01']);
    expect(sqls().at(-1)).toBe('COMMIT');
  });

  it('고칠 이벤트 앨범이 없으면(사진 폴더 · 휴관일 · 없는 id) 되돌리고 null', async () => {
    client.query.mockImplementation(async () => ({ rows: [] }));

    expect(await Event.updateAlbumEvent(50, { title: 'x', date: '2026-10-03' })).toBeNull();
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls().some((sql) => /competitions/.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it('대회 행을 고치다 실패하면 이벤트도 되돌리고 던진다', async () => {
    client.query.mockImplementation(async (sql) => {
      if (/^UPDATE competitions/.test(sql.trim())) throw new Error('boom');
      if (/^UPDATE events/.test(sql.trim())) return { rows: [eventRow()] };
      return { rows: [] };
    });

    await expect(Event.updateAlbumEvent(4, { title: 'x', date: '2026-10-03' })).rejects.toThrow('boom');
    expect(sqls()).toContain('ROLLBACK');
    expect(sqls()).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
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
