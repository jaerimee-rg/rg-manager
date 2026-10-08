import {
  publishSummary, zeroAudienceWarning, driveNotice, canUploadWith, albumProblem, filterChips,
  targetState, uploadPublishNote, formatPublishedDate, formatEventDate, formatShortDate, toViewerItem, publishLocked
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
  it('앨범이 없으면 새 폴더, 있으면 사진 수와 공개 상태', () => {
    expect(targetState({ hasAlbum: false })).toEqual({ text: '새 폴더', badge: null });
    expect(targetState({ hasAlbum: true, count: 45, published: true })).toEqual({ text: '사진 45', badge: 'published' });
    expect(targetState({ hasAlbum: true, count: 0, published: false }).badge).toBe('private');
  });

  it('공개 중인 앨범이면 체크 대신 "바로 보여요" 안내', () => {
    expect(uploadPublishNote({ hasAlbum: true, published: true }).kind).toBe('already');
    expect(uploadPublishNote({ hasAlbum: false }).kind).toBe('option');
    expect(uploadPublishNote({ hasAlbum: true, published: false }).kind).toBe('option');
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
