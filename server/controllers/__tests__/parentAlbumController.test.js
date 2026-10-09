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
jest.unstable_mockModule('../../models/ParentInvite.js', () => ({
  default: { getOrCreate: jest.fn(), isUsable: jest.fn() }
}));
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
jest.unstable_mockModule('../../models/MediaFace.js', () => ({
  default: { listForAlbum: jest.fn().mockResolvedValue([]) }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listForAlbum: jest.fn().mockResolvedValue([]),
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
    matchStudentAcrossAlbums: jest.fn().mockResolvedValue({ albums: 2, photos: 11, candidates: 3 }),
    ensureAlbumsMatched: jest.fn().mockResolvedValue(0),
    markAlbumsStale: jest.fn().mockResolvedValue(undefined),
    indexFaces: jest.fn().mockResolvedValue({ faceStatus: 'done', faceCount: 2 })
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
const MediaFace = (await import('../../models/MediaFace.js')).default;
const ChildFaceProfile = (await import('../../models/ChildFaceProfile.js')).default;
const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const ParentInvite = (await import('../../models/ParentInvite.js')).default;
const albumService = (await import('../../services/albumService.js')).default;
const {
  listAlbums, listMedia, listPeople, createUploads, deleteMedia, confirmTag, addFace, deleteFace, uploadLabelChild,
  saveOwnFaces
} = await import('../parentAlbumController.js');

const parent = { id: 42, username: '하은엄마', role: 'parent' };
const DESCRIPTOR = new Array(512).fill(0.1);

// 기본은 "선생님이 공개한 앨범, 공개 범위 = 참가 확정 학부모" (docs/photo-menu)
const event = (overrides = {}) => ({
  id: 3, userId: 7, type: 'competition', title: '서울시 대회', date: '2026-09-12',
  driveFolderId: 'folder-1', driveAccountId: 11, albumStatus: 'ready',
  albumUploadOpen: true, isPublished: true, competitionId: 21,
  albumPublished: true, albumAudience: 'participants',
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

  ParentInvite.getOrCreate.mockResolvedValue({ id: 5, userId: 7, token: 'inv-tok' });
  ParentInvite.isUsable.mockReturnValue(true);

  // clearAllMocks 는 구현을 지우지 않으므로 기본값을 매번 다시 세운다 (기본은 "미확정").
  EventRegistration.listForStudents.mockResolvedValue([]);
  Competition.getStudentIds.mockResolvedValue([]);
  EventMedia.list.mockResolvedValue([]);
  MediaTag.listByMediaIds.mockResolvedValue({});
  MediaTag.listForAlbum.mockResolvedValue([]);
  MediaFace.listForAlbum.mockResolvedValue([]);
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
    // "우리 아이 N장" 을 세기 전에, 보이는 앨범만 지금 규칙으로 맞춰 둔다
    expect(albumService.ensureAlbumsMatched).toHaveBeenCalledWith([expect.objectContaining({ id: 3 })]);
    expect(albumService.ensureAlbumsMatched.mock.invocationCallOrder[0])
      .toBeLessThan(EventMedia.summaries.mock.invocationCallOrder[0]);
  });

  it('선생님이 참가 학생으로 직접 넣은 경우도 확정으로 본다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([event()]);
    EventRegistration.listForStudents.mockResolvedValue([]);
    Competition.getStudentIds.mockResolvedValue([5]);
    EventMedia.summaries.mockResolvedValue({ 3: { images: 1, videos: 0, mine: 0, previews: [] } });

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

  it('공개 범위가 모든 학부모인 앨범은 확정 없이도 보인다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([event({ albumAudience: 'all', type: 'special', competitionId: null })]);
    EventMedia.summaries.mockResolvedValue({ 3: { images: 0, videos: 2, mine: 0, previews: [] } });

    await listAlbums(req, res);

    expect(res.json.mock.calls[0][0].items).toHaveLength(1);
    expect(EventRegistration.listForStudents).not.toHaveBeenCalled();
  });

  it('보일 사진·영상이 없는 앨범(다 지웠거나 다 숨겼다)은 빈 카드로 두지 않는다', async () => {
    Event.listWithAlbumsForParent.mockResolvedValue([
      event({ id: 31, albumAudience: 'all', type: 'special', competitionId: null }),
      event({ id: 32, albumAudience: 'all', type: 'folder', competitionId: null }),
      event({ id: 33, albumAudience: 'all', type: 'special', competitionId: null })
    ]);
    // 31 = 사진이 하나도 없음(요약에 없음), 32 = 0장으로 셈, 33 = 영상 하나
    EventMedia.summaries.mockResolvedValue({
      32: { images: 0, videos: 0, mine: 0, previews: [] },
      33: { images: 0, videos: 1, mine: 0, previews: [] }
    });

    await listAlbums(req, res);

    expect(EventMedia.summaries).toHaveBeenCalledWith([31, 32, 33], expect.anything());
    expect(res.json.mock.calls[0][0].items.map((item) => item.eventId)).toEqual([33]);
  });
});

describe('listMedia — 공개 단계 (photo-menu FR-541)', () => {
  it('선생님이 공개하지 않은 앨범은 확정 학부모에게도 403 album_private', async () => {
    makeConfirmed();
    Event.getPublishedForParent.mockResolvedValue(event({ albumPublished: false }));

    await listMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ reason: 'album_private', error: expect.stringContaining('공개하지 않은') });
    expect(EventMedia.list).not.toHaveBeenCalled();
  });

  it('앨범 화면은 사진 전용 폴더도 읽는다 — 이벤트 상세와 달리 includeFolders (FR-517)', async () => {
    Event.getPublishedForParent.mockResolvedValue(event({ type: 'folder', albumAudience: 'all' }));

    await listMedia(req, res);

    expect(Event.getPublishedForParent).toHaveBeenCalledWith(expect.anything(), expect.anything(), { includeFolders: true });
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('공개 범위가 모든 학부모면 미확정 학부모도 본다', async () => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumAudience: 'all' }));

    await listMedia(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].items).toEqual([]);
  });
});

