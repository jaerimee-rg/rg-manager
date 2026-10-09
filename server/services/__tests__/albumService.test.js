import { jest } from '@jest/globals';

const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };

jest.unstable_mockModule('../../database.js', () => ({
  default: { connect: jest.fn().mockResolvedValue(mockClient), query: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }) }
}));
jest.unstable_mockModule('../../models/Event.js', () => ({
  default: {
    updateAlbum: jest.fn(async (id, fields) => ({ id, ...fields })),
    setAlbumMatchRules: jest.fn(),
    invalidateAlbumMatches: jest.fn().mockResolvedValue(0),
    countAlbumViewers: jest.fn().mockResolvedValue({ participants: 7, all: 33 })
  }
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
    listByMediaIds: jest.fn().mockResolvedValue({}),
    listByEvent: jest.fn().mockResolvedValue({}),
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

const Event = (await import('../../models/Event.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const MediaFace = (await import('../../models/MediaFace.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const ChildFaceProfile = (await import('../../models/ChildFaceProfile.js')).default;
const AppSetting = (await import('../../models/AppSetting.js')).default;
const { createFolder, shareAnyoneReader, getFile, createResumableSession, trashFile, renameFile, DriveError } =
  await import('../../utils/googleDrive.js');
const albumService = (await import('../albumService.js')).default;

/** 앞 두 칸만 쓰는 512차원 단위 벡터 — D(0) 과의 코사인 거리가 정확히 d 가 된다(0 같은 얼굴 · 1 전혀 다른 얼굴). */
const D = (d) => {
  const v = new Float32Array(512);
  const angle = Math.acos(1 - d);
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
  return v;
};
const arr = (d) => Array.from(D(d));

const event = (overrides = {}) => ({
  id: 3, userId: 7, date: '2026-09-12', driveFolderId: 'folder-1', ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AppSetting.getMany.mockResolvedValue({});
  MediaTag.listByMedia.mockResolvedValue([]);
  MediaTag.listByTeacherAndStudent.mockResolvedValue([]);
  MediaTag.listByMediaIds.mockResolvedValue({});
  MediaTag.listByEvent.mockResolvedValue({});
  MediaFace.listVectorsByTeacher.mockResolvedValue(new Map());
  MediaFace.listVectorsByMedia.mockResolvedValue([]);
  ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([]);
  EventMedia.setFaceStatus.mockImplementation(async (id, fields) => ({ id, ...fields }));
});

describe('getThresholds', () => {
  it('설정이 없으면 기본값을 쓴다', async () => {
    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.35, candidate: 0.5 });
  });

  it('관리자가 바꾼 값을 따른다', async () => {
    AppSetting.getMany.mockResolvedValue({ face_match_threshold: '0.42', face_candidate_threshold: '0.55' });

    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.42, candidate: 0.55 });
  });

  it('설정 조회가 실패해도 기본값으로 계속 간다', async () => {
    AppSetting.getMany.mockRejectedValue(new Error('DB 오류'));

    await expect(albumService.getThresholds()).resolves.toEqual({ match: 0.35, candidate: 0.5 });
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
      faces: [{ box: { x: 0.1, y: 0.2, w: 0.1, h: 0.12 }, score: 0.9, descriptor: arr(0.1) }],
      analyzerVersion: 2
    });

    expect(EventMedia.markReady).toHaveBeenCalledWith(55, expect.objectContaining({ driveFileId: 'f1', width: 4032 }));
    expect(MediaFace.replaceForMedia).toHaveBeenCalled();
    expect(EventMedia.setFaceStatus).toHaveBeenCalledWith(55,
      expect.objectContaining({ faceStatus: 'done', faceCount: 1, analyzerVersion: 2 }), expect.anything());
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

  it('찾은 방식의 버전을 함께 저장한다 — 예전 버전이면 나중에 다시 찾을 대상이 된다', async () => {
    await albumService.indexFaces(event(), media, [], { analyzerVersion: 2 });
    expect(EventMedia.setFaceStatus).toHaveBeenLastCalledWith(55,
      expect.objectContaining({ faceStatus: 'none', analyzerVersion: 2 }), expect.anything());

    await albumService.indexFaces(event(), media, [], { analyzerVersion: 'garbage' });
    expect(EventMedia.setFaceStatus).toHaveBeenLastCalledWith(55,
      expect.objectContaining({ faceStatus: 'none', analyzerVersion: null }), expect.anything());

    // 예전 브라우저(버전을 안 보냄)
    await albumService.indexFaces(event(), media, []);
    expect(EventMedia.setFaceStatus).toHaveBeenLastCalledWith(55,
      expect.objectContaining({ analyzerVersion: null }), expect.anything());
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
    // 코사인 거리 0.42(유사도 0.58) → 후보 구간(0.35 < d ≤ 0.50)
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0.42) }]);

    await albumService.rematchMedia(event(), 55);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'candidate' }));
  });

  it('멀면 태그하지 않는다', async () => {
    MediaFace.listVectorsByMedia.mockResolvedValue([{ id: 1, descriptor: D(0) }]);
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(1) }]);

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

