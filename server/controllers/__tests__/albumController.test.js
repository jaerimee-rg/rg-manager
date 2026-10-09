import { jest } from '@jest/globals';

// 얼굴 목록에서 사람을 뺄 때 쓰는 트랜잭션 클라이언트
const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
jest.unstable_mockModule('../../database.js', () => ({ default: { connect: jest.fn(async () => mockClient), query: jest.fn() } }));
jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { getById: jest.fn(), updateAlbum: jest.fn() }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: {
    stats: jest.fn().mockResolvedValue({ images: 0, videos: 0, hidden: 0, untagged: 0, candidates: 0, unanalyzed: 0, totalSize: 0 }),
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    setHidden: jest.fn().mockResolvedValue(2),
    setCaption: jest.fn(),
    coverableIds: jest.fn().mockResolvedValue([]),
    coverRows: jest.fn().mockResolvedValue([]),
    setCoverCrops: jest.fn().mockResolvedValue(0),
    listUnanalyzed: jest.fn().mockResolvedValue([]),
    refreshFaceCounts: jest.fn().mockResolvedValue(0)
  }
}));
jest.unstable_mockModule('../../models/MediaFace.js', () => ({
  default: {
    listByMediaIds: jest.fn().mockResolvedValue({}),
    listForAlbum: jest.fn().mockResolvedValue([]),
    deleteForAlbum: jest.fn().mockResolvedValue([])
  }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listByMediaIds: jest.fn().mockResolvedValue({}),
    listForAlbum: jest.fn().mockResolvedValue([]),
    removeAutoTagsForFaces: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({ studentId: 5, source: 'manual' })
  }
}));
jest.unstable_mockModule('../../models/Student.js', () => ({
  default: { getByIds: jest.fn().mockResolvedValue([]) }
}));
jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: { getByUserId: jest.fn() }
}));
jest.unstable_mockModule('../../models/ParentInvite.js', () => ({
  default: { getOrCreate: jest.fn(), isUsable: jest.fn() }
}));
jest.unstable_mockModule('../../services/albumService.js', () => ({
  default: {
    createAlbumFolder: jest.fn(),
    ensureAlbum: jest.fn(),
    countViewers: jest.fn().mockResolvedValue({ participants: 7, all: 33 }),
    renameAlbumFolder: jest.fn(),
    refreshAlbum: jest.fn(),
    createUploadSessions: jest.fn(),
    completeUpload: jest.fn(),
    indexFaces: jest.fn(),
    rematchAlbum: jest.fn(),
    ensureAlbumsMatched: jest.fn().mockResolvedValue(0),
    deleteMedia: jest.fn()
  }
}));
jest.unstable_mockModule('../../utils/googleDrive.js', () => {
  class DriveError extends Error {
    constructor(code, message) { super(message); this.name = 'DriveError'; this.code = code; }
  }
  return {
    DriveError,
    isDriveConfigured: jest.fn(() => true),
    getStorageQuota: jest.fn().mockResolvedValue({ limit: 15e9, usage: 1e9, remaining: 14e9 })
  };
});
jest.unstable_mockModule('../../services/driveAccess.js', () => ({
  getAccessToken: jest.fn().mockResolvedValue({ ok: true, accessToken: 'at' })
}));

jest.unstable_mockModule('../../models/AlbumView.js', () => ({
  default: {
    viewsByMedia: jest.fn().mockResolvedValue({}),
    albumStats: jest.fn().mockResolvedValue({ viewers: 0, albumOpens: 0, mediaViews: 0 }),
    topViewed: jest.fn().mockResolvedValue([]),
    viewersByEvent: jest.fn().mockResolvedValue({})
  }
}));

const Event = (await import('../../models/Event.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const MediaFace = (await import('../../models/MediaFace.js')).default;
const Student = (await import('../../models/Student.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const ParentInvite = (await import('../../models/ParentInvite.js')).default;
const albumService = (await import('../../services/albumService.js')).default;
const AlbumView = (await import('../../models/AlbumView.js')).default;
const { DriveError } = await import('../../utils/googleDrive.js');
const {
  getAlbum, createAlbum, updateAlbum, listMedia, listPeople, deletePerson, createUploads, completeUpload,
  bulkAction, addTag, updateMedia, deleteMedia, listUnanalyzed, saveFaces, analysisImageUrl
} = await import('../albumController.js');

const teacher = { id: 7, username: '이재림', role: 'user' };

const event = (overrides = {}) => ({
  id: 3, userId: 7, type: 'competition', title: '서울시 대회', date: '2026-09-12',
  driveFolderId: 'folder-1', driveFolderName: '2026-09-12 서울시 대회', driveAccountId: 11,
  albumStatus: 'ready', albumUploadOpen: true, isPublished: true,
  ...overrides
});

let req;
let res;

beforeEach(() => {
  jest.clearAllMocks();
  req = { body: {}, params: { id: '3' }, query: {}, user: { ...teacher } };
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'connected', googleEmail: 'a@b.com' });
  ParentInvite.getOrCreate.mockResolvedValue({ id: 5, userId: 7, token: 'inv-tok' });
  ParentInvite.isUsable.mockReturnValue(true);
});

describe('getAlbum', () => {
  it('남의 이벤트는 존재 여부도 알려주지 않는다', async () => {
    Event.getById.mockResolvedValue(null);

    await getAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('앨범이 없으면 기본 폴더 이름을 제안한다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null, albumStatus: 'none' }));

    await getAlbum(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.albumStatus).toBe('none');
    expect(payload.defaultFolderName).toBe('2026-09-12 서울시 대회');
  });

  it('앨범이 있으면 통계와 폴더 주소를 준다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.stats.mockResolvedValue({ images: 27, videos: 3, hidden: 1, untagged: 4, candidates: 2, unanalyzed: 5, totalSize: 1234 });

    await getAlbum(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.counts).toMatchObject({ images: 27, videos: 3, unanalyzed: 5 });
    expect(payload.folderUrl).toContain('folder-1');
    expect(payload.drive).toMatchObject({ connected: true, status: 'connected' });
  });

  it('선생님이 Google 계정을 바꿨으면 이전 앨범임을 알려준다', async () => {
    Event.getById.mockResolvedValue(event({ driveAccountId: 9 }));
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'connected' });

    await getAlbum(req, res);

    expect(res.json.mock.calls[0][0].foreignAccount).toBe(true);
  });
});

