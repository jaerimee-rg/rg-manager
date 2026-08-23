import { toParentMedia, toTeacherMedia, toParentAlbum, thumbnailUrl, downloadUrl } from '../mediaSerializer.js';

const media = {
  id: 11,
  kind: 'image',
  driveFileId: 'file-abc',
  originalName: 'IMG_1234.jpg',
  driveName: '20260912_하은_IMG_1234.jpg',
  mimeType: 'image/jpeg',
  size: 3145728,
  width: 4032,
  height: 3024,
  durationMs: null,
  takenAt: '2026-09-12T10:24:00.000Z',
  uploaderUserId: 42,
  uploaderRole: 'parent',
  uploaderName: '하은엄마',
  status: 'ready',
  isHidden: false,
  faceStatus: 'done',
  faceCount: 2,
  faces: [{ id: 1, box: '{"x":0.1}', score: 0.9 }],
  tags: [
    { studentId: 5, source: 'face', distance: 0.31, faceId: 1 },
    { studentId: 9, source: 'face', distance: 0.28, faceId: 2 }
  ]
};

describe('toParentMedia — 학부모에게 나가는 것만 나간다 (NFR-4)', () => {
  const view = toParentMedia(media, { myStudentIds: [5], myUserId: 42, studentNames: { 5: '김하은', 9: '박서연' } });

  it('내 자녀 태그만 남기고 다른 아이는 지운다', () => {
    expect(view.myTags).toEqual([{ studentId: 5, name: '김하은', source: 'face' }]);
    expect(JSON.stringify(view)).not.toContain('박서연');
    expect(JSON.stringify(view)).not.toContain('"studentId":9');
  });

  it('얼굴 위치·특징값은 내보내지 않는다', () => {
    expect(view.faces).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('box');
    expect(JSON.stringify(view)).not.toContain('descriptor');
  });

  it('올린 사람의 실명·id·Drive 파일 이름을 내보내지 않는다', () => {
    expect(JSON.stringify(view)).not.toContain('하은엄마');
    expect(JSON.stringify(view)).not.toContain('uploaderUserId');
    expect(view.driveName).toBeUndefined();
  });

  it('내보내는 필드 목록을 고정한다 (새 컬럼이 저절로 새지 않게)', () => {
    expect(Object.keys(view).sort()).toEqual([
      'canDelete', 'downloadUrl', 'durationMs', 'fileName', 'height', 'id', 'isCandidate', 'isMine',
      'kind', 'largeUrl', 'myTags', 'originalUrl', 'previewUrl', 'takenAt', 'thumbnailUrl', 'uploader', 'width'
    ].sort());
  });

  it('내가 올린 사진이면 me 로, 삭제할 수 있다고 알려준다', () => {
    expect(view.uploader).toBe('me');
    expect(view.canDelete).toBe(true);
  });

  it('다른 학부모가 올린 사진은 이름 없이 parent 로만 보인다 (Q-4)', () => {
    const other = toParentMedia(media, { myStudentIds: [5], myUserId: 99 });
    expect(other.uploader).toBe('parent');
    expect(other.canDelete).toBe(false);
  });

  it('선생님이 올린 사진은 teacher 다', () => {
    const byTeacher = toParentMedia({ ...media, uploaderRole: 'teacher' }, { myStudentIds: [5], myUserId: 42 });
    expect(byTeacher.uploader).toBe('teacher');
    expect(byTeacher.canDelete).toBe(false);
  });

  it('우리 아이 여부와 후보 여부를 구분해준다 (필터·확인 묶음에 쓴다)', () => {
    expect(view.isMine).toBe(true);
    expect(view.isCandidate).toBe(false);

    const candidate = toParentMedia(
      { ...media, tags: [{ studentId: 5, source: 'candidate', distance: 0.55 }] },
      { myStudentIds: [5], myUserId: 42 }
    );
    expect(candidate.isMine).toBe(false);
    expect(candidate.isCandidate).toBe(true);
  });

  it('아니라고 확인한(excluded) 태그는 보여주지 않는다', () => {
    const excluded = toParentMedia(
      { ...media, tags: [{ studentId: 5, source: 'excluded' }] },
      { myStudentIds: [5], myUserId: 42 }
    );
    expect(excluded.myTags).toEqual([]);
    expect(excluded.isMine).toBe(false);
  });

  it('원본 저장 주소를 함께 준다 (뷰어의 저장 버튼)', () => {
    expect(view.downloadUrl).toBe('https://drive.google.com/uc?export=download&id=file-abc');
  });

  it('영상은 재생 주소를 준다', () => {
    const video = toParentMedia({ ...media, kind: 'video', durationMs: 64000 }, { myStudentIds: [], myUserId: 1 });
    expect(video.previewUrl).toBe('https://drive.google.com/file/d/file-abc/preview');
    expect(video.durationMs).toBe(64000);
  });
});

describe('toTeacherMedia', () => {
  const view = toTeacherMedia(media, { studentNames: { 5: '김하은', 9: '박서연' } });

  it('선생님은 얼굴 상자와 모든 태그를 본다', () => {
    expect(view.faces).toHaveLength(1);
    expect(view.tags.map((t) => t.name)).toEqual(['김하은', '박서연']);
  });

  it('올린 사람 이름을 그대로 보여준다', () => {
    expect(view.uploaderName).toBe('하은엄마');
  });

  it('올린 사람 이름이 없으면 역할로 채운다', () => {
    expect(toTeacherMedia({ ...media, uploaderName: null }).uploaderName).toBe('학부모');
    expect(toTeacherMedia({ ...media, uploaderName: null, uploaderRole: 'teacher' }).uploaderName).toBe('선생님');
  });
});

describe('toParentAlbum', () => {
  it('앨범 카드에 개수와 미리보기를 담는다', () => {
    const album = toParentAlbum(
      { id: 3, title: '대회', type: 'competition', date: '2026-09-12', location: '올림픽공원', albumUploadOpen: true, albumStatus: 'ready' },
      { images: 27, videos: 3, mine: 11, previews: ['a', 'b'] }
    );

    expect(album).toMatchObject({ eventId: 3, counts: { images: 27, videos: 3, mine: 11 }, uploadOpen: true });
    expect(album.previews[0]).toContain('id=a');
  });

  it('개수가 없으면 0 으로 채운다', () => {
    expect(toParentAlbum({ id: 1 }).counts).toEqual({ images: 0, videos: 0, mine: 0 });
  });
});

describe('URL 만들기', () => {
  it('파일 id 가 없으면 null 이다 (업로드 중인 행)', () => {
    expect(thumbnailUrl(null)).toBeNull();
    expect(downloadUrl(undefined)).toBeNull();
  });

  it('파일 id 를 URL 로 안전하게 감싼다', () => {
    expect(thumbnailUrl('a b')).toContain('id=a%20b');
  });
});
