import { jest } from '@jest/globals';

// 학부모가 볼 수 있는 범위 = 연결된 선생님 전부 (다대다)
jest.unstable_mockModule('../../models/ParentTeacher.js', () => ({
  default: { teacherIds: jest.fn().mockResolvedValue([7]), listTeachers: jest.fn().mockResolvedValue([]) }
}));

jest.unstable_mockModule('../../models/ParentAccount.js', () => ({
  default: { getByUserId: jest.fn() }
}));
jest.unstable_mockModule('../../models/ParentChild.js', () => ({
  default: { listByParent: jest.fn() }
}));
jest.unstable_mockModule('../../models/Student.js', () => ({ default: {} }));
jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { getPublishedForParent: jest.fn(), listWithAlbumsForParent: jest.fn() }
}));
jest.unstable_mockModule('../../models/EventRegistration.js', () => ({
  default: { listForStudents: jest.fn().mockResolvedValue([]) }
}));
jest.unstable_mockModule('../../models/Competition.js', () => ({
  default: { getStudentIds: jest.fn().mockResolvedValue([]) }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: { list: jest.fn().mockResolvedValue([]), summaries: jest.fn().mockResolvedValue({}), getById: jest.fn() }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listByMediaIds: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({ studentId: 5, source: 'parent_confirmed' }),
    removeAutoTagsForStudent: jest.fn().mockResolvedValue(0)
  }
}));
jest.unstable_mockModule('../../models/ChildFaceProfile.js', () => ({
  default: {
    listByStudent: jest.fn().mockResolvedValue([]),
    countByParentAndStudent: jest.fn().mockResolvedValue(0),
    countByStudent: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({ id: 1, createdAt: 'now' }),
    getById: jest.fn(),
    delete: jest.fn()
  },
  MAX_PER_PARENT: 3,
  MAX_PER_STUDENT: 5
}));
jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: { getByUserId: jest.fn().mockResolvedValue({ id: 11, status: 'connected' }) }
}));
jest.unstable_mockModule('../../services/albumService.js', () => ({
  default: {
    createUploadSessions: jest.fn().mockResolvedValue([]),
    completeUpload: jest.fn(),
    deleteMedia: jest.fn(),
    matchStudentAcrossAlbums: jest.fn().mockResolvedValue({ albums: 2, photos: 11, candidates: 3 })
  }
}));
jest.unstable_mockModule('../../utils/googleDrive.js', () => {
  class DriveError extends Error {
    constructor(code, message) { super(message); this.name = 'DriveError'; this.code = code; }
  }
  return { DriveError };
});

const ParentAccount = (await import('../../models/ParentAccount.js')).default;
const ParentTeacher = (await import('../../models/ParentTeacher.js')).default;
const ParentChild = (await import('../../models/ParentChild.js')).default;
const Event = (await import('../../models/Event.js')).default;
const EventRegistration = (await import('../../models/EventRegistration.js')).default;
const Competition = (await import('../../models/Competition.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const ChildFaceProfile = (await import('../../models/ChildFaceProfile.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const albumService = (await import('../../services/albumService.js')).default;
const {
  listAlbums, listMedia, createUploads, deleteMedia, confirmTag, addFace, deleteFace
} = await import('../parentAlbumController.js');

const parent = { id: 42, username: '하은엄마', role: 'parent' };
const DESCRIPTOR = new Array(128).fill(0.1);

const event = (overrides = {}) => ({
  id: 3, userId: 7, type: 'competition', title: '서울시 대회', date: '2026-09-12',
  driveFolderId: 'folder-1', driveAccountId: 11, albumStatus: 'ready',
  albumUploadOpen: true, isPublished: true, competitionId: 21,
  ...overrides
});

const child = (overrides = {}) => ({
  // 자녀는 선생님 1명의 학생이다 — 얼굴 매칭도 그 선생님 앨범에서만 한다
  id: 100, teacherId: 7, studentId: 5, childName: '김하은', studentName: '김하은', status: 'linked', ...overrides
});

let req;
let res;

beforeEach(() => {
  jest.clearAllMocks();
  req = { body: {}, params: { id: '3' }, query: {}, user: { ...parent } };
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // clearAllMocks 는 구현을 지우지 않으므로 기본값을 매번 다시 세운다 (기본은 "미확정").
  EventRegistration.listForStudents.mockResolvedValue([]);
  Competition.getStudentIds.mockResolvedValue([]);
  EventMedia.list.mockResolvedValue([]);
  MediaTag.listByMediaIds.mockResolvedValue({});
  ChildFaceProfile.countByParentAndStudent.mockResolvedValue(0);
  ChildFaceProfile.countByStudent.mockResolvedValue(0);
  ParentTeacher.teacherIds.mockResolvedValue([7]);
  ParentAccount.getByUserId.mockResolvedValue({ userId: 42, teacherId: 7 });
  ParentChild.listByParent.mockResolvedValue([child()]);
  Event.getPublishedForParent.mockResolvedValue(event());
  GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'connected' });
});