describe('getAlbum — 학부모에게 보낼 사진 폴더 링크 (docs/photo-menu FR-518)', () => {
  it('학부모 앨범 주소에 이 앨범 주인 선생님의 초대 토큰을 붙여 준다', async () => {
    Event.getById.mockResolvedValue(event({ userId: 9 }));
    req.user = { id: 1, username: '관리자', role: 'admin' };   // 관리자가 봐도 앨범 주인의 초대다

    await getAlbum(req, res);

    expect(ParentInvite.getOrCreate).toHaveBeenCalledWith(9);
    expect(res.json.mock.calls[0][0].sharePath).toBe('/parent/photos/3?invite=inv-tok');
  });

  it('초대가 만료됐으면 초대 없는 주소만 준다 — 이미 가입한 학부모에게는 그대로 쓸 수 있다', async () => {
    Event.getById.mockResolvedValue(event());
    ParentInvite.isUsable.mockReturnValue(false);

    await getAlbum(req, res);

    expect(res.json.mock.calls[0][0].sharePath).toBe('/parent/photos/3');
  });

  it('초대를 읽지 못해도 앨범 화면은 뜬다', async () => {
    Event.getById.mockResolvedValue(event());
    ParentInvite.getOrCreate.mockRejectedValue(new Error('db'));

    await getAlbum(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ eventId: 3, sharePath: '/parent/photos/3' });
  });

  it('토큰에 주소에 못 쓰는 글자가 있어도 깨지지 않게 인코딩한다', async () => {
    Event.getById.mockResolvedValue(event());
    ParentInvite.getOrCreate.mockResolvedValue({ id: 5, userId: 7, token: 'a b&c' });

    await getAlbum(req, res);

    expect(res.json.mock.calls[0][0].sharePath).toBe('/parent/photos/3?invite=a%20b%26c');
  });
});

describe('getAlbum — 공개 단계 (docs/photo-menu)', () => {
  it('공개 여부·범위·공개하면 볼 인원·기대 폴더 이름을 준다', async () => {
    Event.getById.mockResolvedValue(event({ albumPublished: true, albumAudience: 'all', albumPublishedAt: '2026-10-13T01:00:00Z' }));

    await getAlbum(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      published: true,
      audience: 'all',
      publishedAt: '2026-10-13T01:00:00Z',
      expectedFolderName: '2026-09-12 서울시 대회',
      viewerCounts: { participants: 7, all: 33 }
    });
    expect(albumService.countViewers).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it('공개 칸이 없던 앨범은 비공개 · 참가 확정 학부모로 본다', async () => {
    Event.getById.mockResolvedValue(event());

    await getAlbum(req, res);

    expect(res.json.mock.calls[0][0]).toMatchObject({ published: false, audience: 'participants', publishedAt: null });
  });

  it('학부모가 올린 수·선생님이 올린 수를 함께 준다(필터 칩)', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.stats.mockResolvedValue({ images: 40, videos: 5, hidden: 1, fromParents: 5, fromTeacher: 41, untagged: 0, candidates: 0, unanalyzed: 0, totalSize: 9 });

    await getAlbum(req, res);

    expect(res.json.mock.calls[0][0].counts).toMatchObject({ fromParents: 5, fromTeacher: 41 });
  });
});

describe('getAlbum · listMedia — 학부모 보기 통계', () => {
  it('앨범에 본 학부모 수 · 앨범 연 횟수 · 사진 본 횟수와 많이 본 사진을 싣는다', async () => {
    Event.getById.mockResolvedValue(event());
    AlbumView.albumStats.mockResolvedValue({ viewers: 5, albumOpens: 9, mediaViews: 31 });
    AlbumView.topViewed.mockResolvedValue([{ id: 41, kind: 'image', driveFileId: 'd41', views: 12 }]);

    await getAlbum(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(AlbumView.albumStats).toHaveBeenCalledWith(3);
    expect(payload.viewStats).toEqual({ viewers: 5, albumOpens: 9, mediaViews: 31 });
    expect(payload.topViewed).toEqual([{ id: 41, kind: 'image', views: 12, thumbnailUrl: 'https://lh3.googleusercontent.com/d/d41=w400-h400-c-rw' }]);
  });

  it('앨범이 아직 없으면 통계를 읽지 않는다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    await getAlbum(req, res);
    expect(AlbumView.albumStats).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].viewStats).toBeUndefined();
  });

  it('사진마다 학부모가 크게 본 횟수(viewCount)', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.list.mockResolvedValue([{ id: 41, kind: 'image', driveFileId: 'd41', takenAt: 't', uploaderRole: 'teacher' }]);
    AlbumView.viewsByMedia.mockResolvedValue({ 41: 7 });

    await listMedia(req, res);

    expect(AlbumView.viewsByMedia).toHaveBeenCalledWith([41]);
    expect(res.json.mock.calls[0][0].items[0].viewCount).toBe(7);
  });
});

