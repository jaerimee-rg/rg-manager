import {
  publishSummary, zeroAudienceWarning, driveNotice, canUploadWith, albumProblem, filterChips,
  targetState, uploadPublishNote, formatPublishedDate, formatEventDate, formatShortDate, toViewerItem, publishLocked,
  folderNameFrom, newFolderProblem, typeLabel, isPhotoFolder, publishPlaces
} from '../albumState';

describe('publishSummary (docs/photo-menu FR-521)', () => {
  it('비공개면 학부모에게 보이지 않는다고 쓴다', () => {
    expect(publishSummary({ published: false })).toEqual({
      on: false, state: '비공개', who: '학부모에게 보이지 않아요. 사진을 다 올린 뒤 공개하세요.'
    });
  });

  it('공개면 범위와 인원, 공개한 날을 한 줄로', () => {
    const s = publishSummary({ published: true, audience: 'participants', viewerCounts: { participants: 7, all: 33 }, publishedAt: '2026-10-13T01:00:00Z' });
    expect(s).toEqual({ on: true, state: '공개 중', who: '참가 확정 학부모 7명이 볼 수 있어요 · 10월 13일 공개' });
  });

  it('모든 학부모 범위는 전체 인원을 센다', () => {
    expect(publishSummary({ published: true, audience: 'all', viewerCounts: { participants: 0, all: 33 } }).who)
      .toBe('모든 학부모 33명이 볼 수 있어요');
  });
});

describe('zeroAudienceWarning (FR-522)', () => {
  it('참가 확정 범위인데 0명이면 경고', () => {
    expect(zeroAudienceWarning({ audience: 'participants', viewerCounts: { participants: 0 } })).toBe(true);
    expect(zeroAudienceWarning({ audience: 'participants', viewerCounts: { participants: 3 } })).toBe(false);
    expect(zeroAudienceWarning({ audience: 'all', viewerCounts: { participants: 0, all: 5 } })).toBe(false);
  });
});

describe('driveNotice · canUploadWith (FR-512)', () => {
  it.each([
    [{ configured: false }, 'not_configured'],
    [{ configured: true, connected: false }, 'not_connected'],
    [{ configured: true, connected: true, status: 'error' }, 'error'],
    [{ configured: true, connected: true, status: 'connected' }, null]
  ])('%o → %s', (drive, expected) => {
    expect(driveNotice(drive)).toBe(expected);
    expect(canUploadWith(drive)).toBe(expected === null);
  });
});

describe('albumProblem (FR-527) — 쓰기만 막을 사유', () => {
  const ok = { drive: { configured: true, connected: true, status: 'connected' }, albumStatus: 'ready' };
  it('정상이면 null', () => expect(albumProblem(ok)).toBeNull());
  it('연결 끊김', () => expect(albumProblem({ ...ok, drive: { ...ok.drive, status: 'error' } }).reason).toBe('drive_error'));
  it('이전 계정 앨범', () => expect(albumProblem({ ...ok, foreignAccount: true }).reason).toBe('foreign_account'));
  it('폴더 사라짐', () => expect(albumProblem({ ...ok, albumStatus: 'missing' }).reason).toBe('album_missing'));
});

describe('publishLocked', () => {
  it('폴더가 사라진 비공개 앨범만 잠근다 — 비공개로 돌리기는 언제나 된다', () => {
    expect(publishLocked({ albumStatus: 'missing', published: false })).toBe(true);
    expect(publishLocked({ albumStatus: 'missing', published: true })).toBe(false);
    expect(publishLocked({ albumStatus: 'ready', published: false })).toBe(false);
  });
});

describe('filterChips (FR-524)', () => {
  it('전체는 숨김까지 포함한다(선생님 목록)', () => {
    expect(filterChips({ images: 40, videos: 3, hidden: 2, fromTeacher: 40, fromParents: 5 })).toEqual([
      { key: 'all', label: '전체', count: 45 },
      { key: 'teacher', label: '선생님', count: 40 },
      { key: 'parent', label: '학부모', count: 5 },
      { key: 'hidden', label: '숨김', count: 2 }
    ]);
  });
});

