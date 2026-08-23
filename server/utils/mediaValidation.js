/**
 * 업로드 파일과 폴더 이름 검증 (순수 함수).
 * 화면과 서버가 같은 규칙을 쓰도록 여기 한 곳에만 둔다.
 */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;   // 사진 25MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;  // 영상 500MB
export const MAX_FILES_PER_UPLOAD = 30;
export const FOLDER_NAME_MAX = 100;
export const ORIGINAL_NAME_MAX = 200;

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

export default {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_FILES_PER_UPLOAD,
  FOLDER_NAME_MAX,
  ALLOWED_EXTENSIONS,
  getExtension,
  lookupType,
  kindFromMime,
  validateUpload,
  buildDriveName,
  sanitizeFolderName,
  defaultFolderName
};
