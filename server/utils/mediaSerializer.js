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

import { isPlaceholderName } from './usernames.js';

// Drive 사진 변환 주소. drive.google.com/thumbnail 은 매번 이 주소로 302 를 보내는 문이라, 바로 부르면 한 번 덜 오간다
// (2026-10-09 운영 사진 80장을 휴대폰 설정 Chrome 에서 한꺼번에: 다 뜨기까지 2.4~3.5초 → 0.9~1.1초).
// 앨범 폴더가 링크 공유 중이어야 열리는 것은 같다. 뒤의 옵션: wN 폭 · hN 높이 · c 가운데 자르기 · rw WebP.
const IMAGE_BASE = 'https://lh3.googleusercontent.com/d';
const FILE_BASE = 'https://drive.google.com/file/d';

/**
 * 갤러리 칸용 정사각형 썸네일(WebP). 썸네일을 그리는 칸은 모두 정사각형이거나 그보다 납작하고 object-fit: cover 라
 * 가운데를 잘라 받아도 보이는 부분이 같다 — 세로 사진을 통째로 받을 때보다 바이트가 절반쯤이다.
 */
export const thumbnailUrl = (driveFileId, size = 400) =>
  (driveFileId ? `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=w${size}-h${size}-c-rw` : null);

/**
 * 앨범 카드 표지의 대표 사진 — **자르지 않고** 받는다. 선생님이 고른 보일 부분(object-position)을 브라우저가 맞추려면 사진 전체가
 * 있어야 한다(Google 이 가운데를 잘라 보내면 다른 부분은 아예 없다). 한 장이면 표지 전체를 채우니 폭 800(세로 사진은 800×1067),
 * 여러 장이면 칸이 작아 긴 변 640 — 2026-10-09 운영 사진·영상으로 확인(WebP).
 */
export const coverImageUrl = (driveFileId, { many = false } = {}) =>
  (driveFileId ? `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=${many ? 's640' : 'w800'}-rw` : null);

/** 보일 부분 고르기 창에 띄울 큰 사진(긴 변 1200, 자르지 않음) */
export const coverEditUrl = (driveFileId) =>
  (driveFileId ? `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=s1200-rw` : null);

/** 행의 보일 부분 { x, y } (event_media."coverFocusX/Y") — 비어 있으면 null(가운데) */
export const focusOf = (row) => (row?.coverFocusX == null || row?.coverFocusY == null
  ? null
  : { x: Number(row.coverFocusX), y: Number(row.coverFocusY) });

/** 보일 부분 { x, y } → CSS object-position. 없으면 null(브라우저 기본 = 가운데) */
export const focusPosition = (focus) => (focus ? `${focus.x}% ${focus.y}%` : null);

/**
 * 앨범 카드 표지의 대표 사진 주소들(고른 순서) — 선생님 사진 목록과 학부모 사진 탭이 같은 표지를 그린다.
 * 한 장이면 폭 800, 여러 장이면 긴 변 640. 보일 부분은 coverPositions 로 따로 간다.
 */
export const coverUrls = (driveFileIds = []) => {
  const many = driveFileIds.length > 1;
  return driveFileIds.map((id) => coverImageUrl(id, { many }));
};

/** 뷰어용 큰 사진 — 폭 기준, 원래 비율 그대로 */
export const largeImageUrl = (driveFileId, width = 1600) =>
  (driveFileId ? `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=w${width}` : null);

/**
 * 얼굴 목록 표지용 사진 — 브라우저가 얼굴을 잘라 쓴다(client utils/faceCrops.js). 원래 비율 그대로(=sN, 긴 변 N)라
 * 얼굴 상자(0~1)가 그대로 맞고, lh3 는 CORS 를 허락해 캔버스로 자를 수 있다. 얼굴이 작을수록 큰 사진이 필요하다:
 * 얼굴 긴 변이 60px(잘라 낸 96px ÷ 여백 1.6) 이상 되게, 100 단위로 올려 같은 사진은 브라우저 캐시를 나눠 쓴다.
 */
export const faceCoverUrl = (driveFileId, box) => {
  if (!driveFileId) return null;
  const side = Math.max(Number(box?.w) || 0, Number(box?.h) || 0) || 0.05;
  const size = Math.min(1920, Math.max(200, Math.ceil(60 / side / 100) * 100));
  return `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=s${size}`;
};

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
 * tags 는 **내 자녀 것만** 남기고, **이름은 싣지 않는다** — 얼굴 매칭이 틀릴 수 있어 사진 위에 아이 이름을
 * 붙여 보여 주지 않는다(2026-10). "우리 아이 사진만 보기" 거르기와 [맞아요/아니에요] 에는 studentId 면 된다.
 */
export const toParentMedia = (media, { myStudentIds = [], myUserId = null } = {}) => {
  const mine = new Set(myStudentIds.map(Number));
  const myTags = (media.tags || [])
    .filter((tag) => mine.has(Number(tag.studentId)) && tag.source !== 'excluded')
    .map((tag) => ({
      studentId: Number(tag.studentId),
      source: tag.source
    }));

  return {
    id: media.id,
    kind: media.kind,
    thumbnailUrl: thumbnailUrl(media.driveFileId, 400),
    largeUrl: largeImageUrl(media.driveFileId),
    originalUrl: originalUrl(media.driveFileId),
    previewUrl: media.kind === 'video' ? previewUrl(media.driveFileId) : null,
    downloadUrl: downloadUrl(media.driveFileId),
    fileName: media.originalName,
    takenAt: media.takenAt,
    // 선생님이 붙인 설명 — 학부모에게 보여 주려고 쓰는 글이다
    caption: media.caption || null,
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
  previews: (counts.previews || []).map((id) => thumbnailUrl(id, 400)),
  // 선생님이 고른 대표 사진들 — 있으면 카드가 이것만 보여 준다(학부모에게 보이는 사진만 남는다: EventMedia previewRows).
  // coverPositions 는 같은 순서의 보일 부분(CSS object-position, null = 가운데)
  covers: coverUrls(counts.covers || []),
  coverPositions: (counts.coverFocus || []).map(focusPosition)
});

/**
 * 선생님에게 보여 줄 "올린 사람" 이름. 모델이 학부모명 → 표시 이름 → username 순으로 골라 준다(EventMedia.list).
 * `카카오_1788076610466` 같은 자동 식별자는 이름이 아니다 — 이름을 정하지 않은 옛 계정이면 역할로만 적는다.
 */
export const uploaderNameOf = (media) => {
  const name = String(media?.uploaderName ?? '').trim();
  if (name && !isPlaceholderName(name)) return name;
  return media?.uploaderRole === 'teacher' ? '선생님' : '학부모';
};

/** 선생님용 미디어 한 건 — 관리에 필요한 정보를 모두 준다. */
export const toTeacherMedia = (media, { studentNames = {} } = {}) => ({
  id: media.id,
  kind: media.kind,
  driveFileId: media.driveFileId,
  thumbnailUrl: thumbnailUrl(media.driveFileId, 400),
  largeUrl: largeImageUrl(media.driveFileId),
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
  caption: media.caption || null,
  uploaderRole: media.uploaderRole,
  uploaderName: uploaderNameOf(media),
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
  coverImageUrl,
  coverEditUrl,
  coverUrls,
  focusOf,
  focusPosition,
  largeImageUrl,
  originalUrl,
  previewUrl,
  downloadUrl,
  toParentMedia,
  toParentAlbum,
  uploaderNameOf,
  toTeacherMedia
};
