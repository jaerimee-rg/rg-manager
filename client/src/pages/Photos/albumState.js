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

export const typeLabel = (type) => (type === 'competition' ? '대회' : type === 'special' ? '스페셜' : '');

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
 * 앨범 화면에서 쓰기(올리기·고르기·공개 바꾸기)를 막을 사유 (FR-527).
 * 읽기는 언제나 된다. → null | { tone, reason }
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
  drive_error: 'Google 계정 연결이 끊어졌어요. 사진은 계속 보이지만 올리기 · 지우기 · 공개 설정 바꾸기는 멈춰요.',
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

/** 이벤트 고르기 한 줄의 오른쪽 표시 (FR-513) */
export const targetState = (target) => {
  if (!target?.hasAlbum) return { text: '새 폴더', badge: null };
  return { text: `사진 ${target.count || 0}`, badge: target.published ? 'published' : 'private' };
};

/** 고른 이벤트의 앨범으로 올렸을 때 학부모에게 바로 보이는지 (FR-515) */
export const uploadPublishNote = (target) => {
  if (target?.hasAlbum && target.published) {
    return { kind: 'already', text: '공개 중인 앨범이라 올리면 바로 학부모에게 보여요 — 사진 탭과 이 이벤트 상세.' };
  }
  return { kind: 'option', text: '다 올리면 바로 학부모에게 공개' };
};

/** 서버의 선생님용 미디어 → MediaViewer 가 읽는 모양 */
export const toViewerItem = (item) => ({
  ...item,
  uploader: item.uploaderRole === 'teacher' ? 'teacher' : 'parent',
  canDelete: true
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
  PROBLEM_MESSAGES,
  filterChips,
  targetState,
  uploadPublishNote,
  toViewerItem
};
