import { jest } from '@jest/globals';

const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

jest.unstable_mockModule('../../database.js', () => ({
  default: { connect: jest.fn().mockResolvedValue(mockClient), query: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }) }
}));
jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { updateAlbum: jest.fn(async (id, fields) => ({ id, ...fields })) }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: {
    setFaceStatus: jest.fn(async (id, fields) => ({ id, ...fields })),
    markReady: jest.fn(),
    createPending: jest.fn(),
    listReadyIds: jest.fn().mockResolvedValue([]),
    markMissing: jest.fn(),
    cleanupStale: jest.fn().mockResolvedValue(0),
    updateVideoMeta: jest.fn(),
    delete: jest.fn()
  }
}));
jest.unstable_mockModule('../../models/MediaFace.js', () => ({
  default: {
    replaceForMedia: jest.fn().mockResolvedValue([]),
    listVectorsByMedia: jest.fn().mockResolvedValue([]),
    listVectorsByTeacher: jest.fn().mockResolvedValue(new Map())
  }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listByMedia: jest.fn().mockResolvedValue([]),
    listByTeacherAndStudent: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    removeStudents: jest.fn().mockResolvedValue(0)
  }
}));
jest.unstable_mockModule('../../models/ChildFaceProfile.js', () => ({
  default: { listVectorsByTeacher: jest.fn().mockResolvedValue([]) },
  MAX_PER_PARENT: 3,
  MAX_PER_STUDENT: 5
}));
jest.unstable_mockModule('../../models/AppSetting.js', () => ({
  default: { getMany: jest.fn().mockResolvedValue({}) }
}));
jest.unstable_mockModule('../../utils/googleDrive.js', () => {
  class DriveError extends Error {
    constructor(code, message) { super(message); this.name = 'DriveError'; this.code = code; }
  }
  return {
    DriveError,
    createFolder: jest.fn(),
    shareAnyoneReader: jest.fn(),
    listPermissions: jest.fn(),
    isSharedWithAnyone: jest.fn(() => true),
    renameFile: jest.fn(),
    getFile: jest.fn(),
    trashFile: jest.fn(),
    createResumableSession: jest.fn()
  };
});
jest.unstable_mockModule('../driveAccess.js', () => ({
  runWithDrive: jest.fn(async (userId, fn) => fn('at', { id: 11 })),
  ensureRootFolder: jest.fn().mockResolvedValue({ id: 'root-1', name: 'RG Manager' })
}));

const EventMedia = (await import('../../models/EventMedia.js')).default;
const MediaFace = (await import('../../models/MediaFace.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const ChildFaceProfile = (await import('../../models/ChildFaceProfile.js')).default;
const AppSetting = (await import('../../models/AppSetting.js')).default;
const { createFolder, shareAnyoneReader, getFile, createResumableSession, trashFile, DriveError } =
  await import('../../utils/googleDrive.js');
const albumService = (await import('../albumService.js')).default;

const D = (v) => Float32Array.from(new Array(128).fill(v));
const arr = (v) => new Array(128).fill(v);

const event = (overrides = {}) => ({
  id: 3, userId: 7, date: '2026-09-12', driveFolderId: 'folder-1', ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AppSetting.getMany.mockResolvedValue({});
  MediaTag.listByMedia.mockResolvedValue([]);
  MediaFace.listVectorsByMedia.mockResolvedValue([]);
  ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([]);
  EventMedia.setFaceStatus.mockImplementation(async (id, fields) => ({ id, ...fields }));
});

describe('getThresholds', () => {
  it('설정이 없으면 기본값을 쓴다', async () => {
    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.5, candidate: 0.6 });
  });

  it('관리자가 바꾼 값을 따른다', async () => {
    AppSetting.getMany.mockResolvedValue({ face_match_threshold: '0.42', face_candidate_threshold: '0.55' });

    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.42, candidate: 0.55 });
  });

  it('설정 조회가 실패해도 기본값으로 계속 간다', async () => {
    AppSetting.getMany.mockRejectedValue(new Error('DB 오류'));

    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.5, candidate: 0.6 });
  });
});