/** 자녀가 확정된 상태로 만든다 */
const makeConfirmed = () => EventRegistration.listForStudents.mockResolvedValue([{ studentId: 5, status: 'confirmed' }]);

describe('listAlbums — 확정된 이벤트만 보인다', () => {
  it('확정된 앨범만 돌려준다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([event(), event({ id: 4, competitionId: 22 })]);
    EventRegistration.listForStudents.mockImplementation((eventIds) =>
      Promise.resolve(eventIds[0] === 3 ? [{ studentId: 5, status: 'confirmed' }] : []));
    EventMedia.summaries.mockResolvedValue({ 3: { images: 27, videos: 3, mine: 11, previews: [] } });

    await listAlbums(req, res);

    const items = res.json.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ eventId: 3, counts: { images: 27, mine: 11 } });
  });

  it('선생님이 참가 학생으로 직접 넣은 경우도 확정으로 본다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([event()]);
    EventRegistration.listForStudents.mockResolvedValue([]);
    Competition.getStudentIds.mockResolvedValue([5]);

    await listAlbums(req, res);

    expect(res.json.mock.calls[0][0].items).toHaveLength(1);
  });

  it('확정된 것이 하나도 없으면 빈 목록이다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([event()]);

    await listAlbums(req, res);

    expect(res.json).toHaveBeenCalledWith({ items: [] });
  });

  it('연결된 선생님이 없으면 빈 목록이다', async () => {
    ParentTeacher.teacherIds.mockResolvedValue([]);

    await listAlbums(req, res);

    expect(res.json).toHaveBeenCalledWith({ items: [] });
  });
});

describe('listMedia', () => {
  it('미확정이면 403 과 사유를 준다', async () => {
    await listMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].reason).toBe('not_confirmed');
  });

  it('비공개 이벤트는 확정이어도 볼 수 없다', async () => {
    makeConfirmed();
    Event.getPublishedForParent.mockResolvedValue(null);   // 모델이 공개 조건으로 걸러낸다

    await listMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('확정이면 전체 사진을 준다', async () => {
    makeConfirmed();
    EventMedia.list.mockResolvedValue([
      { id: 1, kind: 'image', driveFileId: 'f1', originalName: 'a.jpg', takenAt: 't1', uploaderRole: 'teacher', uploaderUserId: 7 }
    ]);

    await listMedia(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].uploader).toBe('teacher');
    expect(payload.event).toMatchObject({ id: 3, uploadOpen: true });
  });

  it('우리 아이만 토글이면 내 자녀 태그로 거른다', async () => {
    makeConfirmed();
    req.query = { mine: '1' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ studentIds: [5] }));
  });

  it('우리 아이만 토글이 아니면 전체를 본다', async () => {
    makeConfirmed();

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ studentIds: null }));
  });

  it('내 아이가 아닌 학생 id 를 넣어도 내 아이 범위로만 본다', async () => {
    makeConfirmed();
    req.query = { mine: '1', studentId: '999' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ studentIds: [5] }));
  });

  it('다른 아이 태그는 응답에 담기지 않는다', async () => {
    makeConfirmed();
    EventMedia.list.mockResolvedValue([
      { id: 1, kind: 'image', driveFileId: 'f1', originalName: 'a.jpg', takenAt: 't', uploaderRole: 'parent', uploaderUserId: 99 }
    ]);
    MediaTag.listByMediaIds.mockResolvedValue({
      1: [{ studentId: 5, source: 'face' }, { studentId: 8, source: 'face' }]
    });

    await listMedia(req, res);

    const item = res.json.mock.calls[0][0].items[0];
    expect(item.myTags).toEqual([{ studentId: 5, name: '김하은', source: 'face' }]);
    expect(JSON.stringify(item)).not.toContain('"studentId":8');
  });
});

