/**
 * 응답 직렬화 (순수 함수).
 *
 * 학부모에게 나가는 미디어는 **화이트리스트**로만 만든다. 새 컬럼이 생겨도
 * 저절로 새어 나가지 않게 하기 위함이다 (NFR-4).
 * 특히 다음은 학부모에게 절대 내보내지 않는다:
 *   - 다른 자녀의 태그·이름
 *   - 얼굴 위치(box)·특징값(descriptor)
 *   - 올린 사람의 실명·사용자 id (선생님/내가 올림/학부모 세 가지로만 표시)
 *   - Drive 파일 이름(누구 아이 이름이 들어 있다)
 */

const THUMBNAIL_BASE = 'https://drive.google.com/thumbnail';
const FILE_BASE = 'https://drive.google.com/file/d';

export const thumbnailUrl = (driveFileId, size = 400) =>
  (driveFileId ? `${THUMBNAIL_BASE}?id=${encodeURIComponent(driveFileId)}&sz=w${size}` : null);

export const originalUrl = (driveFileId) =>
  (driveFileId ? `${FILE_BASE}/${encodeURIComponent(driveFileId)}/view` : null);

export const previewUrl = (driveFileId) =>
  (driveFileId ? `${FILE_BASE}/${encodeURIComponent(driveFileId)}/preview` : null);

/** 원본 저장(다운로드) 주소. 공유된 파일이면 로그인 없이도 내려받힌다. */
export const downloadUrl = (driveFileId) =>
  (driveFileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}` : null);

/** 학부모 화면에 보여줄 업로더 표기 */
const uploaderLabel = (media, myUserId) => {
  if (media.uploaderRole === 'teacher') return 'teacher';
  if (media.uploaderUserId && Number(media.uploaderUserId) === Number(myUserId)) return 'me';
  return 'parent';
};

/**
 * 학부모용 미디어 한 건.
 * tags 는 **내 자녀 것만** 남긴다.
 */
export const toParentMedia = (media, { myStudentIds = [], myUserId = null, studentNames = {} } = {}) => {
  const mine = new Set(myStudentIds.map(Number));
  const myTags = (media.tags || [])
    .filter((tag) => mine.has(Number(tag.studentId)) && tag.source !== 'excluded')
    .map((tag) => ({
      studentId: Number(tag.studentId),
      name: studentNames[tag.studentId] || null,
      source: tag.source
    }));

  return {
    id: media.id,
    kind: media.kind,
    thumbnailUrl: thumbnailUrl(media.driveFileId, 400),
    largeUrl: thumbnailUrl(media.driveFileId, 1600),
    originalUrl: originalUrl(media.driveFileId),
    previewUrl: media.kind === 'video' ? previewUrl(media.driveFileId) : null,
    downloadUrl: downloadUrl(media.driveFileId),
    fileName: media.originalName,
    takenAt: media.takenAt,
    width: media.width ?? null,
    height: media.height ?? null,
    durationMs: media.durationMs ?? null,
    uploader: uploaderLabel(media, myUserId),
    canDelete: media.uploaderRole === 'parent' && Number(media.uploaderUserId) === Number(myUserId),
    myTags,
    isMine: myTags.some((tag) => tag.source !== 'candidate'),
    isCandidate: myTags.some((tag) => tag.source === 'candidate')
  };
};

/** 학부모 앨범 목록의 카드 한 장 */
export const toParentAlbum = (event, counts = {}) => ({
  eventId: event.id,
  title: event.title,
  type: event.type,
  date: event.date,
  location: event.location || null,
  uploadOpen: Boolean(event.albumUploadOpen),
  albumStatus: event.albumStatus,
  counts: {
    images: counts.images || 0,
    videos: counts.videos || 0,
    mine: counts.mine || 0
  },
  previews: (counts.previews || []).map((id) => thumbnailUrl(id, 400))
});

/** 선생님용 미디어 한 건 — 관리에 필요한 정보를 모두 준다. */
export const toTeacherMedia = (media, { studentNames = {} } = {}) => ({
  id: media.id,
  kind: media.kind,
  driveFileId: media.driveFileId,
  thumbnailUrl: thumbnailUrl(media.driveFileId, 400),
  largeUrl: thumbnailUrl(media.driveFileId, 1600),
  originalUrl: originalUrl(media.driveFileId),
  previewUrl: media.kind === 'video' ? previewUrl(media.driveFileId) : null,
  downloadUrl: downloadUrl(media.driveFileId),
  fileName: media.originalName,
  driveName: media.driveName,
  mimeType: media.mimeType,
  size: Number(media.size) || 0,
  width: media.width ?? null,
  height: media.height ?? null,
  durationMs: media.durationMs ?? null,
  takenAt: media.takenAt,
  uploaderRole: media.uploaderRole,
  uploaderName: media.uploaderName || (media.uploaderRole === 'teacher' ? '선생님' : '학부모'),
  status: media.status,
  isHidden: Boolean(media.isHidden),
  faceStatus: media.faceStatus,
  faceCount: media.faceCount || 0,
  faces: (media.faces || []).map((face) => ({
    id: face.id,
    box: face.box,
    score: face.score
  })),
  tags: (media.tags || []).map((tag) => ({
    studentId: Number(tag.studentId),
    name: studentNames[tag.studentId] || null,
    source: tag.source,
    distance: tag.distance ?? null,
    faceId: tag.faceId ?? null
  }))
});

export default {
  thumbnailUrl,
  originalUrl,
  previewUrl,
  downloadUrl,
  toParentMedia,
  toParentAlbum,
  toTeacherMedia
};