describe('createAlbumFolder', () => {
  it('루트 아래에 만들고 링크 공유를 켠다', async () => {
    createFolder.mockResolvedValue({ id: 'folder-9', name: '2026-09-12 대회' });

    const result = await albumService.createAlbumFolder(7, event({ driveFolderId: null }), '2026-09-12 대회');

    expect(createFolder).toHaveBeenCalledWith('at', { name: '2026-09-12 대회', parentId: 'root-1' });
    expect(shareAnyoneReader).toHaveBeenCalledWith('at', 'folder-9');
    expect(result.event.albumStatus).toBe('ready');
  });

  it('공유 설정만 실패하면 unshared 로 남겨 화면이 고치게 한다', async () => {
    createFolder.mockResolvedValue({ id: 'folder-9', name: '대회' });
    shareAnyoneReader.mockRejectedValue(new DriveError('forbidden', '권한 없음'));

    const result = await albumService.createAlbumFolder(7, event({ driveFolderId: null }), '대회');

    expect(result.shared).toBe(false);
    expect(result.event.albumStatus).toBe('unshared');
  });
});

describe('createUploadSessions', () => {
  it('통과한 파일마다 세션과 대기 행을 만든다', async () => {
    createResumableSession.mockResolvedValue('https://upload/session-1');
    EventMedia.createPending.mockResolvedValue({ id: 55 });

    const items = await albumService.createUploadSessions(7, event(), [{ name: 'a.jpg', size: 1000 }], {
      userId: 42, role: 'parent', label: '하은', studentId: 5
    });

    expect(items[0]).toMatchObject({ mediaId: 55, sessionUri: 'https://upload/session-1', driveName: '20260912_하은_a.jpg' });
    expect(EventMedia.createPending).toHaveBeenCalledWith(expect.objectContaining({ uploaderRole: 'parent', uploaderStudentId: 5 }));
  });

  it('형식·크기가 안 맞는 파일은 이유를 달아 건너뛴다', async () => {
    const items = await albumService.createUploadSessions(7, event(), [{ name: '문서.pdf', size: 100 }], {
      userId: 42, role: 'parent', label: '하은'
    });

    expect(items[0]).toMatchObject({ name: '문서.pdf', reason: 'type' });
    expect(createResumableSession).not.toHaveBeenCalled();
  });

  it('용량이 부족하면 그 파일만 실패로 남기고 계속한다', async () => {
    createResumableSession
      .mockRejectedValueOnce(new DriveError('quota', 'full'))
      .mockResolvedValueOnce('https://upload/session-2');
    EventMedia.createPending.mockResolvedValue({ id: 56 });

    const items = await albumService.createUploadSessions(7, event(),
      [{ name: 'a.jpg', size: 1 }, { name: 'b.jpg', size: 1 }],
      { userId: 42, role: 'parent', label: '하은' });

    expect(items[0].reason).toBe('quota');
    expect(items[1].mediaId).toBe(56);
  });
});

