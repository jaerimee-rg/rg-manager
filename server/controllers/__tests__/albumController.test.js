import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { getById: jest.fn(), updateAlbum: jest.fn() }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: {
    stats: jest.fn().mockResolvedValue({ images: 0, videos: 0, hidden: 0, untagged: 0, candidates: 0, unanalyzed: 0, totalSize: 0 }),
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn(),
    setHidden: jest.fn().mockResolvedValue(2),
    listUnanalyzed: jest.fn().mockResolvedValue([])
  }
}));
jest.unstable_mockModule('../../models/MediaFace.js', () => ({
  default: { listByMediaIds: jest.fn().mockResolvedValue({}) }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: { listByMediaIds: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({ studentId: 5, source: 'manual' }) }
}));
jest.unstable_mockModule('../../models/Student.js', () => ({
  default: { getByIds: jest.fn().mockResolvedValue([]) }
}));
jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: { getByUserId: jest.fn() }
}));
jest.unstable_mockModule('../../services/albumService.js', () => ({
  default: {
    createAlbumFolder: jest.fn(),
    renameAlbumFolder: jest.fn(),
    refreshAlbum: jest.fn(),
    createUploadSessions: jest.fn(),
    completeUpload: jest.fn(),
    indexFaces: jest.fn(),
    rematchAlbum: jest.fn(),
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

const Event = (await import('../../models/Event.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const Student = (await import('../../models/Student.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const albumService = (await import('../../services/albumService.js')).default;
const { DriveError } = await import('../../utils/googleDrive.js');
const {
  getAlbum, createAlbum, updateAlbum, listMedia, createUploads, completeUpload,
  bulkAction, addTag, deleteMedia
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

describe('createAlbum', () => {
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