describe('createAlbum', () => {
  it('이름을 보내지 않으면 이벤트에서 이름을 만든다(YYYY-MM-DD 이벤트명)', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null, title: '회장배: 리듬체조/대회' }));
    albumService.createAlbumFolder.mockResolvedValue({
      event: { driveFolderId: 'f-2', driveFolderName: '2026-09-12 회장배 리듬체조 대회', albumStatus: 'ready', albumPublished: false },
      shared: true
    });

    await createAlbum(req, res);

    expect(albumService.createAlbumFolder).toHaveBeenCalledWith(7, expect.anything(), '2026-09-12 회장배 리듬체조 대회');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].published).toBe(false);
  });

  it('이름을 받아 폴더를 만든다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    albumService.createAlbumFolder.mockResolvedValue({
      event: { ...event(), driveFolderId: 'new-folder', albumStatus: 'ready' }, shared: true
    });
    req.body = { folderName: '2026-09-12 서울시 대회' };

    await createAlbum(req, res);

    expect(albumService.createAlbumFolder).toHaveBeenCalledWith(7, expect.anything(), '2026-09-12 서울시 대회');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('휴관일에는 앨범을 만들 수 없다', async () => {
    Event.getById.mockResolvedValue(event({ type: 'closure', driveFolderId: null }));

    await createAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('closure_event');
  });

  it('이미 앨범이 있으면 막는다', async () => {
    Event.getById.mockResolvedValue(event());

    await createAlbum(req, res);

    expect(res.json.mock.calls[0][0].reason).toBe('already_exists');
  });

  it('쓸 수 없는 이름은 만들기 전에 막는다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    req.body = { folderName: 'a/b' };

    await createAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(albumService.createAlbumFolder).not.toHaveBeenCalled();
  });

  it('Drive 가 연결되지 않았으면 설정으로 안내한다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    albumService.createAlbumFolder.mockRejectedValue(new DriveError('not_connected', '연결 없음'));

    await createAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('Google Drive');
  });

  it('용량이 부족하면 그 사유를 알려준다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    albumService.createAlbumFolder.mockRejectedValue(new DriveError('quota', '용량 부족'));

    await createAlbum(req, res);

    expect(res.json.mock.calls[0][0].reason).toBe('quota');
  });
});

describe('updateAlbum', () => {
  it('업로드 받기를 끌 수 있다', async () => {
    Event.getById.mockResolvedValue(event());
    Event.updateAlbum.mockResolvedValue(event({ albumUploadOpen: false }));
    req.body = { albumUploadOpen: false };

    await updateAlbum(req, res);

    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumUploadOpen: false });
    expect(res.json.mock.calls[0][0].albumUploadOpen).toBe(false);
  });

  it('앨범이 없으면 막는다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    req.body = { albumUploadOpen: false };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('공개하면 처음 공개한 시각을 남긴다', async () => {
    Event.getById.mockResolvedValue(event());
    Event.updateAlbum.mockImplementation(async (id, fields) => event(fields));
    req.body = { published: true };

    await updateAlbum(req, res);

    const fields = Event.updateAlbum.mock.calls[0][1];
    expect(fields.albumPublished).toBe(true);
    expect(fields.albumPublishedAt).toEqual(expect.any(String));
    expect(res.json.mock.calls[0][0]).toMatchObject({ published: true });
  });

  it('다시 공개해도 처음 공개한 시각은 그대로다', async () => {
    Event.getById.mockResolvedValue(event({ albumPublishedAt: '2026-10-13T01:00:00Z' }));
    Event.updateAlbum.mockImplementation(async (id, fields) => event({ albumPublishedAt: '2026-10-13T01:00:00Z', ...fields }));
    req.body = { published: true };

    await updateAlbum(req, res);

    expect(Event.updateAlbum.mock.calls[0][1]).toEqual({ albumPublished: true });
  });

  it('비공개로 돌린다', async () => {
    Event.getById.mockResolvedValue(event({ albumPublished: true }));
    Event.updateAlbum.mockImplementation(async (id, fields) => event(fields));
    req.body = { published: false };

    await updateAlbum(req, res);

    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumPublished: false });
    expect(res.json.mock.calls[0][0].published).toBe(false);
  });

  it('공개 범위를 바꾼다', async () => {
    Event.getById.mockResolvedValue(event());
    Event.updateAlbum.mockImplementation(async (id, fields) => event(fields));
    req.body = { audience: 'all' };

    await updateAlbum(req, res);

    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumAudience: 'all' });
    expect(res.json.mock.calls[0][0].audience).toBe('all');
  });

  it('사진 전용 폴더는 "참가 확정" 범위로 바꿀 수 없다 — 신청한 학생이 없다 (FR-517)', async () => {
    Event.getById.mockResolvedValue(event({ type: 'folder', albumAudience: 'all' }));
    req.body = { audience: 'participants' };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('folder_audience');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('사진 전용 폴더도 공개·비공개와 "모든 학부모" 는 그대로 된다', async () => {
    Event.getById.mockResolvedValue(event({ type: 'folder', albumAudience: 'all' }));
    Event.updateAlbum.mockResolvedValue(event({ type: 'folder', albumAudience: 'all', albumPublished: true }));
    req.body = { published: true, audience: 'all' };

    await updateAlbum(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, expect.objectContaining({ albumPublished: true, albumAudience: 'all' }));
  });

  it('모르는 공개 범위는 거절한다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { audience: 'everyone' };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('invalid_audience');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('Drive 에서 폴더가 사라진 앨범은 공개할 수 없다', async () => {
    Event.getById.mockResolvedValue(event({ albumStatus: 'missing' }));
    req.body = { published: true };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('album_missing');
  });
});