describe('completeUpload', () => {
  const media = { id: 55, eventId: 3, kind: 'image', size: 100, takenAt: 't' };

  it('우리 앨범 폴더에 올라간 파일만 받아들인다', async () => {
    getFile.mockResolvedValue({ id: 'f1', mimeType: 'image/jpeg', parents: ['남의폴더'], size: 100 });

    await expect(albumService.completeUpload(7, event(), media, { driveFileId: 'f1' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('종류가 다르면 거절한다 (영상 자리에 사진을 넣는 식)', async () => {
    getFile.mockResolvedValue({ id: 'f1', mimeType: 'video/mp4', parents: ['folder-1'] });

    await expect(albumService.completeUpload(7, event(), media, { driveFileId: 'f1' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('확인되면 ready 로 바꾸고 얼굴을 저장한다', async () => {
    getFile.mockResolvedValue({
      id: 'f1', mimeType: 'image/jpeg', parents: ['folder-1'], size: 2048,
      imageMediaMetadata: { width: 4032, height: 3024 }
    });
    EventMedia.markReady.mockResolvedValue({ ...media, driveFileId: 'f1', status: 'ready' });

    const result = await albumService.completeUpload(7, event(), media, {
      driveFileId: 'f1',
      faces: [{ box: { x: 0.1, y: 0.2, w: 0.1, h: 0.12 }, score: 0.9, descriptor: arr(0.1) }]
    });

    expect(EventMedia.markReady).toHaveBeenCalledWith(55, expect.objectContaining({ driveFileId: 'f1', width: 4032 }));
    expect(MediaFace.replaceForMedia).toHaveBeenCalled();
    expect(result.faceStatus).toBe('done');
    expect(result.faceCount).toBe(1);
  });
});

describe('indexFaces — 얼굴 특징값 저장', () => {
  const media = { id: 55, kind: 'image' };

  it('영상은 분석하지 않는다', async () => {
    const result = await albumService.indexFaces(event(), { id: 55, kind: 'video' }, null);

    expect(result.faceStatus).toBe('skipped');
    expect(MediaFace.replaceForMedia).not.toHaveBeenCalled();
  });

  it('브라우저가 벡터를 못 보내면 skipped 로 두고 업로드는 성공시킨다', async () => {
    const result = await albumService.indexFaces(event(), media, undefined);

    expect(result.faceStatus).toBe('skipped');
  });

  it('얼굴이 없으면 none 이다', async () => {
    const result = await albumService.indexFaces(event(), media, []);

    expect(result.faceStatus).toBe('none');
    expect(result.faceCount).toBe(0);
  });

  it('망가진 벡터는 걸러낸다', async () => {
    const result = await albumService.indexFaces(event(), media, [
      { box: {}, score: 0.9, descriptor: [1, 2, 3] },
      { box: {}, score: 0.9, descriptor: arr(0.2) }
    ]);

    expect(result.faceCount).toBe(1);
    expect(MediaFace.replaceForMedia.mock.calls[0][1]).toHaveLength(1);
  });

  it('얼굴 상자를 0~1 로 자른다', async () => {
    await albumService.indexFaces(event(), media, [
      { box: { x: -0.5, y: 2, w: 0.3, h: 0.4 }, score: 1, descriptor: arr(0.1) }
    ]);

    expect(MediaFace.replaceForMedia.mock.calls[0][1][0].box).toEqual({ x: 0, y: 1, w: 0.3, h: 0.4 });
  });

  it('저장이 실패해도 업로드를 깨지 않고 failed 로 남긴다', async () => {
    MediaFace.replaceForMedia.mockRejectedValue(new Error('DB 오류'));

    const result = await albumService.indexFaces(event(), media, [{ box: {}, score: 1, descriptor: arr(0.1) }]);

    expect(result.faceStatus).toBe('failed');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

describe('rematchMedia — 벡터에서 태그로', () => {
  it('가까운 얼굴은 자동 태그가 된다', async () => {
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ studentId: 5, source: 'face', distance: 0 }));
  });

  it('애매하면 후보로 남긴다', async () => {
    // 128차원에서 각 항이 0.05 차이면 거리 = 0.05 * sqrt(128) ≈ 0.566 → 후보 구간
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0.05) }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'candidate' }));
  });

  it('멀면 태그하지 않는다', async () => {
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0.5) }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.upsert).not.toHaveBeenCalled();
  });

  it('선생님이 붙인 태그는 자동 매칭이 덮어쓰지 않는다', async () => {
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);
    MediaTag.listByMedia.mockResolvedValue([{ studentId: 5, source: 'manual' }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.upsert).not.toHaveBeenCalled();
  });

  it('기준 얼굴이 사라지면 자동 태그를 지운다', async () => {
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([]);
    MediaTag.listByMedia.mockResolvedValue([{ studentId: 5, source: 'face' }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.removeStudents).toHaveBeenCalledWith(55, [5]);
  });
});

describe('matchStudentAcrossAlbums — 자녀 얼굴 등록 직후', () => {
  it('앨범 전체에서 찾아 태그하고 몇 장인지 알려준다', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([
      [11, [{ id: 1, descriptor: D(0) }]],
      [12, [{ id: 2, descriptor: D(0) }]],
      [13, [{ id: 3, descriptor: D(0.5) }]]      // 이 사진은 다른 아이
    ]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);

    const result = await albumService.matchStudentAcrossAlbums(7, 5);

    expect(result.photos).toBe(2);
    expect(MediaTag.upsert).toHaveBeenCalledTimes(2);
  });

  it('기준 얼굴이 없으면 아무 것도 하지 않는다', async () => {
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([]);

    await expect(albumService.matchStudentAcrossAlbums(7, 5)).resolves.toEqual({ albums: 0, photos: 0, candidates: 0 });
    expect(MediaTag.upsert).not.toHaveBeenCalled();
  });
});

describe('deleteMedia', () => {
  it('Drive 휴지통으로 보내고 행을 지운다', async () => {
    await albumService.deleteMedia(7, { id: 55, driveFileId: 'f1' });

    expect(trashFile).toHaveBeenCalledWith('at', 'f1');
    expect(EventMedia.delete).toHaveBeenCalledWith(55);
  });

  it('Drive 에서 이미 사라졌어도 앱에서는 지운다', async () => {
    trashFile.mockRejectedValue(new DriveError('not_found', '없음'));

    await albumService.deleteMedia(7, { id: 55, driveFileId: 'f1' });

    expect(EventMedia.delete).toHaveBeenCalledWith(55);
  });
});
