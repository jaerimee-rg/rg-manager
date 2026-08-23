/**
 * 앨범 접근 규칙 (순수 함수).
 * 컨트롤러는 DB 에서 재료만 모아 이 함수들의 판정을 그대로 따른다.
 * 규칙 원문: docs/photo-sharing/01-requirements.md FR-200~205, 230, 238, 290
 */

/**
 * 확정 학부모 판정 (FR-200).
 *
 * 학부모의 자녀 중 하나라도
 *   (a) 이 이벤트 신청이 confirmed 이거나
 *   (b) 대회형이면 참가 학생(competition_students)에 이미 들어 있으면
 * 확정으로 본다. (b) 는 학부모 신청 없이 선생님이 직접 넣은 경우를 위한 것이다.
 *
 * childStudentIds: 학부모에게 연결된(linked) 학생 id 배열
 * confirmedStudentIds: 이 이벤트에서 confirmed 인 신청의 학생 id 배열
 * competitionStudentIds: 이 대회의 참가 학생 id 배열
 */
export const isConfirmedParent = ({ childStudentIds = [], confirmedStudentIds = [], competitionStudentIds = [] } = {}) => {
  if (!childStudentIds.length) return false;
  const confirmed = new Set([...confirmedStudentIds, ...competitionStudentIds].map(Number));
  return childStudentIds.some((id) => confirmed.has(Number(id)));
};

/** 확정된 자녀들만 추린다 (파일 이름·태그 표시에 쓴다). */
export const confirmedChildIds = ({ childStudentIds = [], confirmedStudentIds = [], competitionStudentIds = [] } = {}) => {
  const confirmed = new Set([...confirmedStudentIds, ...competitionStudentIds].map(Number));
  return childStudentIds.map(Number).filter((id) => confirmed.has(id));
};

/** 앨범을 볼 수 있는지 (FR-201, 203, 245). */
export const canViewAlbum = ({ isOwner = false, isConfirmed = false, isPublished = true, hasAlbum = true } = {}) => {
  if (isOwner) return { ok: hasAlbum, reason: hasAlbum ? undefined : 'no_album' };
  if (!hasAlbum) return { ok: false, reason: 'no_album' };
  if (!isPublished) return { ok: false, reason: 'not_published' };
  if (!isConfirmed) return { ok: false, reason: 'not_confirmed' };
  return { ok: true };
};

/**
 * 업로드할 수 있는지 (FR-230, 238, 294).
 * 선생님은 업로드 받기 토글과 무관하게 올릴 수 있다.
 */
export const canUpload = ({
  isOwner = false,
  isConfirmed = false,
  hasAlbum = true,
  albumUploadOpen = true,
  albumStatus = 'ready',
  driveStatus = 'connected',
  foreignAccount = false
} = {}) => {
  if (!hasAlbum) return { ok: false, reason: 'no_album' };
  if (!isOwner && !isConfirmed) return { ok: false, reason: 'not_confirmed' };
  if (albumStatus === 'missing') return { ok: false, reason: 'album_missing' };
  if (foreignAccount) return { ok: false, reason: 'foreign_account' };
  if (driveStatus !== 'connected') return { ok: false, reason: 'drive_error' };
  if (!isOwner && !albumUploadOpen) return { ok: false, reason: 'upload_closed' };
  return { ok: true };
};

/** 삭제 권한 (FR-281, 290): 선생님은 전부, 학부모는 본인이 올린 것만. */
export const canDeleteMedia = ({ role, userId, media } = {}) => {
  if (!media) return false;
  if (role === 'user' || role === 'admin') return true;
  return media.uploaderRole === 'parent' && Number(media.uploaderUserId) === Number(userId);
};

/** 선생님만 하는 관리 동작(숨김·태그·재분석) */
export const canManageAlbum = ({ isOwner = false, driveStatus = 'connected', albumStatus = 'ready' } = {}) => {
  if (!isOwner) return { ok: false, reason: 'not_owner' };
  if (albumStatus === 'missing') return { ok: false, reason: 'album_missing' };
  if (driveStatus !== 'connected') return { ok: false, reason: 'drive_error' };
  return { ok: true };
};

/** 화면에 그대로 보여줄 수 있는 한국어 사유. */
export const REASON_MESSAGES = {
  no_album: '아직 앨범이 없어요.',
  not_published: '아직 공개되지 않은 일정이에요.',
  not_confirmed: '자녀가 확정된 이벤트의 사진만 볼 수 있어요.',
  upload_closed: '업로드가 마감됐어요.',
  drive_error: '지금은 사진을 올릴 수 없어요. 선생님이 Google Drive 연결을 확인해야 해요.',
  album_missing: 'Drive 에서 앨범 폴더를 찾을 수 없어요.',
  foreign_account: '이전 Google 계정으로 만든 앨범이라 조회만 할 수 있어요.',
  not_owner: '이 앨범을 관리할 권한이 없어요.',
  drive_not_connected: '먼저 설정에서 Google Drive 를 연결해 주세요.',
  closure_event: '휴관일에는 앨범을 만들 수 없어요.'
};

export const reasonMessage = (reason) => REASON_MESSAGES[reason] || '지금은 할 수 없어요.';

export default {
  isConfirmedParent,
  confirmedChildIds,
  canViewAlbum,
  canUpload,
  canDeleteMedia,
  canManageAlbum,
  REASON_MESSAGES,
  reasonMessage
};
