/**
 * 사진 메뉴의 화면 문구·상태 판정 (순수 함수, docs/photo-menu).
 * 컴포넌트는 서버 응답을 그대로 넘기고, 무엇을 보여 줄지는 여기서 정한다.
 */

export const AUDIENCE_LABELS = {
  participants: '참가 확정 학부모',
  all: '모든 학부모'
};

/** 2026-10-13T01:00:00Z → "10월 13일" (한국 시간 기준) */
export const formatPublishedDate = (iso) => {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const kst = new Date(time + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};

/** 2026-10-12 → "2026-10-12 (월)" */
export const formatEventDate = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return date || '';
  const day = '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${date} (${day})`;
};

/** 2026-10-12 → "10.12 (월)" — 이벤트 고르기 목록 */
export const formatShortDate = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return date || '';
  const [, m, d] = date.split('-');
  const day = '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}.${Number(d)} (${day})`;
};

/**
 * 사진 전용 폴더 — 이벤트 없이 사진 메뉴에서 만든 앨범 (FR-517). 서버가 events 행 type='folder' 로 둔다.
 * 이벤트 상세가 없어서 공개하면 학부모 사진 탭에만 보이고, 공개 범위는 언제나 모든 학부모다.
 */
export const PHOTO_FOLDER_TYPE = 'folder';
export const isPhotoFolder = (type) => type === PHOTO_FOLDER_TYPE;

export const typeLabel = (type) => (
  type === 'competition' ? '대회' : type === 'special' ? '스페셜' : isPhotoFolder(type) ? '사진 폴더' : ''
);

/**
 * Google 연결 상태 → 사진 메뉴 안내 (FR-512).
 * → null(정상) | 'not_configured' | 'not_connected' | 'error'
 */
export const driveNotice = (drive) => {
  if (!drive) return null;
  if (drive.configured === false) return 'not_configured';
  if (!drive.connected) return 'not_connected';
  if (drive.status === 'error') return 'error';
  return null;
};

export const canUploadWith = (drive) => driveNotice(drive) === null;

/**
 * 공개 패널 문구 (FR-521).
 * → { on, state, who }
 */
export const publishSummary = ({ published, audience = 'participants', viewerCounts = {}, publishedAt } = {}) => {
  if (!published) {
    return { on: false, state: '비공개', who: '학부모에게 보이지 않아요. 사진을 다 올린 뒤 공개하세요.' };
  }
  const count = audience === 'all' ? viewerCounts.all : viewerCounts.participants;
  const date = formatPublishedDate(publishedAt);
  return {
    on: true,
    state: '공개 중',
    who: `${AUDIENCE_LABELS[audience] || AUDIENCE_LABELS.participants} ${count || 0}명이 볼 수 있어요${date ? ` · ${date} 공개` : ''}`
  };
};

/** "참가 확정" 범위인데 볼 학부모가 0명이면 경고 (FR-522) */
export const zeroAudienceWarning = ({ audience = 'participants', viewerCounts = {} } = {}) =>
  audience === 'participants' && !viewerCounts.participants;

/**
 * 앨범 화면에서 Drive 를 거치는 동작(올리기 · 지우기)을 막을 사유 (FR-527).
 * 읽기는 언제나 된다. 공개 · 공개 범위 · 숨기기는 앱 안의 일이라 Google 이 끊겨도 된다 —
 * 급히 비공개로 돌려야 할 때 막히면 안 된다. → null | { tone, reason }
 */
export const albumProblem = (album) => {
  if (!album) return null;
  const drive = album.drive || {};
  if (drive.configured === false) return { tone: 'neutral', reason: 'not_configured' };
  if (!drive.connected) return { tone: 'warning', reason: 'not_connected' };
  if (drive.status === 'error') return { tone: 'danger', reason: 'drive_error' };
  if (album.foreignAccount) return { tone: 'warning', reason: 'foreign_account' };
  if (album.albumStatus === 'missing') return { tone: 'danger', reason: 'album_missing' };
  return null;
};