describe('updateAlbum — 대표 사진 (사진 목록 카드의 표지, 최대 4장)', () => {
  const media = (overrides = {}) => ({ id: 41, eventId: 3, status: 'ready', isHidden: false, driveFileId: 'd-41', ...overrides });
  // 저장된 대표 사진 중 지금도 쓸 수 있는 것 — 테스트마다 정한다
  const current = (ids) => EventMedia.coverableIds.mockResolvedValue(ids);

  beforeEach(() => {
    Event.updateAlbum.mockImplementation(async (id, fields) => event(fields));
    current([]);
  });

  it('{addCoverMediaId} 는 지금 목록 끝에 붙인다 — 고른 순서가 표지 순서', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [7, 8] }));
    current([7, 8]);
    EventMedia.getById.mockResolvedValue(media());
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(EventMedia.coverableIds).toHaveBeenCalledWith(3, [7, 8]);
    expect(EventMedia.getById).toHaveBeenCalledWith(41);
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [7, 8, 41] });
    expect(res.json.mock.calls[0][0].coverMediaIds).toEqual([7, 8, 41]);
  });

  it('영상도 대표로 고를 수 있다 — 카드에는 Drive 가 만든 한 장면이 뜬다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue(media({ id: 42, kind: 'video', driveFileId: 'v-42' }));
    req.body = { addCoverMediaId: 42 };

    await updateAlbum(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [42] });
  });

  it('이미 대표인 사진을 다시 붙여도 그대로다 — 사진을 읽지 않는다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [41] }));
    current([41]);
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(EventMedia.getById).not.toHaveBeenCalled();
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [41] });
  });

  it('4장이 차 있으면 409 covers_full — 하나를 먼저 풀어야 한다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [1, 2, 3, 4] }));
    current([1, 2, 3, 4]);
    EventMedia.getById.mockResolvedValue(media());
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].reason).toBe('covers_full');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('저장된 것 중 숨겼거나 지운 것은 세지 않는다 — 그 자리에 새로 고를 수 있고, 저장할 때 치워진다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [1, 2, 3, 4] }));
    current([1, 3, 4]);   // 2 는 숨겼다
    EventMedia.getById.mockResolvedValue(media());
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [1, 3, 4, 41] });
  });

  it('{removeCoverMediaId} 는 빼고, 남은 것이 없으면 NULL 로 비운다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [41, 9] }));
    current([41, 9]);
    req.body = { removeCoverMediaId: 41 };

    await updateAlbum(req, res);
    expect(Event.updateAlbum).toHaveBeenLastCalledWith(3, { albumCoverMediaIds: [9] });
    expect(res.json.mock.calls[0][0].coverMediaIds).toEqual([9]);

    current([9]);
    req.body = { removeCoverMediaId: 9 };
    await updateAlbum(req, res);
    expect(Event.updateAlbum).toHaveBeenLastCalledWith(3, { albumCoverMediaIds: null });
    expect(EventMedia.getById).not.toHaveBeenCalled();
  });

  it.each([
    ['다른 앨범의 사진', media({ eventId: 99 })],
    ['아직 올리는 중인 사진', media({ status: 'uploading' })],
    ['Drive 파일이 없는 행', media({ driveFileId: null })],
    ['없는 사진', null]
  ])('%s 은 고를 수 없다 (400 invalid_cover)', async (_label, row) => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue(row);
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('invalid_cover');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it.each([['문자열', '41'], ['0', 0], ['소수', 4.5], ['참/거짓', true], ['null', null]])(
    'id 가 %s 이면 아무것도 읽지 않고 거절한다', async (_label, value) => {
      Event.getById.mockResolvedValue(event());
      for (const body of [{ addCoverMediaId: value }, { removeCoverMediaId: value }]) {
        res.status.mockClear();
        req.body = body;
        await updateAlbum(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(EventMedia.coverableIds).not.toHaveBeenCalled();
      expect(EventMedia.getById).not.toHaveBeenCalled();
      expect(Event.updateAlbum).not.toHaveBeenCalled();
    }
  );

  it('숨긴 사진은 고를 수 없다 — 표지는 학부모 카드에도 쓰인다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue(media({ isHidden: true }));
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('hidden_cover');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('잘못 고르면 같은 요청의 폴더 이름 바꾸기(Drive)도 하지 않는다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue(media({ eventId: 99 }));
    req.body = { addCoverMediaId: 41, folderName: '새 이름' };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(albumService.renameAlbumFolder).not.toHaveBeenCalled();
  });

  it('Google 연결이 끊겨도 바꿀 수 있다 — Drive 를 부르지 않는다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'error' });
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue(media());
    req.body = { addCoverMediaId: 41 };

    await updateAlbum(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [41] });
  });

  it('대표 사진을 건드리지 않는 PATCH 는 그 칸을 쓰지 않는다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [41] }));
    current([41]);
    req.body = { published: true };

    await updateAlbum(req, res);

    expect(Event.updateAlbum.mock.calls[0][1]).not.toHaveProperty('albumCoverMediaIds');
    expect(res.json.mock.calls[0][0].coverMediaIds).toEqual([41]);
  });

  it('getAlbum 은 지금 쓸 수 있는 대표 사진 목록(고른 순서)·썸네일·보일 부분과 최대 장수를 준다', async () => {
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [41, 2, 7] }));
    EventMedia.coverRows.mockResolvedValue([
      { id: 7, kind: 'video', driveFileId: 'v-7', coverCrop: { x: 20, y: 30, zoom: 2 } },
      { id: 41, kind: 'image', driveFileId: 'd-41', coverCrop: null }
    ]);

    await getAlbum(req, res);

    expect(EventMedia.coverRows).toHaveBeenCalledWith(3, [41, 2, 7]);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      coverMediaIds: [7, 41],
      covers: [
        { id: 7, kind: 'video', driveFileId: 'v-7', thumbnailUrl: 'https://lh3.googleusercontent.com/d/v-7=w400-h400-c-rw', crop: { x: 20, y: 30, zoom: 2 } },
        { id: 41, kind: 'image', driveFileId: 'd-41', thumbnailUrl: 'https://lh3.googleusercontent.com/d/d-41=w400-h400-c-rw', crop: null }
      ],
      maxCovers: 4
    });
  });
});