/**
 * 앨범 위 얼굴 목록 — 2026-10-09 학부모에게도 앨범의 모든 얼굴을 보여 주기로 했다(우리 아이만이 아니라).
 * 대신 나가는 값은 얼굴을 잘라 그릴 사진 주소·상자와 사진 수뿐이다: 다른 아이의 이름·학생 id·특징값은 없다.
 */
describe('얼굴 목록 (앨범의 사람마다 얼굴 하나)', () => {
  // 8차원 단위 벡터 — 같은 축이면 같은 사람
  const axis = (i) => Float32Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0));
  const face = (id, mediaId, descriptor, w = 0.1) => ({
    id, mediaId, box: { x: 0.2, y: 0.3, w, h: w }, score: 0.9, descriptor, driveFileId: `file-${mediaId}`
  });
  // 남의 아이(학생 9): 사진 1·2·3 / 우리 아이(학생 5, 얼굴 태그): 사진 2·4
  const albumFaces = () => [
    face(11, 1, axis(0), 0.2), face(12, 2, axis(0)), face(13, 3, axis(0)),
    face(21, 2, axis(3)), face(22, 4, axis(3), 0.04)
  ];
  const albumTags = () => [
    { mediaId: 2, studentId: 5, source: 'face', faceId: 21 },
    { mediaId: 1, studentId: 9, source: 'face', faceId: 11 }
  ];

  beforeEach(() => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumAudience: 'all' }));
    MediaFace.listForAlbum.mockResolvedValue(albumFaces());
    MediaTag.listForAlbum.mockResolvedValue(albumTags());
  });

  it('우리 아이를 먼저, 그다음 사진 많은 사람 — 숨긴 사진은 빼고 묶는다', async () => {
    await listPeople(req, res);

    expect(MediaFace.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: false });
    expect(MediaTag.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: false });
    const { people } = res.json.mock.calls[0][0];
    expect(people.map(({ key, mine, photoCount }) => ({ key, mine, photoCount }))).toEqual([
      { key: 'p21', mine: true, photoCount: 2 },
      { key: 'p11', mine: false, photoCount: 3 }
    ]);
    // 표지 = 가장 큰 얼굴, 얼굴이 작을수록 큰 사진(긴 변 N)을 받는다
    expect(people[1].cover).toEqual({ url: 'https://lh3.googleusercontent.com/d/file-1=s300', box: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 } });
    expect(people[0].cover.url).toBe('https://lh3.googleusercontent.com/d/file-2=s600');
  });

  it('나가는 값은 화이트리스트 — 다른 아이의 이름·학생 id·특징값·사진 id 목록이 없다', async () => {
    await listPeople(req, res);

    for (const person of res.json.mock.calls[0][0].people) {
      expect(Object.keys(person).sort()).toEqual(['cover', 'key', 'mine', 'photoCount']);
      expect(Object.keys(person.cover).sort()).toEqual(['box', 'url']);
      expect(Object.keys(person.cover.box).sort()).toEqual(['h', 'w', 'x', 'y']);
    }
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/studentId|descriptor|faceIds|mediaIds/);
  });

  it('볼 수 없는 앨범이면 얼굴 목록도 403 — 묶지도 않는다', async () => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumPublished: false }));

    await listPeople(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(MediaFace.listForAlbum).not.toHaveBeenCalled();
  });

  it('?person= 이면 그 사람이 나온 사진만 — "우리 아이만" 은 함께 켜지 않는다', async () => {
    req.query = { person: 'p11', mine: '1' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ mediaIds: [1, 2, 3], studentIds: null }));
    expect(res.json.mock.calls[0][0].personMissing).toBeUndefined();
    expect(res.json.mock.calls[0][0].candidates).toEqual([]);
  });

  it('그 사이 없어진 사람이면 빈 목록 + personMissing (모든 사진을 보여 주지 않는다)', async () => {
    req.query = { person: 'p999' };

    await listMedia(req, res);

    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ mediaIds: [] }));
    expect(res.json.mock.calls[0][0]).toMatchObject({ personMissing: true, items: [] });
  });

  it('person 이 없으면 묶지 않는다 — 평소 목록은 그대로', async () => {
    await listMedia(req, res);

    expect(MediaFace.listForAlbum).not.toHaveBeenCalled();
    expect(EventMedia.list).toHaveBeenCalledWith(3, expect.objectContaining({ mediaIds: null }));
  });
});