export const PROBLEM_MESSAGES = {
  not_configured: 'Google Drive 연동이 아직 설정되지 않았어요. 관리자에게 문의해 주세요.',
  not_connected: '사진은 선생님 Google Drive 에 저장돼요. 설정에서 Google 계정을 먼저 연결해 주세요.',
  drive_error: 'Google 계정 연결이 끊어졌어요. 사진은 계속 보이지만 올리기 · 지우기는 멈춰요. 공개 설정과 숨기기는 그대로 할 수 있어요.',
  foreign_account: '이전 Google 계정으로 만든 앨범이라 볼 수만 있어요.',
  album_missing: 'Google Drive 에서 이 앨범 폴더를 찾을 수 없어요. Drive 휴지통을 확인하거나 [새로고침] 해 주세요.'
};

/** 사진 칸 필터 칩 (FR-524). 선생님 목록은 숨긴 사진도 포함한다. */
export const filterChips = (counts = {}) => {
  const visible = (counts.images || 0) + (counts.videos || 0);
  const hidden = counts.hidden || 0;
  return [
    { key: 'all', label: '전체', count: visible + hidden },
    { key: 'teacher', label: '선생님', count: counts.fromTeacher || 0 },
    { key: 'parent', label: '학부모', count: counts.fromParents || 0 },
    { key: 'hidden', label: '숨김', count: hidden }
  ];
};

/**
 * 이벤트 고르기 한 줄의 오른쪽 표시 (FR-513).
 * 앨범이 없는 이벤트는 "사진 없음" — 폴더는 고르면 아래에 "Drive 에 새로 만들 폴더" 로 보여 준다.
 * ("새 폴더" 라고 쓰면 맨 위의 "새 폴더 만들기" 와 헷갈린다, FR-517)
 */
export const targetState = (target) => {
  if (!target?.hasAlbum) return { text: '사진 없음', badge: null };
  return { text: `사진 ${target.count || 0}`, badge: target.published ? 'published' : 'private' };
};

/**
 * 서버 folderNameFromEvent 와 같은 규칙 — "2026-10-12 회장배 대회".
 * 새 폴더를 만들 때 Drive 에 생길 이름을 미리 보여 준다 (FR-517).
 */