describe('updateAlbum — 대표 사진 통째로 바꾸기 (고르기에서 한 번에 · 순서 바꾸기)', () => {
  beforeEach(() => {
    Event.updateAlbum.mockImplementation(async (id, fields) => event(fields));
    Event.getById.mockResolvedValue(event({ albumCoverMediaIds: [1, 2, 3] }));
  });

  it('{coverMediaIds} 를 그 순서 그대로 저장한다 — 순서 바꾸기', async () => {
    EventMedia.coverableIds.mockResolvedValue([3, 1, 2]);
    req.body = { coverMediaIds: [3, 1, 2] };

    await updateAlbum(req, res);

    expect(EventMedia.coverableIds).toHaveBeenCalledWith(3, [3, 1, 2]);
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [3, 1, 2] });
    expect(res.json.mock.calls[0][0].coverMediaIds).toEqual([3, 1, 2]);
  });

  it('지금 대표와 상관없이 고른 것으로 바꾼다 — 고르기에서 한 번에 정하기', async () => {
    EventMedia.coverableIds.mockResolvedValue([9, 8]);
    req.body = { coverMediaIds: [9, 8] };

    await updateAlbum(req, res);

    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [9, 8] });
  });

  it('빈 목록이면 모두 푼다(NULL) — 사진을 읽지 않는다', async () => {
    req.body = { coverMediaIds: [] };

    await updateAlbum(req, res);

    expect(EventMedia.coverableIds).not.toHaveBeenCalled();
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: null });
  });

  it('5장 이상은 400 too_many_covers', async () => {
    req.body = { coverMediaIds: [1, 2, 3, 4, 5] };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('too_many_covers');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it.each([
    ['배열이 아님', 41],
    ['같은 사진이 두 번', [4, 4]],
    ['id 가 아닌 값', [4, '5']],
    ['null', null]
  ])('%s 이면 400 invalid_cover', async (_label, value) => {
    req.body = { coverMediaIds: value };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('invalid_cover');
    expect(EventMedia.coverableIds).not.toHaveBeenCalled();
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('더하기·빼기와 함께 오면 400 — 무엇을 할지 모호하다', async () => {
    req.body = { coverMediaIds: [1], addCoverMediaId: 2 };

    await updateAlbum(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('숨긴 사진이 섞였으면 400 hidden_cover', async () => {
    EventMedia.coverableIds.mockResolvedValue([1]);
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, status: 'ready', isHidden: true, driveFileId: 'd-5' });
    req.body = { coverMediaIds: [1, 5] };

    await updateAlbum(req, res);

    expect(EventMedia.getById).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('hidden_cover');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  it('다른 앨범의 사진·없는 사진이 섞였으면 400 invalid_cover', async () => {
    EventMedia.coverableIds.mockResolvedValue([1]);
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 99, status: 'ready', isHidden: true, driveFileId: 'd-5' });
    req.body = { coverMediaIds: [1, 5] };

    await updateAlbum(req, res);

    expect(res.json.mock.calls[0][0].reason).toBe('invalid_cover');
    expect(Event.updateAlbum).not.toHaveBeenCalled();
  });

  describe('보일 부분 {coverCrops} — [저장하기] 가 목록과 함께 보낸다', () => {
    beforeEach(() => { EventMedia.coverableIds.mockResolvedValue([3, 1]); });

    it('목록에 든 사진의 보일 부분을 다듬어 한 번에 적는다 — 가운데는 null', async () => {
      req.body = { coverMediaIds: [3, 1], coverCrops: { 3: { x: 20.04, y: 70, zoom: 1.5 }, 1: { x: 50, y: 50, zoom: 1 } } };

      await updateAlbum(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(Event.updateAlbum).toHaveBeenCalledWith(3, { albumCoverMediaIds: [3, 1] });
      expect(EventMedia.setCoverCrops).toHaveBeenCalledWith(3, { 3: { x: 20, y: 70, zoom: 1.5 }, 1: null });
    });

    it('보일 부분이 안 오면 적지 않는다 — 예전 화면·API 호출', async () => {
      req.body = { coverMediaIds: [3, 1] };

      await updateAlbum(req, res);

      expect(EventMedia.setCoverCrops).not.toHaveBeenCalled();
    });

    it('목록에 없는 사진의 보일 부분은 400 invalid_cover_crop — 아무것도 쓰지 않는다', async () => {
      req.body = { coverMediaIds: [3, 1], coverCrops: { 9: { x: 10, y: 10, zoom: 1 } } };

      await updateAlbum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].reason).toBe('invalid_cover_crop');
      expect(Event.updateAlbum).not.toHaveBeenCalled();
      expect(EventMedia.setCoverCrops).not.toHaveBeenCalled();
    });

    it.each([
      ['범위 밖', { 3: { x: 120, y: 10, zoom: 1 } }],
      ['너무 큰 확대', { 3: { x: 10, y: 10, zoom: 5 } }],
      ['객체가 아님', [1, 2]],
      ['null', null]
    ])('%s 이면 400 invalid_cover_crop', async (_label, coverCrops) => {
      req.body = { coverMediaIds: [3, 1], coverCrops };

      await updateAlbum(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].reason).toBe('invalid_cover_crop');
      expect(Event.updateAlbum).not.toHaveBeenCalled();
    });

    it('목록 없이 보일 부분만 오면 400 — 더하기·빼기와도 섞지 않는다', async () => {
      for (const body of [{ coverCrops: { 3: null } }, { addCoverMediaId: 3, coverCrops: { 3: null } }]) {
        res.status.mockClear();
        Event.updateAlbum.mockClear();
        req.body = body;

        await updateAlbum(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Event.updateAlbum).not.toHaveBeenCalled();
      }
      expect(EventMedia.setCoverCrops).not.toHaveBeenCalled();
    });
  });
});

describe('createUploads', () => {
  it('세션을 발급한다', async () => {
    Event.getById.mockResolvedValue(event());
    albumService.createUploadSessions.mockResolvedValue([{ name: 'a.jpg', mediaId: 1, sessionUri: 'u' }]);
    req.body = { files: [{ name: 'a.jpg', size: 100, mimeType: 'image/jpeg' }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(albumService.createUploadSessions).toHaveBeenCalledWith(
      7, expect.anything(), req.body.files, expect.objectContaining({ role: 'teacher', label: '선생님' })
    );
  });

  it('선생님은 업로드 받기를 꺼도 올릴 수 있다', async () => {
    Event.getById.mockResolvedValue(event({ albumUploadOpen: false }));
    albumService.createUploadSessions.mockResolvedValue([]);
    req.body = { files: [{ name: 'a.jpg', size: 1 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('Drive 연결이 끊기면 사유와 함께 막는다', async () => {
    Event.getById.mockResolvedValue(event());
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'error' });
    req.body = { files: [{ name: 'a.jpg', size: 1 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('drive_error');
  });

  it('한 번에 30개를 넘기면 막는다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { files: Array.from({ length: 31 }, (_, i) => ({ name: `${i}.jpg`, size: 1 })) };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(albumService.createUploadSessions).not.toHaveBeenCalled();
  });
});

describe('createUploads — 고른 이벤트에 연결 (docs/photo-menu FR-514)', () => {
  it('앨범이 없는 이벤트면 이벤트 이름 폴더를 먼저 만들고 그 폴더로 세션을 만든다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null, driveAccountId: null, albumStatus: 'none' }));
    albumService.ensureAlbum.mockResolvedValue(event({ driveFolderId: 'new-folder', driveAccountId: 11, driveFolderName: '2026-09-12 서울시 대회', albumPublished: false }));
    albumService.createUploadSessions.mockResolvedValue([{ name: 'a.jpg', mediaId: 1, sessionUri: 'u' }]);
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(albumService.ensureAlbum).toHaveBeenCalledWith(7, expect.objectContaining({ id: 3, driveFolderId: null }));
    expect(albumService.createUploadSessions).toHaveBeenCalledWith(
      7, expect.objectContaining({ driveFolderId: 'new-folder' }), req.body.files, expect.anything()
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].album).toEqual({ created: true, driveFolderName: '2026-09-12 서울시 대회', published: false });
  });

  it('앨범이 이미 있으면 새로 만들지 않는다', async () => {
    Event.getById.mockResolvedValue(event());
    albumService.createUploadSessions.mockResolvedValue([]);
    req.body = { files: [{ name: 'a.jpg', size: 1 }] };

    await createUploads(req, res);

    expect(albumService.ensureAlbum).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].album.created).toBe(false);
  });

  it('올릴 파일이 없으면 폴더를 만들지 않는다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    req.body = { files: [] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(albumService.ensureAlbum).not.toHaveBeenCalled();
  });

  it('휴관일에는 올릴 수 없다', async () => {
    Event.getById.mockResolvedValue(event({ type: 'closure', driveFolderId: null }));
    req.body = { files: [{ name: 'a.jpg', size: 1 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('closure_event');
    expect(albumService.ensureAlbum).not.toHaveBeenCalled();
  });

  it('Google 이 연결되지 않았으면 폴더를 만들다 실패한 사유를 설정 안내로 준다', async () => {
    Event.getById.mockResolvedValue(event({ driveFolderId: null }));
    albumService.ensureAlbum.mockRejectedValue(new DriveError('not_connected', 'x'));
    req.body = { files: [{ name: 'a.jpg', size: 1 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'not_connected', error: expect.stringContaining('설정') });
  });
});

describe('completeUpload', () => {
  it('내가 시작한 업로드만 마칠 수 있다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderUserId: 99, kind: 'image' });
    req.params.mediaId = '5';
    req.body = { driveFileId: 'f1' };

    await completeUpload(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('다른 이벤트의 사진이면 404', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 99, uploaderUserId: 7 });
    req.params.mediaId = '5';
    req.body = { driveFileId: 'f1' };

    await completeUpload(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('완료하면 얼굴 분석 결과를 함께 돌려준다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderUserId: 7, kind: 'image' });
    albumService.completeUpload.mockResolvedValue({
      media: { id: 5, kind: 'image', driveFileId: 'f1', originalName: 'a.jpg', uploaderRole: 'teacher' },
      faceStatus: 'done', faceCount: 2, tags: []
    });
    req.params.mediaId = '5';
    req.body = { driveFileId: 'f1', faces: [] };

    await completeUpload(req, res);

    expect(res.json.mock.calls[0][0]).toMatchObject({ faceStatus: 'done', faceCount: 2 });
  });

  it('파일 id 가 없으면 막는다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderUserId: 7 });
    req.params.mediaId = '5';

    await completeUpload(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('bulkAction', () => {
  it('여러 장을 한 번에 숨긴다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { action: 'hide', mediaIds: [1, 2] };

    await bulkAction(req, res);

    expect(EventMedia.setHidden).toHaveBeenCalledWith([1, 2], true, 3);
    expect(res.json).toHaveBeenCalledWith({ affected: 2 });
  });

  it('삭제는 Drive 휴지통으로 보낸다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 1, eventId: 3 });
    req.body = { action: 'delete', mediaIds: [1] };

    await bulkAction(req, res);

    expect(albumService.deleteMedia).toHaveBeenCalled();
  });

  it('내 학생이 아니면 태그할 수 없다', async () => {
    Event.getById.mockResolvedValue(event());
    Student.getByIds.mockResolvedValue([]);
    req.body = { action: 'tag', mediaIds: [1], studentIds: [99] };

    await bulkAction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(MediaTag.upsert).not.toHaveBeenCalled();
  });

  it('대상이 없으면 막는다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { action: 'hide', mediaIds: [] };

    await bulkAction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('모르는 동작은 거절한다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { action: '무엇인가', mediaIds: [1] };

    await bulkAction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('addTag', () => {
  it('선생님 태그는 manual 로 남는다 (재매칭이 덮어쓰지 않게)', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3 });
    Student.getByIds.mockResolvedValue([{ id: 5, name: '김하은' }]);
    req.params.mediaId = '5';
    req.body = { studentId: 5 };

    await addTag(req, res);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual', studentId: 5 }));
  });
});

describe('updateMedia — 사진·영상 설명', () => {
  beforeEach(() => {
    req.params.mediaId = '5';
    EventMedia.setCaption.mockImplementation(async (id, caption) => ({ id, caption }));
  });

  it('설명을 다듬어 이 이벤트의 사진에만 저장한다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { caption: '  단체전 결승 무대\r\n리본 연기 ' };

    await updateMedia(req, res);

    expect(EventMedia.setCaption).toHaveBeenCalledWith(5, '단체전 결승 무대\n리본 연기', 3);
    expect(res.json).toHaveBeenCalledWith({ id: 5, caption: '단체전 결승 무대\n리본 연기' });
  });

  it('빈 글이면 설명을 지운다(null)', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { caption: '   ' };

    await updateMedia(req, res);

    expect(EventMedia.setCaption).toHaveBeenCalledWith(5, null, 3);
    expect(res.json).toHaveBeenCalledWith({ id: 5, caption: null });
  });

  it('너무 길면 저장하지 않고 이유를 알려 준다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { caption: '가'.repeat(501) };

    await updateMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('500자');
    expect(EventMedia.setCaption).not.toHaveBeenCalled();
  });

  it('caption 을 보내지 않으면 아무것도 바꾸지 않는다', async () => {
    Event.getById.mockResolvedValue(event());
    req.body = { isHidden: true };

    await updateMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(EventMedia.setCaption).not.toHaveBeenCalled();
  });

  it('남의 이벤트면 404 — 사진이 있는지도 알려 주지 않는다', async () => {
    Event.getById.mockResolvedValue(null);
    req.body = { caption: '무대' };

    await updateMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(EventMedia.setCaption).not.toHaveBeenCalled();
  });

  it('다른 이벤트의 사진이면 404', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.setCaption.mockResolvedValue(null);
    req.body = { caption: '무대' };

    await updateMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('Google 연결이 끊겨도 설명은 고칠 수 있다 — Drive 를 거치지 않는다', async () => {
    Event.getById.mockResolvedValue(event());
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'error' });
    req.body = { caption: '무대' };

    await updateMedia(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: 5, caption: '무대' });
  });
});

describe('deleteMedia', () => {
  it('선생님은 학부모가 올린 사진도 지울 수 있다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderRole: 'parent', uploaderUserId: 42 });
    req.params.mediaId = '5';

    await deleteMedia(req, res);

    expect(albumService.deleteMedia).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].message).toContain('휴지통');
  });
});

describe('listMedia', () => {
  it('선생님 목록에는 숨긴 사진도 포함한다', async () => {
    Event.getById.mockResolvedValue(event());

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ includeHidden: true }));
  });

  it('마지막 페이지면 커서를 주지 않는다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.list.mockResolvedValue([{ id: 1, kind: 'image', takenAt: 't', tags: [] }]);

    await listMedia(req, res);

    expect(res.json.mock.calls[0][0].nextCursor).toBeNull();
  });
});

