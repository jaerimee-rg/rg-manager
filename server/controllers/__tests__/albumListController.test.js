import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { listForPhotos: jest.fn(), createForPhotos: jest.fn() }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: { summariesForTeacher: jest.fn() }
}));
jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: { getByUserId: jest.fn() }
}));
jest.unstable_mockModule('../../utils/googleDrive.js', () => ({
  isDriveConfigured: jest.fn(() => true)
}));
jest.unstable_mockModule('../../services/eventService.js', () => ({
  todayKst: jest.fn(() => '2026-10-08')
}));

const Event = (await import('../../models/Event.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const { isDriveConfigured } = await import('../../utils/googleDrive.js');
const { listAlbums, createPhotoFolder } = await import('../albumListController.js');

const event = (overrides = {}) => ({
  id: 31, userId: 7, type: 'competition', title: '회장배 대회', date: '2026-10-12',
  driveFolderId: null, driveFolderName: null, albumStatus: 'none', albumUploadOpen: true,
  albumPublished: false, albumAudience: 'participants', albumPublishedAt: null,
  ...overrides
});

let req;
let res;

beforeEach(() => {
  jest.clearAllMocks();
  req = { user: { id: 7, role: 'user' } };
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  isDriveConfigured.mockReturnValue(true);
  GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'connected', googleEmail: 't@gmail.com', rootFolderName: 'RG Manager' });
  EventMedia.summariesForTeacher.mockResolvedValue({});
});

