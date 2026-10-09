/**
 * 업로드 파일과 폴더 이름 검증 (순수 함수).
 * 화면과 서버가 같은 규칙을 쓰도록 여기 한 곳에만 둔다.
 */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;   // 사진 25MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 영상 500MB
export const MAX_FILES_PER_UPLOAD = 30;
/** 앨범 대표 사진(사진 목록 카드의 표지)은 몇 장까지 — 카드 표지 칸이 2×2 라 4 */
export const MAX_ALBUM_COVERS = 4;
export const FOLDER_NAME_MAX = 100;
export const ORIGINAL_NAME_MAX = 200;
export const CAPTION_MAX = 500;

/** 확장자 → 종류·MIME. 브라우저가 주는 Content-Type 은 믿지 않고 확장자로 정한다(FAQ 파일과 같은 규칙). */
const TYPES = {
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  webp: { kind: 'image', mime: 'image/webp' },
  heic: { kind: 'image', mime: 'image/heic' },
  heif: { kind: 'image', mime: 'image/heif' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  webm: { kind: 'video', mime: 'video/webm' }
};

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

export const getExtension = (name) => {
  if (typeof name !== 'string') return '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
};

export const lookupType = (name) => TYPES[getExtension(name)] || null;

/** MIME 으로도 종류를 볼 수 있어야 한다 (Drive 가 돌려준 값 검증용). */
export const kindFromMime = (mime) => {
  if (typeof mime !== 'string') return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
};

/**
 * 파일 하나가 올라갈 수 있는지 본다.
 * → { ok: true, kind, mimeType } | { ok: false, reason, message }
 */
export const validateUpload = ({ name, size } = {}) => {
  const type = lookupType(name);
  if (!name || typeof name !== 'string' || name.length > ORIGINAL_NAME_MAX) {
    return { ok: false, reason: 'name', message: '파일 이름이 올바르지 않아요.' };
  }
  if (!type) {
    return { ok: false, reason: 'type', message: '사진·영상만 올릴 수 있어요.' };
  }
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, reason: 'size', message: '파일 크기를 확인할 수 없어요.' };
  }
  const limit = type.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (bytes > limit) {
    return {
      ok: false,
      reason: 'size',
      message: type.kind === 'video' ? '영상은 500MB 까지예요.' : '사진은 25MB 까지예요.'
    };
  }
  return { ok: true, kind: type.kind, mimeType: type.mime };
};

/**
 * "같은 파일" 의 열쇠 — 원래 이름 + 크기(바이트). 앨범에 이미 있는 파일은 다시 올리지 않고 건너뛴다.
 * 내용 해시는 없다(브라우저가 500MB 영상을 다 읽어야 한다) — 이름과 바이트 수가 둘 다 같은 다른 사진은 사실상 없다.
 * 이름은 NFC 로 맞춘다: 맥은 한글 파일 이름을 자모로 나눠(NFD) 주고, 휴대폰은 붙여(NFC) 준다.
 */
export const sameFileKey = (name, size) => `${String(name ?? '').normalize('NFC')}\u0000${Number(size)}`;

/**
 * Drive 에 저장할 파일 이름: 20260912_하은_IMG_1234.jpg
 * 누가 올렸는지 폴더에서 바로 보이게 한다. 원본 이름은 DB 에 따로 남는다.
 */