describe('rematchAlbum — 앨범 전체 다시 매칭', () => {
  it('지금 규칙으로 다시 붙이고, 더는 맞지 않는 자동 태그는 지운다 — 태그는 한 번에 읽는다', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([
      [11, [{ id: 1, descriptor: D(0) }]],       // 여전히 맞는다
      [12, [{ id: 2, descriptor: D(1) }]]      // 예전 임계값에서 붙었던 사진
    ]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);
    MediaTag.listByEvent.mockResolvedValue({
      12: [{ mediaId: 12, studentId: 5, source: 'face', distance: 0.45, faceId: 2 }, { mediaId: 12, studentId: 9, source: 'excluded' }]
    });
    MediaTag.removeStudents.mockResolvedValue(1);

    const result = await albumService.rematchAlbum(event());

    expect(MediaTag.listByEvent).toHaveBeenCalledWith(event().id);
    expect(MediaTag.listByMedia).not.toHaveBeenCalled();
    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 11, studentId: 5, source: 'face' }));
    expect(MediaTag.removeStudents).toHaveBeenCalledWith(12, [5]);   // excluded(9) 는 남는다
    expect(result).toEqual({ added: 1, candidates: 0, removed: 1 });
  });

  it('얼굴 벡터를 읽을 수 없는 사진(예전 128차원만 남음)의 자동 태그도 지운다 — 사람이 정한 태그는 둔다', async () => {
    // 사진 30 의 얼굴은 예전 face-api 값이라 listVectorsByTeacher 에 나오지 않는다
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map());
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);
    MediaTag.listByEvent.mockResolvedValue({
      30: [
        { mediaId: 30, studentId: 5, source: 'face', distance: 0.31, faceId: 7 },
        { mediaId: 30, studentId: 6, source: 'candidate', distance: 0.38, faceId: 8 },
        { mediaId: 30, studentId: 9, source: 'manual' }
      ]
    });
    MediaTag.removeStudents.mockResolvedValue(2);

    const result = await albumService.rematchAlbum(event());

    expect(MediaTag.removeStudents).toHaveBeenCalledWith(30, [5, 6]);
    expect(MediaTag.upsert).not.toHaveBeenCalled();
    expect(result.removed).toBe(2);
  });
});

describe('ensureAlbumsMatched — 규칙이 바뀌면 앨범을 열 때 다시 매칭', () => {
  const CURRENT = 'r3:0.35:0.5';

  it('지금 규칙으로 계산해 둔 앨범은 건드리지 않는다', async () => {
    const count = await albumService.ensureAlbumsMatched(event({ albumMatchRules: CURRENT }));

    expect(count).toBe(0);
    expect(MediaFace.listVectorsByTeacher).not.toHaveBeenCalled();
    expect(Event.setAlbumMatchRules).not.toHaveBeenCalled();
  });

  it('예전 임계값으로 계산했거나 기록이 없으면 다시 매칭하고 지금 규칙을 적는다', async () => {
    const old = event({ id: 3, albumMatchRules: 'r2:0.5:0.6' });
    const never = event({ id: 4, albumMatchRules: null });

    const count = await albumService.ensureAlbumsMatched([old, never, event({ id: 5, albumMatchRules: CURRENT })]);

    expect(count).toBe(2);
    expect(MediaFace.listVectorsByTeacher).toHaveBeenCalledTimes(2);
    expect(Event.setAlbumMatchRules).toHaveBeenCalledWith(3, CURRENT);
    expect(Event.setAlbumMatchRules).toHaveBeenCalledWith(4, CURRENT);
    expect(old.albumMatchRules).toBe(CURRENT);
  });

  it('관리자가 임계값을 바꾸면 서명이 달라져 다시 매칭한다', async () => {
    AppSetting.getMany.mockResolvedValue({ face_match_threshold: '0.3', face_candidate_threshold: '0.38' });

    await albumService.ensureAlbumsMatched(event({ albumMatchRules: CURRENT }));

    expect(Event.setAlbumMatchRules).toHaveBeenCalledWith(3, 'r3:0.3:0.38');
  });

  it('앨범(폴더)이 없는 이벤트는 건너뛴다', async () => {
    await expect(albumService.ensureAlbumsMatched(event({ driveFolderId: null }))).resolves.toBe(0);
    expect(Event.setAlbumMatchRules).not.toHaveBeenCalled();
  });

  it('실패해도 던지지 않는다 — 앨범은 떠야 한다', async () => {
    MediaFace.listVectorsByTeacher.mockRejectedValue(new Error('DB 오류'));

    await expect(albumService.ensureAlbumsMatched(event({ albumMatchRules: null }))).resolves.toBe(0);
    expect(Event.setAlbumMatchRules).not.toHaveBeenCalled();
  });
});

