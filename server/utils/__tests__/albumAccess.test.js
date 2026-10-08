import {
  isConfirmedParent,
  confirmedChildIds,
  canViewAlbum,
  canUpload,
  canDeleteMedia,
  canManageAlbum,
  reasonMessage,
  inAudience,
  isValidAudience
} from '../albumAccess.js';

describe('isConfirmedParent (FR-200)', () => {
  it('자녀 신청이 확정이면 확정 학부모다', () => {
    expect(isConfirmedParent({ childStudentIds: [5], confirmedStudentIds: [5] })).toBe(true);
  });

  it('신청 없이 선생님이 참가 학생으로 넣은 경우도 확정이다', () => {
    expect(isConfirmedParent({ childStudentIds: [5], competitionStudentIds: [5] })).toBe(true);
  });

  it('자녀가 여럿이면 하나만 확정이어도 된다', () => {
    expect(isConfirmedParent({ childStudentIds: [1, 2, 3], confirmedStudentIds: [3] })).toBe(true);
  });

  it('신청만 하고 확정 전이면 아직 아니다', () => {
    expect(isConfirmedParent({ childStudentIds: [5], confirmedStudentIds: [], competitionStudentIds: [] })).toBe(false);
  });

  it('연결된 자녀가 없으면 아니다', () => {
    expect(isConfirmedParent({ childStudentIds: [], confirmedStudentIds: [5] })).toBe(false);
  });

  it('문자열 id 가 섞여도 같은 학생으로 본다 (DB 와 쿼리 문자열의 차이)', () => {
    expect(isConfirmedParent({ childStudentIds: ['5'], confirmedStudentIds: [5] })).toBe(true);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(isConfirmedParent()).toBe(false);
  });
});

describe('confirmedChildIds', () => {
  it('확정된 자녀만 남긴다', () => {
    expect(confirmedChildIds({ childStudentIds: [1, 2, 3], confirmedStudentIds: [2], competitionStudentIds: [3] }))
      .toEqual([2, 3]);
  });
});

describe('canViewAlbum', () => {
  it('선생님은 앨범이 있으면 항상 본다 (비공개 이벤트여도)', () => {
    expect(canViewAlbum({ isOwner: true, isPublished: false, hasAlbum: true }).ok).toBe(true);
  });

  it('확정 학부모는 공개된 이벤트의 공개 앨범을 본다', () => {
    expect(canViewAlbum({ isConfirmed: true, isPublished: true, hasAlbum: true, albumPublished: true }).ok).toBe(true);
  });

  it('미확정 학부모는 막힌다 (공개 범위 = 참가 확정 학부모)', () => {
    expect(canViewAlbum({ isConfirmed: false, hasAlbum: true, albumPublished: true }))
      .toEqual({ ok: false, reason: 'not_confirmed' });
  });

  it('비공개 이벤트는 확정 학부모에게도 보이지 않는다 (FR-203)', () => {
    expect(canViewAlbum({ isConfirmed: true, isPublished: false, hasAlbum: true }))
      .toEqual({ ok: false, reason: 'not_published' });
  });

  it('앨범이 없으면 볼 것이 없다', () => {
    expect(canViewAlbum({ isConfirmed: true, hasAlbum: false })).toEqual({ ok: false, reason: 'no_album' });
  });
});

// docs/photo-menu 3.4 의 표를 칸마다 고정한다.
describe('canViewAlbum — 공개 단계 (photo-menu FR-540~541)', () => {
  const parent = (overrides) => ({ isPublished: true, hasAlbum: true, ...overrides });

  it('선생님(주인)은 비공개 앨범도 본다', () => {
    expect(canViewAlbum({ isOwner: true, hasAlbum: true, albumPublished: false }).ok).toBe(true);
  });

  it('비공개 앨범은 확정 학부모에게도 막힌다', () => {
    expect(canViewAlbum(parent({ isConfirmed: true, albumPublished: false })))
      .toEqual({ ok: false, reason: 'album_private' });
  });

  it('비공개는 확정 여부를 묻기 전에 막는다 — 미확정 학부모에게도 album_private', () => {
    expect(canViewAlbum(parent({ isConfirmed: false, albumPublished: false })).reason).toBe('album_private');
  });

  it('공개 여부를 빠뜨리면 닫힌 쪽(비공개)으로 본다', () => {
    expect(canViewAlbum(parent({ isConfirmed: true })).reason).toBe('album_private');
  });

  it('범위가 참가 확정 학부모면 확정 학부모만 본다', () => {
    expect(canViewAlbum(parent({ isConfirmed: true, albumPublished: true, audience: 'participants' })).ok).toBe(true);
    expect(canViewAlbum(parent({ isConfirmed: false, albumPublished: true, audience: 'participants' })).reason)
      .toBe('not_confirmed');
  });

  it('범위가 모든 학부모면 미확정 학부모도 본다', () => {
    expect(canViewAlbum(parent({ isConfirmed: false, albumPublished: true, audience: 'all' })).ok).toBe(true);
  });

  it('이벤트가 비공개면 앨범을 공개해도 막힌다 — not_published 가 album_private 보다 먼저', () => {
    expect(canViewAlbum({ isConfirmed: true, isPublished: false, hasAlbum: true, albumPublished: false }).reason)
      .toBe('not_published');
    expect(canViewAlbum({ isConfirmed: true, isPublished: false, hasAlbum: true, albumPublished: true, audience: 'all' }).reason)
      .toBe('not_published');
  });

  it('앨범이 없으면 공개 여부와 상관없이 no_album', () => {
    expect(canViewAlbum({ isConfirmed: true, hasAlbum: false, albumPublished: true }).reason).toBe('no_album');
  });
});