describe('listMedia — 학부모도 사진 폴더 링크를 공유한다 (photo-menu FR-518)', () => {
  it('앨범을 볼 수 있는 학부모에게 선생님 것과 같은 공유 주소(앨범 주인 선생님의 초대 포함)를 준다', async () => {
    makeConfirmed();

    await listMedia(req, res);

    expect(ParentInvite.getOrCreate).toHaveBeenCalledWith(7);   // 이 앨범의 주인 선생님
    expect(res.json.mock.calls[0][0].sharePath).toBe('/parent/photos/3?invite=inv-tok');
  });

  it('앨범을 볼 수 없는 학부모에게는 주지 않는다 — 초대 토큰도 읽지 않는다', async () => {
    await listMedia(req, res);   // 기본은 미확정

    expect(res.status).toHaveBeenCalledWith(403);
    expect(ParentInvite.getOrCreate).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].sharePath).toBeUndefined();
  });

  it('초대가 만료됐으면 초대 없는 주소만 준다', async () => {
    makeConfirmed();
    ParentInvite.isUsable.mockReturnValue(false);

    await listMedia(req, res);

    expect(res.json.mock.calls[0][0].sharePath).toBe('/parent/photos/3');
  });
});

describe('listMedia', () => {
  it('미확정이면 403 과 사유를 준다', async () => {
    await listMedia(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].reason).toBe('not_confirmed');
    expect(albumService.ensureAlbumsMatched).not.toHaveBeenCalled();
  });

  it('사진을 읽기 전에 앨범의 자동 태그를 지금 규칙으로 맞춘다 — "우리 아이만 보기" 에 낡은 태그가 나오지 않게', async () => {
    makeConfirmed();
    EventMedia.list.mockResolvedValue([]);

    await listMedia(req, res);

    expect(albumService.ensureAlbumsMatched).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(albumService.ensureAlbumsMatched.mock.invocationCallOrder[0])
      .toBeLessThan(EventMedia.list.mock.invocationCallOrder[0]);
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
    expect(item.myTags).toEqual([{ studentId: 5, source: 'face' }]);
    expect(JSON.stringify(item)).not.toContain('김하은');
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

  it('비공개 앨범에는 올릴 수 없다', async () => {
    makeConfirmed();
    Event.getPublishedForParent.mockResolvedValue(event({ albumPublished: false }));
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].reason).toBe('album_private');
    expect(albumService.createUploadSessions).not.toHaveBeenCalled();
  });

  it('모든 학부모 범위면 미확정 학부모도 올리고, 파일 이름에는 그 선생님 반 아이 이름을 쓴다', async () => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumAudience: 'all' }));
    ParentChild.listByParent.mockResolvedValue([
      child({ id: 101, teacherId: 9, studentId: 6, studentName: '다른반아이' }),
      child()
    ]);
    req.body = { files: [{ name: 'a.jpg', size: 100 }] };

    await createUploads(req, res);

    expect(albumService.createUploadSessions).toHaveBeenCalledWith(
      7, expect.anything(), req.body.files,
      expect.objectContaining({ role: 'parent', label: '김하은', studentId: 5 })
    );
  });
});