describe('markAlbumsStale — 기준 얼굴이 바뀐 뒤', () => {
  it('그 선생님의 앨범을 다시 매칭해야 함으로 돌린다', async () => {
    await albumService.markAlbumsStale(7);

    expect(Event.invalidateAlbumMatches).toHaveBeenCalledWith(7);
  });

  it('실패해도 던지지 않는다 — 등록·삭제는 이미 끝났다', async () => {
    Event.invalidateAlbumMatches.mockRejectedValueOnce(new Error('column "albumMatchRules" does not exist'));

    await expect(albumService.markAlbumsStale(7)).resolves.toBeUndefined();
  });
});

describe('matchStudentAcrossAlbums — 자녀 얼굴 등록 직후', () => {
  it('앨범 전체에서 찾아 태그하고 몇 장인지 알려준다', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([
      [11, [{ id: 1, descriptor: D(0) }]],
      [12, [{ id: 2, descriptor: D(0) }]],
      [13, [{ id: 3, descriptor: D(1) }]]      // 이 사진은 다른 아이
    ]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);

    const result = await albumService.matchStudentAcrossAlbums(7, 5);

    expect(result.photos).toBe(2);
    expect(MediaTag.upsert).toHaveBeenCalledTimes(2);
    // 다른 아이가 더 가까운지 보려고 선생님의 기준 얼굴 전부를 읽는다
    expect(ChildFaceProfile.listVectorsByTeacher).toHaveBeenCalledWith(7);
  });

  it('다른 아이에게 더 가까운 얼굴은 이 아이로 태그하지 않는다 (한 얼굴은 한 아이)', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([
      [11, [{ id: 1, descriptor: D(0.01) }]]
    ]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([
      { studentId: 5, descriptor: D(0.02) },   // 등록한 아이 — 가깝지만
      { studentId: 9, descriptor: D(0.01) }    // 다른 아이가 더 가깝다
    ]);

    await expect(albumService.matchStudentAcrossAlbums(7, 5)).resolves.toEqual({ albums: 0, photos: 0, candidates: 0 });
    expect(MediaTag.upsert).not.toHaveBeenCalled();
  });

  it('기준 얼굴 한 장을 지운 뒤 — 더는 맞지 않는 자동 태그는 지우고, 사람이 정한 태그는 둔다', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([
      [11, [{ id: 1, descriptor: D(0) }]],       // 남은 기준 얼굴과 여전히 맞는다
      [12, [{ id: 2, descriptor: D(1) }]],     // 지운 사진으로만 맞았다 → 자동 태그 삭제
      [13, [{ id: 3, descriptor: D(1) }]],     // 학부모가 "맞아요" 한 사진 → 그대로
      [14, [{ id: 4, descriptor: D(1) }]]      // 태그가 없던 사진 → 아무 일도 없다
    ]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);
    MediaTag.listByTeacherAndStudent.mockResolvedValue([
      { mediaId: 11, studentId: 5, source: 'face', distance: 0, faceId: 1 },
      { mediaId: 12, studentId: 5, source: 'face', distance: 0.3, faceId: 2 },
      { mediaId: 13, studentId: 5, source: 'parent_confirmed' }
    ]);

    await albumService.matchStudentAcrossAlbums(7, 5);

    expect(MediaTag.removeStudents).toHaveBeenCalledTimes(1);
    expect(MediaTag.removeStudents).toHaveBeenCalledWith(12, [5]);
    expect(MediaTag.upsert).not.toHaveBeenCalled();   // 11 은 값이 그대로라 다시 쓰지 않는다
  });

  it('얼굴 벡터를 읽을 수 없는 사진(예전 128차원)에 남은 이 아이의 자동 태그는 지운다', async () => {
    MediaFace.listVectorsByTeacher.mockResolvedValue(new Map([[11, [{ id: 1, descriptor: D(0) }]]]));
    ChildFaceProfile.listVectorsByTeacher.mockResolvedValue([{ studentId: 5, descriptor: D(0) }]);
    MediaTag.listByTeacherAndStudent.mockResolvedValue([
      { mediaId: 11, studentId: 5, source: 'face', distance: 0, faceId: 1 },
      { mediaId: 40, studentId: 5, source: 'candidate', distance: 0.38, faceId: 9 },   // 사진 40 은 예전 값뿐
      { mediaId: 41, studentId: 5, source: 'manual' }                                  // 선생님이 붙임 → 그대로
    ]);

    await albumService.matchStudentAcrossAlbums(7, 5);

    expect(MediaTag.removeStudents).toHaveBeenCalledTimes(1);
    expect(MediaTag.removeStudents).toHaveBeenCalledWith(40, [5]);
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


describe('ensureAlbum (docs/photo-menu FR-514)', () => {
  it('앨범이 있으면 그대로 돌려주고 Drive 를 부르지 않는다', async () => {
    const ev = event();
    await expect(albumService.ensureAlbum(7, ev)).resolves.toBe(ev);
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('없으면 이벤트 이름 폴더를 만들어 붙인다 — 공개 칸은 건드리지 않는다(비공개로 시작)', async () => {
    createFolder.mockResolvedValue({ id: 'folder-9', name: '2026-09-12 회장배 대회' });

    const result = await albumService.ensureAlbum(7, event({ driveFolderId: null, title: '회장배 대회' }));

    expect(createFolder).toHaveBeenCalledWith('at', { name: '2026-09-12 회장배 대회', parentId: 'root-1' });
    expect(result.driveFolderId).toBe('folder-9');
    const fields = Event.updateAlbum.mock.calls[0][1];
    expect(fields).not.toHaveProperty('albumPublished');
  });
});

describe('syncFolderName (FR-531)', () => {
  it('제목이 바뀌면 폴더 이름을 이벤트 기준으로 바꾼다', async () => {
    const before = event({ title: '서울시 대회' });
    const after = event({ title: '서울시장배 대회' });

    const result = await albumService.syncFolderName(7, before, after);

    expect(renameFile).toHaveBeenCalledWith('at', 'folder-1', '2026-09-12 서울시장배 대회');
    expect(Event.updateAlbum).toHaveBeenCalledWith(3, { driveFolderName: '2026-09-12 서울시장배 대회' });
    expect(result).toEqual({ renamed: true, name: '2026-09-12 서울시장배 대회' });
  });

  it('날짜가 바뀌어도 바꾼다', async () => {
    await albumService.syncFolderName(7, event({ title: 'A' }), event({ title: 'A', date: '2026-09-13' }));
    expect(renameFile).toHaveBeenCalledWith('at', 'folder-1', '2026-09-13 A');
  });

  it('제목·날짜가 그대로면 Drive 를 부르지 않는다', async () => {
    const result = await albumService.syncFolderName(7, event({ title: 'A', location: '옛 장소' }), event({ title: 'A', location: '새 장소' }));
    expect(renameFile).not.toHaveBeenCalled();
    expect(result.renamed).toBe(false);
  });

  it('앨범이 없으면 아무것도 하지 않는다', async () => {
    await albumService.syncFolderName(7, event({ driveFolderId: null, title: 'A' }), event({ driveFolderId: null, title: 'B' }));
    expect(renameFile).not.toHaveBeenCalled();
  });

  it('Drive 가 실패해도 던지지 않는다 — 이벤트 저장은 이미 끝났다', async () => {
    renameFile.mockRejectedValueOnce(new DriveError('invalid_grant', '끊김'));

    const result = await albumService.syncFolderName(7, event({ title: 'A' }), event({ title: 'B' }));

    expect(result.renamed).toBe(false);
    expect(result.error).toBe('끊김');
  });
});

describe('countViewers', () => {
  it('모델 값을 그대로 준다', async () => {
    await expect(albumService.countViewers(event())).resolves.toEqual({ participants: 7, all: 33 });
  });

  it('조회가 실패해도 0 명으로 계속 간다(앨범 화면은 떠야 한다)', async () => {
    Event.countAlbumViewers.mockRejectedValueOnce(new Error('DB 오류'));
    await expect(albumService.countViewers(event())).resolves.toEqual({ participants: 0, all: 0 });
  });
});