describe('얼굴 목록 (앨범의 사람마다 얼굴 하나)', () => {
  const axis = (i) => Float32Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0));
  const face = (id, mediaId, descriptor) => ({
    id, mediaId, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, score: 0.9, descriptor, driveFileId: `file-${mediaId}`
  });

  beforeEach(() => {
    Event.getById.mockResolvedValue(event());
    MediaFace.listForAlbum.mockResolvedValue([face(11, 1, axis(0)), face(12, 2, axis(0)), face(21, 2, axis(3))]);
    MediaTag.listForAlbum.mockResolvedValue([{ mediaId: 1, studentId: 9, source: 'face', faceId: 11 }]);
  });

  it('선생님은 숨긴 사진까지 묶고, 학부모와 같은 모양(이름·학생 id 없이)으로 받는다', async () => {
    await listPeople(req, res);

    expect(albumService.ensureAlbumsMatched).toHaveBeenCalled();
    expect(MediaFace.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: true });
    expect(res.json.mock.calls[0][0].people).toEqual([
      // removable 은 선생님에게만 — 등록된 아이(학생 9 태그)로 묶인 사람은 뺄 수 없다
      { key: 'p11', photoCount: 2, removable: false, cover: { url: 'https://lh3.googleusercontent.com/d/file-1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } } },
      { key: 'p21', photoCount: 1, removable: true, cover: { url: 'https://lh3.googleusercontent.com/d/file-2=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } } }
    ]);
  });

  it('남의 이벤트면 404 — 묶지 않는다', async () => {
    Event.getById.mockResolvedValue(null);

    await listPeople(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(MediaFace.listForAlbum).not.toHaveBeenCalled();
  });

  describe('얼굴 목록에서 빼기 (DELETE .../album/people/:key)', () => {
    beforeEach(() => {
      mockClient.query.mockClear();
      MediaTag.removeAutoTagsForFaces.mockResolvedValue(1);
      MediaFace.deleteForAlbum.mockResolvedValue([2]);
      EventMedia.refreshFaceCounts.mockResolvedValue(1);
    });

    it('그 사람의 얼굴과 자동 태그만 지운다 — 태그 먼저, 한 트랜잭션, 사진별 얼굴 수까지', async () => {
      req.params.key = 'p21';
      req.query = { photoCount: '1' };

      await deletePerson(req, res);

      expect(MediaFace.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: true });
      expect(MediaTag.removeAutoTagsForFaces).toHaveBeenCalledWith([21], mockClient);
      expect(MediaFace.deleteForAlbum).toHaveBeenCalledWith([21], 3, mockClient);
      expect(MediaTag.removeAutoTagsForFaces.mock.invocationCallOrder[0])
        .toBeLessThan(MediaFace.deleteForAlbum.mock.invocationCallOrder[0]);
      expect(EventMedia.refreshFaceCounts).toHaveBeenCalledWith([2], mockClient);
      expect(mockClient.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
      expect(res.json).toHaveBeenCalledWith({ removedFaces: 1, photos: 1, removedTags: 1 });
    });

    it('등록된 아이로 묶인 사람은 409 student_person — 아무것도 지우지 않는다', async () => {
      req.params.key = 'p11';
      req.query = { photoCount: '2' };

      await deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0]).toEqual({ error: '등록된 아이 얼굴은 목록에서 뺄 수 없어요.', reason: 'student_person' });
      expect(mockClient.query).not.toHaveBeenCalled();
      expect(MediaFace.deleteForAlbum).not.toHaveBeenCalled();
    });

    it('화면이 본 사진 수와 다르거나 없으면 409 person_changed — 아무것도 지우지 않는다', async () => {
      req.params.key = 'p21';
      for (const query of [{ photoCount: '5' }, {}, { photoCount: 'abc' }]) {
        res.status.mockClear();
        res.json.mockClear();
        req.query = query;

        await deletePerson(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'person_changed' });
      }
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('남의 이벤트면 404 — 아무것도 지우지 않는다', async () => {
      Event.getById.mockResolvedValue(null);
      req.params.key = 'p21';
      req.query = { photoCount: '1' };

      await deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(MediaFace.deleteForAlbum).not.toHaveBeenCalled();
    });

    it('그 사이 없어진 사람이면 404 + personMissing', async () => {
      req.params.key = 'p999';
      req.query = { photoCount: '1' };

      await deletePerson(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0]).toMatchObject({ personMissing: true });
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('지우다 실패하면 되돌리고 500', async () => {
      req.params.key = 'p21';
      req.query = { photoCount: '1' };
      MediaFace.deleteForAlbum.mockRejectedValueOnce(new Error('db down'));

      await deletePerson(req, res);

      expect(mockClient.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
      expect(EventMedia.refreshFaceCounts).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  it('?person= 이면 그 사람의 사진만, 다른 거르기(칩)와 함께', async () => {
    req.query = { person: 'p11', filter: 'teacher' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ filter: 'teacher', mediaIds: [1, 2], includeHidden: true }));
  });

  it('없어진 사람이면 빈 목록 + personMissing', async () => {
    req.query = { person: 'p404' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ mediaIds: [] }));
    expect(res.json.mock.calls[0][0].personMissing).toBe(true);
  });
});

describe('얼굴 다시 찾기 (재분석)', () => {
  it('완료 보고에 실린 분석 방식 버전을 서비스로 넘긴다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderUserId: 7, kind: 'image' });
    albumService.completeUpload.mockResolvedValue({ media: { id: 5, kind: 'image' }, faceStatus: 'none', faceCount: 0, tags: [] });
    req.params.mediaId = '5';
    req.body = { driveFileId: 'f1', faces: [], analyzerVersion: 2 };

    await completeUpload(req, res);

    expect(albumService.completeUpload).toHaveBeenCalledWith(7, expect.anything(), expect.anything(),
      expect.objectContaining({ faces: [], analyzerVersion: 2 }));
  });

  it('대상 목록은 afterId 다음부터, 브라우저가 픽셀을 읽을 수 있는 긴 변 1920 주소로 준다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.listUnanalyzed.mockResolvedValue([{ id: 41, driveFileId: 'abc_1-2' }]);
    EventMedia.stats.mockResolvedValue({ unanalyzed: 3 });
    req.query = { batch: '5', afterId: '40' };

    await listUnanalyzed(req, res);

    expect(EventMedia.listUnanalyzed).toHaveBeenCalledWith(3, 5, 40);
    expect(res.json.mock.calls[0][0]).toEqual({
      items: [{ id: 41, driveFileId: 'abc_1-2', largeUrl: 'https://lh3.googleusercontent.com/d/abc_1-2=s1920' }],
      remaining: 3
    });
  });

  it('afterId 가 없거나 이상하면 처음부터', async () => {
    Event.getById.mockResolvedValue(event());
    req.query = { afterId: 'x' };

    await listUnanalyzed(req, res);

    expect(EventMedia.listUnanalyzed).toHaveBeenCalledWith(3, 5, 0);
  });

  it('analysisImageUrl — drive.google.com/thumbnail 이 아니다(그 302 에는 CORS 헤더가 없다)', () => {
    expect(analysisImageUrl('f1')).toBe('https://lh3.googleusercontent.com/d/f1=s1920');
  });

  it('다시 찾은 결과를 저장할 때도 버전을 넘긴다', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, kind: 'image' });
    albumService.indexFaces.mockResolvedValue({ faceStatus: 'done', faceCount: 1 });
    req.params.mediaId = '5';
    req.body = { faces: [{ descriptor: [] }], analyzerVersion: 2 };

    await saveFaces(req, res);

    expect(albumService.indexFaces).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 5 }),
      req.body.faces, { analyzerVersion: 2 });
    expect(res.json).toHaveBeenCalledWith({ faceStatus: 'done', faceCount: 1 });
  });
});

describe('앨범을 열 때 자동 태그를 지금 규칙으로 맞춘다', () => {
  it('getAlbum — 개수(미분류·후보)를 세기 전에', async () => {
    Event.getById.mockResolvedValue(event());

    await getAlbum(req, res);

    expect(albumService.ensureAlbumsMatched).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(albumService.ensureAlbumsMatched.mock.invocationCallOrder[0])
      .toBeLessThan(EventMedia.stats.mock.invocationCallOrder[0]);
  });

  it('listMedia — 사진을 읽기 전에', async () => {
    Event.getById.mockResolvedValue(event());
    EventMedia.list.mockResolvedValue([]);

    await listMedia(req, res);

    expect(albumService.ensureAlbumsMatched).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(albumService.ensureAlbumsMatched.mock.invocationCallOrder[0])
      .toBeLessThan(EventMedia.list.mock.invocationCallOrder[0]);
  });
});