describe('createUploads', () => {
  it('확정 학부모는 올릴 수 있고, 파일 이름에 자녀 이름을 쓴다', async () => {
    makeConfirmed();
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(albumService.createUploadSessions).toHaveBeenCalledWith(
      7, expect.anything(), req.body.files,
      expect.objectContaining({ role: 'parent', label: '김하은', studentId: 5 })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('업로드 받기를 끄면 막힌다', async () => {
    makeConfirmed();
    Event.getPublishedForParent.mockResolvedValue(event({ albumUploadOpen: false }));
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].reason).toBe('upload_closed');
  });

  it('선생님 Drive 연결이 끊기면 안내한다', async () => {
    makeConfirmed();
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 11, status: 'error' });
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].reason).toBe('drive_error');
  });

  it('미확정 학부모는 업로드도 막힌다', async () => {
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('deleteMedia', () => {
  it('내가 올린 사진만 지울 수 있다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderRole: 'parent', uploaderUserId: 42 });
    req.params.mediaId = '5';

    await deleteMedia(req, res);

    expect(albumService.deleteMedia).toHaveBeenCalled();
  });

  it('선생님이 올린 사진은 지울 수 없다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderRole: 'teacher', uploaderUserId: 7 });
    req.params.mediaId = '5';

    await deleteMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(albumService.deleteMedia).not.toHaveBeenCalled();
  });

  it('다른 학부모가 올린 사진도 지울 수 없다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3, uploaderRole: 'parent', uploaderUserId: 99 });
    req.params.mediaId = '5';

    await deleteMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('confirmTag — 혹시 우리 아이?', () => {
  it('맞아요 는 parent_confirmed 로 남는다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3 });
    req.params.mediaId = '5';
    req.body = { studentId: 5, confirmed: true };

    await confirmTag(req, res);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'parent_confirmed' }));
  });

  it('아니에요 는 excluded 로 남아 다시 올라오지 않는다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3 });
    req.params.mediaId = '5';
    req.body = { studentId: 5, confirmed: false };

    await confirmTag(req, res);

    expect(MediaTag.upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'excluded' }));
  });

  it('내 아이가 아니면 막는다', async () => {
    makeConfirmed();
    EventMedia.getById.mockResolvedValue({ id: 5, eventId: 3 });
    req.params.mediaId = '5';
    req.body = { studentId: 999, confirmed: true };

    await confirmTag(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('addFace — 자녀 기준 얼굴', () => {
  beforeEach(() => {
    req.params = { childId: '100' };
  });

  it('동의 없이는 등록할 수 없다', async () => {
    req.body = { descriptor: DESCRIPTOR };

    await addFace(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].reason).toBe('consent_required');
  });

  it('얼굴 값이 올바르지 않으면 막는다', async () => {
    req.body = { descriptor: [1, 2, 3], consent: true };

    await addFace(req, res);

    expect(res.json.mock.calls[0][0].reason).toBe('invalid_descriptor');
  });

  it('등록하면 기존 앨범과 즉시 맞춰 보고 결과를 알려준다', async () => {
    req.body = { descriptor: DESCRIPTOR, consent: true };

    await addFace(req, res);

    expect(ChildFaceProfile.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: 5, teacherUserId: 7 }));
    expect(albumService.matchStudentAcrossAlbums).toHaveBeenCalledWith(7, 5);
    expect(res.json.mock.calls[0][0].matched).toEqual({ albums: 2, photos: 11, candidates: 3 });
  });

  it('3장을 넘기면 막는다', async () => {
    ChildFaceProfile.countByParentAndStudent.mockResolvedValue(3);
    req.body = { descriptor: DESCRIPTOR, consent: true };

    await addFace(req, res);

    expect(res.json.mock.calls[0][0].reason).toBe('limit');
  });

  it('연결되지 않은 자녀에는 등록할 수 없다', async () => {
    ParentChild.listByParent.mockResolvedValue([child({ status: 'pending', studentId: null })]);
    req.body = { descriptor: DESCRIPTOR, consent: true };

    await addFace(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('남의 아이 id 로는 등록할 수 없다', async () => {
    req.params = { childId: '999' };
    req.body = { descriptor: DESCRIPTOR, consent: true };

    await addFace(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('deleteFace', () => {
  beforeEach(() => {
    req.params = { childId: '100', profileId: '9' };
  });

  it('마지막 얼굴을 지우면 자동 태그도 함께 지운다', async () => {
    ChildFaceProfile.getById.mockResolvedValue({ id: 9, studentId: 5, parentUserId: 42 });
    ChildFaceProfile.countByStudent.mockResolvedValue(0);

    await deleteFace(req, res);

    expect(MediaTag.removeAutoTagsForStudent).toHaveBeenCalledWith(5);
  });

  it('아직 남은 얼굴이 있으면 다시 매칭한다', async () => {
    ChildFaceProfile.getById.mockResolvedValue({ id: 9, studentId: 5, parentUserId: 42 });
    ChildFaceProfile.countByStudent.mockResolvedValue(1);

    await deleteFace(req, res);

    expect(MediaTag.removeAutoTagsForStudent).not.toHaveBeenCalled();
    expect(albumService.matchStudentAcrossAlbums).toHaveBeenCalled();
  });

  it('내가 올린 것만 지울 수 있다', async () => {
    ChildFaceProfile.getById.mockResolvedValue({ id: 9, studentId: 5, parentUserId: 99 });

    await deleteFace(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
