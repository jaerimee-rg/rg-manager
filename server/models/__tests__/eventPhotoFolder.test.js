import { jest } from '@jest/globals';

// 사진 전용 폴더(photo-menu FR-517) — 무엇을 만들고, 어디서 빠지는지를 쿼리로 확인한다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

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