export const buildDriveName = ({ date, uploaderLabel, originalName }) => {
  const day = String(date || '').replace(/-/g, '').slice(0, 8) || 'unknown';
  const who = String(uploaderLabel || '').trim().replace(/[\\/:*?"<>|]/g, '') || '학부모';
  const safe = String(originalName || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(-120);
  return `${day}_${who}_${safe}`;
};

/**
 * 앨범 폴더 이름 검사. Drive 가 싫어하는 문자와 길이를 막는다.
 * → { ok: true, name } | { ok: false, reason, message }
 */
export const sanitizeFolderName = (input) => {
  const name = String(input ?? '').trim();
  if (!name) return { ok: false, reason: 'empty', message: '폴더 이름을 입력해 주세요.' };
  if (name.length > FOLDER_NAME_MAX) {
    return { ok: false, reason: 'length', message: `폴더 이름은 ${FOLDER_NAME_MAX}자까지예요.` };
  }
  if (/[\\/:*?"<>|]/.test(name)) {
    return { ok: false, reason: 'chars', message: '폴더 이름에 \\ / : * ? " < > | 는 쓸 수 없어요.' };
  }
  // 제어 문자는 눈에 보이지 않아 더 위험하다.
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, reason: 'chars', message: '폴더 이름에 쓸 수 없는 문자가 있어요.' };
  }
  return { ok: true, name };
};

/** 이벤트 이름과 날짜로 기본 폴더 이름을 만든다. */
export const defaultFolderName = ({ date, title }) => {
  const day = String(date || '').slice(0, 10);
  const name = `${day} ${String(title || '').trim()}`.trim();
  return name.slice(0, FOLDER_NAME_MAX);
};

/**
 * 앨범 폴더 이름은 언제나 이벤트에서 나온다: `YYYY-MM-DD 이벤트명` (docs/photo-menu 3.2, D-3).
 *
 * 이벤트 제목에는 Drive 가 싫어하는 문자(\ / : * ? " < > |)가 들어갈 수 있다.
 * sanitizeFolderName 처럼 거절하면 그 이벤트는 앨범을 영영 못 만들므로, 여기서는 공백으로 바꾼다.
 * 결과는 언제나 sanitizeFolderName 을 통과한다.
 */
export const folderNameFromEvent = ({ date, title } = {}) => {
  const day = String(date || '').slice(0, 10);
  const cleanTitle = String(title || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = `${day} ${cleanTitle}`.trim().slice(0, FOLDER_NAME_MAX).trim();
  return name || '앨범';
};

/**
 * 사진·영상 설명(선생님이 쓴다). 앞뒤 공백을 지우고 줄바꿈은 \n 으로 맞춘다. 빈 글이면 설명을 지운다(null).
 * → { ok: true, caption } | { ok: false, message }
 */
export const normalizeCaption = (value) => {
  if (value === null || value === undefined) return { ok: true, caption: null };
  if (typeof value !== 'string') return { ok: false, message: '설명은 글자로 보내 주세요.' };
  const caption = value
    .replace(/\r\n?/g, '\n')
    // 줄바꿈·탭 말고 보이지 않는 제어 문자는 지운다
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim();
  if (!caption) return { ok: true, caption: null };
  if ([...caption].length > CAPTION_MAX) return { ok: false, message: `설명은 ${CAPTION_MAX}자까지 쓸 수 있어요.` };
  return { ok: true, caption };
};

/**
 * 대표 사진의 보일 부분 — { x, y } (0~100, 가로·세로 %) 또는 null(가운데로). 소수 첫째 자리까지만 남긴다.
 * → { ok: true, focus } | { ok: false, message }
 */
export const normalizeCoverFocus = (value) => {
  if (value === null) return { ok: true, focus: null };
  const inRange = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!value || typeof value !== 'object' || !inRange(value.x) || !inRange(value.y)) {
    return { ok: false, message: '보일 부분을 다시 골라 주세요.' };
  }
  const round = (n) => Math.round(n * 10) / 10;
  return { ok: true, focus: { x: round(value.x), y: round(value.y) } };
};

export default {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_FILES_PER_UPLOAD,
  MAX_ALBUM_COVERS,
  FOLDER_NAME_MAX,
  ALLOWED_EXTENSIONS,
  getExtension,
  lookupType,
  kindFromMime,
  validateUpload,
  buildDriveName,
  sanitizeFolderName,
  defaultFolderName,
  folderNameFromEvent,
  CAPTION_MAX,
  normalizeCaption,
  normalizeCoverFocus
};
