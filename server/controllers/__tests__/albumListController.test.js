import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: {
    listForPhotos: jest.fn(), createForPhotos: jest.fn(),
    getById: jest.fn(), updateFolder: jest.fn(), delete: jest.fn(), removeAlbum: jest.fn()
  }
}));
jest.unstable_mockModule('../../services/albumService.js', () => ({
  default: { syncFolderName: jest.fn() }
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

jest.unstable_mockModule('../../models/AlbumView.js', () => ({
  default: {
    viewsByMedia: jest.fn().mockResolvedValue({}),
    countsByEvent: jest.fn().mockResolvedValue({})
  }
}));

const Event = (await import('../../models/Event.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const AlbumView = (await import('../../models/AlbumView.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const { isDriveConfigured } = await import('../../utils/googleDrive.js');
const albumService = (await import('../../services/albumService.js')).default;
const { listAlbums, createPhotoFolder, updatePhotoFolder, deletePhotoFolder } = await import('../albumListController.js');

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

  it('대표 사진이 한 장이면 표지 전체 크기, 여러 장이면 칸 크기로 자르지 않은 주소와 보일 부분을 고른 순서대로 — 없으면 빈 목록이라 최근 4장을 쓴다', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ driveFolderId: 'f-31', albumStatus: 'ready' }),
      event({ id: 32, driveFolderId: 'f-32', albumStatus: 'ready' }),
      event({ id: 33, driveFolderId: 'f-33', albumStatus: 'ready' })
    ]);
    EventMedia.summariesForTeacher.mockResolvedValue({
      31: { images: 3, previews: ['c1', 'd1', 'd2'], covers: [{ driveFileId: 'c1', crop: { x: 40, y: 20, zoom: 1.2 } }] },
      32: { images: 4, previews: ['c3', 'c2', 'd3'], covers: [{ driveFileId: 'c3', crop: null }, { driveFileId: 'c2', crop: null }] },
      33: { images: 2, previews: ['d4', 'd5'], covers: [] }
    });

    await listAlbums(req, res);

    const { albums } = res.json.mock.calls[0][0];
    expect(albums[0].covers).toEqual(['https://lh3.googleusercontent.com/d/c1=w1200-rw']);
    expect(albums[0].coverCrops).toEqual([{ x: 40, y: 20, zoom: 1.2 }]);
    expect(albums[1].covers).toEqual([
      'https://lh3.googleusercontent.com/d/c3=s800-rw',
      'https://lh3.googleusercontent.com/d/c2=s800-rw'
    ]);
    expect(albums[1].coverCrops).toEqual([null, null]);
    expect(albums[2].covers).toEqual([]);
    expect(albums[2].coverCrops).toEqual([]);
    expect(albums[2].previews).toHaveLength(2);
  });

  it('카드마다 학부모가 그 앨범(폴더)을 연 횟수 · 사진을 크게 본 횟수 — 기록이 없으면 0', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ driveFolderId: 'f-31', albumStatus: 'ready' }),
      event({ id: 32, driveFolderId: 'f-32', albumStatus: 'ready' })
    ]);
    EventMedia.summariesForTeacher.mockResolvedValue({});
    AlbumView.countsByEvent.mockResolvedValue({ 31: { albumOpens: 6, mediaViews: 21 } });

    await listAlbums(req, res);

    expect(AlbumView.countsByEvent).toHaveBeenCalledWith([31, 32]);
    const albums = res.json.mock.calls[0][0].albums;
    expect(albums.map((album) => [album.albumOpens, album.mediaViews])).toEqual([[6, 21], [0, 0]]);
    expect(albums[0]).not.toHaveProperty('viewers');
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

  it('[사진 올리기] 목록은 처음 공개한 날도 준다 — 사진 폴더는 처음 공개할 때만 학부모에게 알림이 간다', async () => {
    Event.listForPhotos.mockResolvedValue([
      event({ id: 51, type: 'folder', driveFolderId: 'f-51', albumPublished: false, albumPublishedAt: '2026-10-11T01:00:00Z' }),
      event({ id: 52, type: 'folder', driveFolderId: 'f-52', albumPublished: false })
    ]);

    await listAlbums(req, res);

    const { targets } = res.json.mock.calls[0][0];
    expect(targets.map((t) => [t.eventId, t.publishedAt])).toEqual([[51, '2026-10-11T01:00:00Z'], [52, null]]);
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

// ───────── 사진 전용 폴더 고치기 · 지우기 (docs/photo-menu FR-519) ─────────

const folder = (overrides = {}) => event({
  id: 50, type: 'folder', title: '가을 소풍', date: '2026-09-27', albumAudience: 'all',
  driveFolderId: 'f-50', driveFolderName: '2026-09-27 가을 소풍', albumStatus: 'ready',
  ...overrides
});

describe('PATCH /api/albums/:id — 사진 폴더 이름·날짜 고치기 (FR-519)', () => {
  beforeEach(() => {
    req.params = { id: '50' };
    req.body = { title: '가을 운동회', date: '2026-10-03' };
    Event.getById.mockResolvedValue(folder());
    Event.listForPhotos.mockResolvedValue([folder()]);
    Event.updateFolder.mockImplementation(async (id, { title, date }) => folder({ id, title, date }));
    albumService.syncFolderName.mockResolvedValue({ renamed: true, name: '2026-10-03 가을 운동회' });
  });

  it('이름·날짜를 고치고 Drive 폴더 이름도 따라 바꾼다', async () => {
    await updatePhotoFolder(req, res);

    expect(Event.getById).toHaveBeenCalledWith(50, 7, 'user');
    expect(Event.updateFolder).toHaveBeenCalledWith(50, { title: '가을 운동회', date: '2026-10-03' });
    // 바뀌기 전 · 후를 넘겨 폴더 이름이 달라졌을 때만 Drive 를 부르게 한다
    expect(albumService.syncFolderName).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ title: '가을 소풍', date: '2026-09-27' }),
      expect.objectContaining({ title: '가을 운동회', date: '2026-10-03', driveFolderId: 'f-50' })
    );
    expect(res.json).toHaveBeenCalledWith({
      eventId: 50, title: '가을 운동회', date: '2026-10-03',
      expectedFolderName: '2026-10-03 가을 운동회',
      driveFolderName: '2026-10-03 가을 운동회',
      driveRenamed: true
    });
  });

  it('이름 앞뒤 공백은 떼고 저장한다', async () => {
    req.body = { title: '  가을 운동회  ', date: '2026-10-03' };

    await updatePhotoFolder(req, res);

    expect(Event.updateFolder).toHaveBeenCalledWith(50, { title: '가을 운동회', date: '2026-10-03' });
  });

  it('Drive 이름 바꾸기가 실패해도 저장은 끝난 것이다 — driveRenamed:false 로 알린다', async () => {
    albumService.syncFolderName.mockResolvedValue({ renamed: false, error: 'invalid_grant' });

    await updatePhotoFolder(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({
      title: '가을 운동회', driveRenamed: false,
      driveFolderName: '2026-09-27 가을 소풍', expectedFolderName: '2026-10-03 가을 운동회'
    });
  });

  it('아직 Drive 폴더가 없는 폴더(첫 업로드 전)는 바꿀 것이 없다 — driveRenamed:true', async () => {
    Event.getById.mockResolvedValue(folder({ driveFolderId: null, driveFolderName: null }));
    Event.updateFolder.mockImplementation(async (id, { title, date }) => folder({ id, title, date, driveFolderId: null, driveFolderName: null }));
    albumService.syncFolderName.mockResolvedValue({ renamed: false });

    await updatePhotoFolder(req, res);

    expect(res.json.mock.calls[0][0]).toMatchObject({ driveRenamed: true, driveFolderName: null });
  });

  it('같은 이름·날짜의 다른 폴더가 있으면 409 — 새 폴더 만들기가 헷갈리지 않게', async () => {
    Event.listForPhotos.mockResolvedValue([folder(), folder({ id: 51, title: '가을 운동회', date: '2026-10-03' })]);

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].reason).toBe('folder_exists');
    expect(Event.updateFolder).not.toHaveBeenCalled();
  });

  it('이름·날짜가 같은 **이벤트**가 있는 것은 괜찮다 — 폴더끼리만 겹침을 본다', async () => {
    Event.listForPhotos.mockResolvedValue([folder(), event({ id: 31, title: '가을 운동회', date: '2026-10-03', type: 'special' })]);

    await updatePhotoFolder(req, res);

    expect(Event.updateFolder).toHaveBeenCalled();
  });

  it('자기 자신과 같은 값(바꾸지 않고 저장)은 겹침이 아니다', async () => {
    req.body = { title: '가을 소풍', date: '2026-09-27' };

    await updatePhotoFolder(req, res);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(Event.updateFolder).toHaveBeenCalled();
  });

  it('이벤트 앨범은 고치지 않는다 — 이벤트 관리가 맡는다', async () => {
    Event.getById.mockResolvedValue(event({ id: 31, type: 'competition' }));
    req.params = { id: '31' };

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('not_photo_folder');
    expect(Event.updateFolder).not.toHaveBeenCalled();
  });

  it('남의 폴더·없는 폴더는 404', async () => {
    Event.getById.mockResolvedValue(null);

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Event.updateFolder).not.toHaveBeenCalled();
  });

  it.each([
    ['이름 없음', { title: ' ', date: '2026-10-03' }],
    ['101자 이름', { title: '가'.repeat(101), date: '2026-10-03' }],
    ['없는 날짜', { title: '가을 운동회', date: '2026-02-31' }],
    ['날짜 없음', { title: '가을 운동회' }]
  ])('%s → 400', async (_label, body) => {
    req.body = body;

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Event.updateFolder).not.toHaveBeenCalled();
  });

  it('숫자가 아닌 id 는 404', async () => {
    req.params = { id: 'abc' };

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Event.getById).not.toHaveBeenCalled();
  });

  it('DB 오류는 500', async () => {
    Event.updateFolder.mockRejectedValue(new Error('x'));

    await updatePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('DELETE /api/albums/:id — 사진 폴더 지우기 (FR-519, 이벤트 앨범 포함)', () => {
  beforeEach(() => {
    req.params = { id: '50' };
    Event.getById.mockResolvedValue(folder());
    Event.delete.mockResolvedValue(folder());
  });

  it('폴더를 지우고, Drive 폴더는 그대로 남는다고 알려 준다', async () => {
    await deletePhotoFolder(req, res);

    expect(Event.delete).toHaveBeenCalledWith(50, 7, 'user');
    expect(res.json).toHaveBeenCalledWith({
      deleted: true, driveFolderKept: true, driveFolderName: '2026-09-27 가을 소풍'
    });
  });

  it('Drive 폴더가 없던 폴더는 남는 것이 없다', async () => {
    Event.getById.mockResolvedValue(folder({ driveFolderId: null, driveFolderName: null }));
    Event.delete.mockResolvedValue(folder({ driveFolderId: null, driveFolderName: null }));

    await deletePhotoFolder(req, res);

    expect(res.json).toHaveBeenCalledWith({ deleted: true, driveFolderKept: false, driveFolderName: null });
  });

  it.each(['competition', 'special'])('이벤트 앨범(%s)은 앨범만 비운다 — 이벤트 행은 지우지 않는다', async (type) => {
    Event.getById.mockResolvedValue(event({ id: 31, type, driveFolderId: 'f-31', driveFolderName: '2026-09-05 우면산 무 장애 길 러닝' }));
    Event.removeAlbum.mockResolvedValue({ event: event({ id: 31, type }), mediaCount: 0 });
    req.params = { id: '31' };

    await deletePhotoFolder(req, res);

    expect(Event.getById).toHaveBeenCalledWith(31, 7, 'user');
    expect(Event.removeAlbum).toHaveBeenCalledWith(31);
    // 신청·참가 학생·대회 행이 걸린 이벤트 자체는 이벤트 관리에서만 지운다
    expect(Event.delete).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      deleted: true, eventKept: true, driveFolderKept: true, driveFolderName: '2026-09-05 우면산 무 장애 길 러닝'
    });
  });

  it('관리자는 다른 선생님의 이벤트 앨범도 지운다 (앨범 화면과 같은 범위)', async () => {
    req.user = { id: 1, role: 'admin' };
    Event.getById.mockResolvedValue(event({ id: 31, userId: 7, driveFolderId: 'f-31' }));
    Event.removeAlbum.mockResolvedValue({ event: event({ id: 31 }), mediaCount: 3 });
    req.params = { id: '31' };

    await deletePhotoFolder(req, res);

    expect(Event.getById).toHaveBeenCalledWith(31, 1, 'admin');
    expect(Event.removeAlbum).toHaveBeenCalledWith(31);
  });

  it('앨범이 없는 이벤트(휴관일 포함)는 지울 사진 폴더가 없다 — 404 no_album', async () => {
    for (const type of ['competition', 'closure']) {
      Event.removeAlbum.mockClear();
      res.status.mockClear();
      Event.getById.mockResolvedValue(event({ id: 31, type, driveFolderId: null }));

      await deletePhotoFolder(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls.at(-1)[0].reason).toBe('no_album');
      expect(Event.removeAlbum).not.toHaveBeenCalled();
      expect(Event.delete).not.toHaveBeenCalled();
    }
  });

  it('그 사이 이벤트가 지워졌으면 404', async () => {
    Event.getById.mockResolvedValue(event({ id: 31, driveFolderId: 'f-31' }));
    Event.removeAlbum.mockResolvedValue(null);

    await deletePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('사진 폴더는 행째 지운다 — 앨범만 비우는 길로 가지 않는다', async () => {
    await deletePhotoFolder(req, res);

    expect(Event.delete).toHaveBeenCalled();
    expect(Event.removeAlbum).not.toHaveBeenCalled();
  });

  it('이벤트 앨범을 비우다 DB 오류가 나면 500', async () => {
    Event.getById.mockResolvedValue(event({ id: 31, driveFolderId: 'f-31' }));
    Event.removeAlbum.mockRejectedValue(new Error('x'));

    await deletePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('남의 폴더·없는 폴더는 404', async () => {
    Event.getById.mockResolvedValue(null);

    await deletePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(Event.delete).not.toHaveBeenCalled();
  });

  it('DB 오류는 500', async () => {
    Event.delete.mockRejectedValue(new Error('x'));

    await deletePhotoFolder(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