describe('inAudience · isValidAudience', () => {
  it('모든 학부모 범위는 확정 없이도 든다', () => {
    expect(inAudience({ audience: 'all', isConfirmed: false })).toBe(true);
    expect(inAudience({ audience: 'participants', isConfirmed: false })).toBe(false);
    expect(inAudience({ audience: 'participants', isConfirmed: true })).toBe(true);
  });

  it('범위 값은 두 가지만 받는다', () => {
    expect(isValidAudience('participants')).toBe(true);
    expect(isValidAudience('all')).toBe(true);
    expect(isValidAudience('everyone')).toBe(false);
    expect(isValidAudience(undefined)).toBe(false);
  });
});

describe('canUpload', () => {
  const base = { hasAlbum: true, albumUploadOpen: true, albumStatus: 'ready', driveStatus: 'connected', albumPublished: true };

  it('선생님은 비공개 앨범에도 올린다', () => {
    expect(canUpload({ ...base, isOwner: true, albumPublished: false }).ok).toBe(true);
  });

  it('학부모는 비공개 앨범에 올릴 수 없다', () => {
    expect(canUpload({ ...base, isConfirmed: true, albumPublished: false }))
      .toEqual({ ok: false, reason: 'album_private' });
  });

  it('범위가 모든 학부모면 미확정 학부모도 올린다', () => {
    expect(canUpload({ ...base, isConfirmed: false, audience: 'all' }).ok).toBe(true);
  });

  it('범위가 모든 학부모여도 업로드 받기를 끄면 막힌다', () => {
    expect(canUpload({ ...base, isConfirmed: false, audience: 'all', albumUploadOpen: false }).reason).toBe('upload_closed');
  });

  it('확정 학부모는 업로드할 수 있다', () => {
    expect(canUpload({ ...base, isConfirmed: true }).ok).toBe(true);
  });

  it('선생님은 업로드 받기를 꺼도 올릴 수 있다 (FR-238)', () => {
    expect(canUpload({ ...base, isOwner: true, albumUploadOpen: false }).ok).toBe(true);
  });

  it('업로드 받기를 끄면 학부모는 막힌다', () => {
    expect(canUpload({ ...base, isConfirmed: true, albumUploadOpen: false }))
      .toEqual({ ok: false, reason: 'upload_closed' });
  });

  it('미확정 학부모는 막힌다', () => {
    expect(canUpload({ ...base, isConfirmed: false })).toEqual({ ok: false, reason: 'not_confirmed' });
  });

  it('Drive 연결이 끊기면 선생님도 올릴 수 없다 (FR-294)', () => {
    expect(canUpload({ ...base, isOwner: true, driveStatus: 'error' }))
      .toEqual({ ok: false, reason: 'drive_error' });
  });

  it('폴더가 사라졌으면 막는다', () => {
    expect(canUpload({ ...base, isOwner: true, albumStatus: 'missing' }))
      .toEqual({ ok: false, reason: 'album_missing' });
  });

  it('이전 Google 계정으로 만든 앨범은 조회만 된다 (FR-214)', () => {
    expect(canUpload({ ...base, isOwner: true, foreignAccount: true }))
      .toEqual({ ok: false, reason: 'foreign_account' });
  });
});

describe('canDeleteMedia (FR-290)', () => {
  const media = { uploaderRole: 'parent', uploaderUserId: 42 };

  it('선생님은 남의 사진도 지울 수 있다', () => {
    expect(canDeleteMedia({ role: 'user', userId: 1, media })).toBe(true);
  });

  it('학부모는 본인이 올린 것만 지운다', () => {
    expect(canDeleteMedia({ role: 'parent', userId: 42, media })).toBe(true);
    expect(canDeleteMedia({ role: 'parent', userId: 43, media })).toBe(false);
  });

  it('학부모는 선생님이 올린 사진을 지울 수 없다', () => {
    expect(canDeleteMedia({ role: 'parent', userId: 42, media: { uploaderRole: 'teacher', uploaderUserId: 42 } }))
      .toBe(false);
  });

  it('미디어가 없으면 false', () => {
    expect(canDeleteMedia({ role: 'user', userId: 1, media: null })).toBe(false);
  });
});

describe('canManageAlbum', () => {
  it('소유자가 아니면 관리할 수 없다', () => {
    expect(canManageAlbum({ isOwner: false })).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('연결이 정상인 소유자는 관리한다', () => {
    expect(canManageAlbum({ isOwner: true }).ok).toBe(true);
  });
});

describe('reasonMessage', () => {
  it('사유마다 화면에 그대로 쓸 한국어를 준다', () => {
    expect(reasonMessage('not_confirmed')).toContain('확정된');
    expect(reasonMessage('upload_closed')).toContain('마감');
    expect(reasonMessage('album_private')).toContain('공개하지 않은');
  });

  it('모르는 사유에도 기본 문구를 준다', () => {
    expect(reasonMessage('무엇인가')).toBe('지금은 할 수 없어요.');
  });
});