describe('GET /api/albums — 선생님 사진 목록 (docs/photo-menu 5.1)', () => {
  it('내 이벤트만 읽는다 (관리자 역할이어도 자기 것)', async () => {
    req.user.role = 'admin';
    Event.listForPhotos.mockResolvedValue([]);

    await listAlbums(req, res);

    expect(Event.listForPhotos).toHaveBeenCalledWith(7);
  });

  it('앨범이 있는 이벤트는 카드가 되고, 공개 상태·개수·썸네일을 준다', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ driveFolderId: 'f-31', driveFolderName: '2026-10-12 회장배 대회', albumStatus: 'ready', albumPublished: true, albumAudience: 'all', albumPublishedAt: 'p' }),
      event({ id: 35, title: '스페셜 클래스', date: '2026-11-02', type: 'special' })
    ]);
    EventMedia.summariesForTeacher.mockResolvedValue({ 31: { images: 42, videos: 3, hidden: 1, fromParents: 5, previews: ['d1', 'd2'] } });

    await listAlbums(req, res);

    expect(EventMedia.summariesForTeacher).toHaveBeenCalledWith([31]);
    const { albums } = res.json.mock.calls[0][0];
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      eventId: 31, folderName: '2026-10-12 회장배 대회', published: true, audience: 'all', publishedAt: 'p',
      counts: { images: 42, videos: 3, hidden: 1, fromParents: 5 }
    });
    expect(albums[0].previews[0]).toContain('d1');
  });

  it('[사진 올리기] 목록은 앨범 유무와 상관없이 전부 — 앨범 없는 이벤트는 만들 폴더 이름을 미리 준다', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ id: 35, title: '스페셜: 리본', date: '2026-11-02', type: 'special' }),
      event({ driveFolderId: 'f-31', driveFolderName: '2026-10-12 회장배 대회', albumPublished: true })
    ]);
    EventMedia.summariesForTeacher.mockResolvedValue({ 31: { images: 40, videos: 5 } });

    await listAlbums(req, res);

    const { targets } = res.json.mock.calls[0][0];
    expect(targets).toEqual([
      expect.objectContaining({ eventId: 35, hasAlbum: false, count: 0, upcoming: true, folderName: '2026-11-02 스페셜 리본' }),
      expect.objectContaining({ eventId: 31, hasAlbum: true, published: true, count: 45, upcoming: true, folderName: '2026-10-12 회장배 대회' })
    ]);
  });

  it('지난 이벤트는 upcoming=false', async () => {
    Event.listForPhotos.mockResolvedValue([event({ date: '2026-08-30' })]);

    await listAlbums(req, res);

    expect(res.json.mock.calls[0][0].targets[0].upcoming).toBe(false);
  });

  it('Google 연결 상태를 함께 준다 — Google 은 부르지 않는다', async () => {
    Event.listForPhotos.mockResolvedValue([]);

    await listAlbums(req, res);

    expect(res.json.mock.calls[0][0].drive).toEqual({
      configured: true, connected: true, status: 'connected', email: 't@gmail.com', rootFolderName: 'RG Manager'
    });
  });

  it('연결 전이면 connected:false, status:none', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);
    Event.listForPhotos.mockResolvedValue([]);

    await listAlbums(req, res);

    expect(res.json.mock.calls[0][0].drive).toMatchObject({ connected: false, status: 'none', email: null });
  });

  it('DB 오류는 500', async () => {
    Event.listForPhotos.mockRejectedValue(new Error('x'));

    await listAlbums(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('POST /api/albums — 사진 전용 폴더 만들기 (docs/photo-menu FR-517)', () => {
  beforeEach(() => {
    Event.listForPhotos.mockResolvedValue([]);
    Event.createForPhotos.mockImplementation(async ({ userId, title, date }) => event({
      id: 50, userId, title, date, type: 'folder', albumAudience: 'all'
    }));
  });

  it('이름과 날짜로 사진 폴더를 만들고, 업로드 시트가 쓸 target 한 줄을 201 로 준다', async () => {
    req.body = { title: '  가을 소풍  ', date: '2026-09-27' };

    await createPhotoFolder(req, res);

    expect(Event.createForPhotos).toHaveBeenCalledWith({ userId: 7, title: '가을 소풍', date: '2026-09-27' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      created: true,
      target: expect.objectContaining({
        eventId: 50, title: '가을 소풍', date: '2026-09-27', type: 'folder',
        hasAlbum: false, published: false, count: 0, upcoming: false, folderName: '2026-09-27 가을 소풍'
      })
    });
  });

  it('같은 이름·날짜의 내 사진 폴더가 이미 있으면 새로 만들지 않고 그것을 준다 (두 번 눌러도 하나)', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ id: 51, type: 'folder', title: '가을 소풍', date: '2026-09-27', driveFolderId: 'f-51', driveFolderName: '2026-09-27 가을 소풍', albumPublished: true, albumAudience: 'all' })
    ]);
    EventMedia.summariesForTeacher.mockResolvedValue({ 51: { images: 12, videos: 1 } });
    req.body = { title: '가을 소풍', date: '2026-09-27' };

    await createPhotoFolder(req, res);

    expect(Event.createForPhotos).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      created: false,
      target: expect.objectContaining({ eventId: 51, type: 'folder', hasAlbum: true, published: true, count: 13 })
    });
  });

  it('이름·날짜가 같은 **이벤트**에는 붙이지 않는다 — 새 폴더는 이벤트와 따로다', async () => {
    Event.listForPhotos.mockResolvedValue([event({ id: 31, title: '회장배 대회', date: '2026-10-12', type: 'competition' })]);
    req.body = { title: '회장배 대회', date: '2026-10-12' };

    await createPhotoFolder(req, res);

    expect(Event.createForPhotos).toHaveBeenCalledWith({ userId: 7, title: '회장배 대회', date: '2026-10-12' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('날짜가 같아도 이름이 다르면 새로 만든다', async () => {
    Event.listForPhotos.mockResolvedValue([event({ type: 'folder', title: '가을 소풍', date: '2026-09-27' })]);
    req.body = { title: '가을 소풍 2부', date: '2026-09-27' };

    await createPhotoFolder(req, res);

    expect(Event.createForPhotos).toHaveBeenCalled();
  });

  it.each([
    ['이름 없음', { date: '2026-09-27' }, '폴더 이름을 입력해 주세요.'],
    ['공백 이름', { title: '   ', date: '2026-09-27' }, '폴더 이름을 입력해 주세요.'],
    ['101자 이름', { title: '가'.repeat(101), date: '2026-09-27' }, '이름은 100자 이내로 입력해 주세요.'],
    ['날짜 없음', { title: '가을 소풍' }, '날짜를 선택해 주세요.'],
    ['형식이 다른 날짜', { title: '가을 소풍', date: '2026/09/27' }, '날짜를 선택해 주세요.'],
    ['없는 날짜', { title: '가을 소풍', date: '2026-02-31' }, '날짜를 선택해 주세요.'],
    ['13월', { title: '가을 소풍', date: '2026-13-01' }, '날짜를 선택해 주세요.'],
    ['32일', { title: '가을 소풍', date: '2026-09-32' }, '날짜를 선택해 주세요.'],
    ['0일', { title: '가을 소풍', date: '2026-09-00' }, '날짜를 선택해 주세요.']
  ])('%s → 400', async (_label, body, message) => {
    req.body = body;

    await createPhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: message });
    expect(Event.createForPhotos).not.toHaveBeenCalled();
  });

  it('body 가 없어도 400 (500 이 아니다)', async () => {
    req.body = undefined;

    await createPhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('DB 오류는 500', async () => {
    Event.createForPhotos.mockRejectedValue(new Error('x'));
    req.body = { title: '가을 소풍', date: '2026-09-27' };

    await createPhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