export const FOLDER_NAME_MAX = 100;
export const folderNameFrom = ({ date, title } = {}) => {
  const day = String(date || '').slice(0, 10);
  const cleanTitle = String(title || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = `${day} ${cleanTitle}`.trim().slice(0, FOLDER_NAME_MAX).trim();
  return name || '앨범';
};

/** 새 폴더 입력 확인 — 서버 POST /api/albums 와 같은 규칙. → null | 안내 문구 */
export const NEW_FOLDER_TITLE_MAX = 100;
export const newFolderProblem = ({ title, date } = {}) => {
  const name = String(title || '').trim();
  if (!name) return '이름을 입력해 주세요.';
  if (name.length > NEW_FOLDER_TITLE_MAX) return `이름은 ${NEW_FOLDER_TITLE_MAX}자 이내로 입력해 주세요.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '날짜를 선택해 주세요.';
  return null;
};

/**
 * 사진 전용 폴더를 지울 때 확인 문구 (FR-519) — 무엇이 사라지고 무엇이 남는지.
 * 앱의 폴더와 사진 기록은 사라지고(학부모 화면에서도), Google Drive 의 폴더와 원본은 남는다.
 */
/** 이벤트(대회·스페셜)에 딸린 앨범인지 — 지워도 이벤트는 남는다. eventType 이 없으면 사진 폴더로 친다 */
const isEventAlbum = (album) => Boolean(album?.eventType) && !isPhotoFolder(album.eventType);

/** [폴더 삭제] 확인 창 제목 — 이벤트 앨범은 이벤트를 지우는 것으로 읽히지 않게 "사진 폴더" 라고 쓴다 */
export const folderDeleteTitle = (album) => (
  `‘${album?.eventTitle || ''}’ ${isEventAlbum(album) ? '사진 폴더' : '폴더'}를 지울까요?`
);

export const folderDeleteMessage = (album) => {
  const counts = album?.counts || {};
  const event = isEventAlbum(album);
  // 숨긴 것도 함께 사라진다 (images · videos 는 보이는 것만 센 수다)
  const total = (counts.images || 0) + (counts.videos || 0) + (counts.hidden || 0);
  const folder = event ? '사진 폴더' : '폴더';
  const what = total ? `${folder}와 사진·영상 ${total}개가` : `${folder}가`;
  const where = album?.published ? '앱과 학부모 화면에서' : '앱에서';
  // 이벤트 앨범은 앨범만 지운다 — 신청·참가 학생이 걸린 이벤트는 이벤트 관리에서만 지운다
  const kept = event ? ' 이벤트와 신청·참가 학생은 이벤트 관리에 그대로 남아요.' : '';
  const drive = album?.driveFolderId
    ? ' Google Drive 의 폴더와 원본 파일은 그대로 남아요.'
    : '';
  return `${what} ${where} 사라지고, 되돌릴 수 없어요.${kept}${drive}`;
};

/** 폴더를 지운 뒤 사진 목록에서 한 번 띄우는 알림 (DELETE /api/albums/:id 응답) */
export const folderDeletedToast = (result) => {
  if (result?.eventKept) return '사진 폴더를 지웠어요 · 이벤트와 Google Drive 의 폴더는 그대로 있어요';
  return result?.driveFolderKept ? '폴더를 지웠어요 · Google Drive 의 폴더는 그대로 있어요' : '폴더를 지웠어요';
};

/** 공개하면 학부모에게 보이는 곳 — 사진 전용 폴더는 이벤트 상세가 없다 (FR-515, 517) */
export const publishPlaces = (type) => (isPhotoFolder(type) ? '사진 탭' : '사진 탭 · 이 이벤트 상세');

/**
 * 공개하면 학부모에게 "새 사진" 알림이 가는지 — 사진 전용 폴더를 **처음** 공개할 때만 간다
 * (서버 albumController.updateAlbum → services/eventPush.notifyParentsOfPhotoFolder).
 * 이벤트 앨범이나, 한 번 공개했다가 비공개로 돌린 폴더는 다시 공개해도 알리지 않는다.
 */
export const publishNotifiesParents = ({ type, publishedAt } = {}) => isPhotoFolder(type) && !publishedAt;
export const PUBLISH_PUSH_HINT = '처음 공개하면 알림을 켠 학부모에게 새 사진 알림이 가요';

/** 고른 이벤트(폴더)의 앨범으로 올렸을 때 학부모에게 바로 보이는지 (FR-515) */
export const uploadPublishNote = (target) => {
  if (target?.hasAlbum && target.published) {
    return {
      kind: 'already',
      text: isPhotoFolder(target.type)
        ? '공개 중인 폴더라 올리면 바로 학부모 사진 탭에 보여요.'
        : '공개 중인 앨범이라 올리면 바로 학부모에게 보여요 — 사진 탭과 이 이벤트 상세.'
    };
  }
  return { kind: 'option', text: '다 올리면 바로 학부모에게 공개' };
};

/** 공개 패널을 잠글지 — Drive 에서 폴더가 사라진 비공개 앨범은 서버가 공개를 거절한다(비공개로 돌리기는 언제나 된다) */
export const publishLocked = (album) => Boolean(album && album.albumStatus === 'missing' && !album.published);

/** 서버의 선생님용 미디어 → MediaViewer 가 읽는 모양 */
export const toViewerItem = (item) => ({
  ...item,
  uploader: item.uploaderRole === 'teacher' ? 'teacher' : 'parent',
  canDelete: true
});

/**
 * 전체 사진(모든 폴더)의 미디어 → 뷰어. 어느 폴더의 사진인지(albumTitle)를 정보 줄에 보여 준다.
 * 지우기는 폴더 화면에서만 한다 — Drive 연결·폴더 상태는 폴더마다 다르다.
 */
export const toAllPhotosViewerItem = (item) => ({
  ...toViewerItem(item),
  canDelete: false,
  albumTitle: item.album?.title || null
});

export default {
  AUDIENCE_LABELS,
  formatPublishedDate,
  formatEventDate,
  formatShortDate,
  typeLabel,
  driveNotice,
  canUploadWith,
  publishSummary,
  zeroAudienceWarning,
  albumProblem,
  publishLocked,
  PROBLEM_MESSAGES,
  filterChips,
  targetState,
  PHOTO_FOLDER_TYPE,
  isPhotoFolder,
  publishPlaces,
  folderDeleteTitle,
  folderDeleteMessage,
  folderDeletedToast,
  folderNameFrom,
  newFolderProblem,
  uploadPublishNote,
  toViewerItem,
  toAllPhotosViewerItem
};