describe('uploadLabelChild', () => {
  const kids = [
    { studentId: 6, teacherId: 9, studentName: '다른반' },
    { studentId: 5, teacherId: 7, studentName: '김하은' },
    { studentId: 8, teacherId: 7, studentName: '김하준' }
  ];

  it('확정된 아이가 먼저다', () => {
    expect(uploadLabelChild(kids, [8], 7).studentId).toBe(8);
  });

  it('확정된 아이가 없으면 그 선생님 반의 첫 아이', () => {
    expect(uploadLabelChild(kids, [], 7).studentId).toBe(5);
  });

  it('그 선생님 반 아이도 없으면 null (이름은 "학부모")', () => {
    expect(uploadLabelChild(kids, [], 99)).toBeNull();
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
    // 새 기준 얼굴로 다른 아이의 태그도 달라질 수 있다 — 앨범은 다음에 열 때 전부 다시 매칭한다
    expect(albumService.markAlbumsStale).toHaveBeenCalledWith(7);
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

  it('지우면 그 선생님의 앨범을 다음에 열 때 전부 다시 매칭하게 한다 (다른 아이 태그도 달라질 수 있다)', async () => {
    ChildFaceProfile.getById.mockResolvedValue({ id: 9, studentId: 5, parentUserId: 42 });
    ChildFaceProfile.countByStudent.mockResolvedValue(1);

    await deleteFace(req, res);

    expect(albumService.markAlbumsStale).toHaveBeenCalledWith(7);
  });

  it('내가 올린 것만 지울 수 있다', async () => {
    ChildFaceProfile.getById.mockResolvedValue({ id: 9, studentId: 5, parentUserId: 99 });

    await deleteFace(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

/**
 * 업로드 때 분석이 실패한 사진을 업로드 시트가 다 올린 뒤 다시 분석해 보내는 곳 — 내가 올린, 아직 분석이 필요한 사진만.
 */
describe('saveOwnFaces — 내가 올린 사진의 얼굴 다시 저장', () => {
  const FACES = [{ box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, score: 0.9, descriptor: DESCRIPTOR }];
  const photo = (overrides = {}) => ({
    id: 70, eventId: 3, kind: 'image', status: 'ready', uploaderUserId: 42, faceStatus: 'skipped', faceAnalyzerVersion: null,
    ...overrides
  });

  beforeEach(() => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumAudience: 'all' }));
    req.params = { id: '3', mediaId: '70' };
    req.body = { faces: FACES, analyzerVersion: 3 };
    EventMedia.getById.mockResolvedValue(photo());
  });

  it('업로드 때 분석하지 못한(skipped) 내 사진이면 저장하고 매칭까지 한다', async () => {
    await saveOwnFaces(req, res);

    expect(albumService.indexFaces).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), expect.objectContaining({ id: 70 }), FACES, { analyzerVersion: 3 });
    expect(res.json).toHaveBeenCalledWith({ faceStatus: 'done', faceCount: 2 });
  });

  it('남이 올린 사진은 403', async () => {
    EventMedia.getById.mockResolvedValue(photo({ uploaderUserId: 7 }));

    await saveOwnFaces(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(albumService.indexFaces).not.toHaveBeenCalled();
  });

  it('이미 지금 방식으로 분석된 사진은 덮어쓰지 않는다 (409)', async () => {
    EventMedia.getById.mockResolvedValue(photo({ faceStatus: 'done', faceAnalyzerVersion: 3 }));

    await saveOwnFaces(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].reason).toBe('already_analyzed');
    expect(albumService.indexFaces).not.toHaveBeenCalled();
  });

  it('다른 앨범의 사진·다 올라가지 않은 사진은 404', async () => {
    EventMedia.getById.mockResolvedValue(photo({ eventId: 99 }));
    await saveOwnFaces(req, res);
    expect(res.status).toHaveBeenLastCalledWith(404);

    EventMedia.getById.mockResolvedValue(photo({ status: 'uploading' }));
    await saveOwnFaces(req, res);
    expect(res.status).toHaveBeenLastCalledWith(404);
    expect(albumService.indexFaces).not.toHaveBeenCalled();
  });

  it('볼 수 없는 앨범이면 사진을 읽지도 않는다', async () => {
    Event.getPublishedForParent.mockResolvedValue(event({ albumPublished: false }));

    await saveOwnFaces(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(EventMedia.getById).not.toHaveBeenCalled();
  });

  it('분석 결과가 배열이 아니면 400 — 실패(null)를 "얼굴 없음" 으로 바꾸지 않는다', async () => {
    req.body = { faces: null };

    await saveOwnFaces(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(albumService.indexFaces).not.toHaveBeenCalled();
  });
});