describe('이벤트 고르기 (FR-513, 515)', () => {
  it('앨범이 없으면 사진 없음, 있으면 사진 수와 공개 상태', () => {
    expect(targetState({ hasAlbum: false })).toEqual({ text: '사진 없음', badge: null });
    expect(targetState({ hasAlbum: true, count: 45, published: true })).toEqual({ text: '사진 45', badge: 'published' });
    expect(targetState({ hasAlbum: true, count: 0, published: false }).badge).toBe('private');
  });

  it('공개 중인 앨범이면 체크 대신 "바로 보여요" 안내', () => {
    expect(uploadPublishNote({ hasAlbum: true, published: true }).kind).toBe('already');
    expect(uploadPublishNote({ hasAlbum: false }).kind).toBe('option');
    expect(uploadPublishNote({ hasAlbum: true, published: false }).kind).toBe('option');
  });
});

describe('새 폴더 만들기 · 사진 전용 폴더 (FR-517)', () => {
  it('폴더 이름은 서버와 같은 규칙 — 날짜 + 이름, Drive 금지 문자는 공백', () => {
    expect(folderNameFrom({ date: '2026-09-27', title: '가을 소풍' })).toBe('2026-09-27 가을 소풍');
    expect(folderNameFrom({ date: '2026-09-27', title: '  스페셜: 리본/곤봉  ' })).toBe('2026-09-27 스페셜 리본 곤봉');
    expect(folderNameFrom({ date: '2026-09-27', title: '' })).toBe('2026-09-27');
    expect(folderNameFrom({})).toBe('앨범');
    expect(folderNameFrom({ date: '2026-09-27', title: '가'.repeat(120) })).toHaveLength(100);
  });

  it('사진 전용 폴더는 종류 이름이 따로 있고, 공개하면 사진 탭에만 보인다', () => {
    expect(isPhotoFolder('folder')).toBe(true);
    expect(isPhotoFolder('special')).toBe(false);
    expect(typeLabel('folder')).toBe('사진 폴더');
    expect(typeLabel('competition')).toBe('대회');
    expect(publishPlaces('folder')).toBe('사진 탭');
    expect(publishPlaces('special')).toBe('사진 탭 · 이 이벤트 상세');
    expect(uploadPublishNote({ hasAlbum: true, published: true, type: 'folder' }).text).toMatch(/사진 탭에 보여요/);
    expect(uploadPublishNote({ hasAlbum: true, published: true, type: 'competition' }).text).toMatch(/이 이벤트 상세/);
  });

  it('이름과 날짜가 있어야 만들 수 있다', () => {
    expect(newFolderProblem({ title: '가을 소풍', date: '2026-09-27' })).toBeNull();
    expect(newFolderProblem({ title: '   ', date: '2026-09-27' })).toBe('이름을 입력해 주세요.');
    expect(newFolderProblem({ title: '가'.repeat(101), date: '2026-09-27' })).toBe('이름은 100자 이내로 입력해 주세요.');
    expect(newFolderProblem({ title: '가을 소풍', date: '' })).toBe('날짜를 선택해 주세요.');
  });
});

describe('날짜 · 뷰어', () => {
  it('날짜 문구', () => {
    expect(formatEventDate('2026-10-12')).toBe('2026-10-12 (월)');
    expect(formatShortDate('2026-08-30')).toBe('8.30 (일)');
    expect(formatPublishedDate('2026-10-12T16:00:00Z')).toBe('10월 13일');   // KST 로 하루 넘어간다
    expect(formatPublishedDate(null)).toBe('');
  });

  it('선생님 미디어는 뷰어에서 지울 수 있고 업로더 표기를 맞춘다', () => {
    expect(toViewerItem({ id: 1, uploaderRole: 'parent' })).toMatchObject({ uploader: 'parent', canDelete: true });
    expect(toViewerItem({ id: 2, uploaderRole: 'teacher' }).uploader).toBe('teacher');
  });
});
