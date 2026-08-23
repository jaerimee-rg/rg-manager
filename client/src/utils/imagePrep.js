/**
 * 올리기 전에 파일에서 알아내는 것들.
 * 계산이 되는 부분은 순수 함수로 떼어 두고 단위 테스트한다.
 */

/** mediaValidation.js(서버)와 같은 규칙 — 화면에서 먼저 걸러 헛수고를 줄인다. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_FILES = 30;

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const VIDEO_EXT = ['mp4', 'mov', 'webm'];

export const extensionOf = (name) => {
  const dot = String(name || '').lastIndexOf('.');
  return dot < 0 ? '' : String(name).slice(dot + 1).toLowerCase();
};

export const kindOf = (name) => {
  const ext = extensionOf(name);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return null;
};

/** → { ok, kind } | { ok: false, message } */
export const checkFile = ({ name, size }) => {
  const kind = kindOf(name);
  if (!kind) return { ok: false, message: '사진·영상만 올릴 수 있어요' };
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!size) return { ok: false, message: '파일 크기를 확인할 수 없어요' };
  if (size > limit) {
    return { ok: false, message: kind === 'video' ? '영상은 500MB 까지예요' : '사진은 25MB 까지예요' };
  }
  return { ok: true, kind };
};

/** 고른 파일들을 통과·거절로 나눈다. */
export const partitionFiles = (files) => {
  const accepted = [];
  const rejected = [];
  for (const file of Array.from(files || []).slice(0, MAX_FILES)) {
    const check = checkFile(file);
    if (check.ok) accepted.push({ file, kind: check.kind });
    else rejected.push({ file, message: check.message });
  }
  return { accepted, rejected };
};

/**
 * EXIF 에서 찍은 시각을 읽는다 (라이브러리 없이 최소한만 훑는다).
 * 없으면 파일의 수정 시각, 그것도 없으면 지금.
 */
export const readTakenAt = async (file) => {
  try {
    const exif = await readExifDateTime(file);
    if (exif) return exif;
  } catch {
    // EXIF 가 없거나 형식이 달라도 문제가 아니다.
  }
  if (file?.lastModified) return new Date(file.lastModified).toISOString();
  return new Date().toISOString();
};

/** '2026:09:12 10:24:31' → ISO. EXIF 는 시간대를 담지 않아 기기 시간대로 본다. */
export const parseExifDate = (value) => {
  const match = String(value || '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** JPEG APP1 안의 DateTimeOriginal(0x9003)·DateTime(0x0132) 만 찾는다. */
const readExifDateTime = async (file) => {
  if (!file || !file.slice) return null;
  const head = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  if (head.byteLength < 4 || head.getUint16(0) !== 0xffd8) return null;   // JPEG 아님

  let offset = 2;
  while (offset + 4 < head.byteLength) {
    if (head.getUint8(offset) !== 0xff) break;
    const marker = head.getUint8(offset + 1);
    const size = head.getUint16(offset + 2);
    if (marker === 0xe1) {
      const exifStart = offset + 4;
      if (head.getUint32(exifStart) === 0x45786966) {
        return readTiffDate(head, exifStart + 6);
      }
    }
    offset += 2 + size;
  }
  return null;
};

const readTiffDate = (view, tiffStart) => {
  const little = view.getUint16(tiffStart) === 0x4949;
  const ifdOffset = view.getUint32(tiffStart + 4, little);

  const readIfd = (start, depth = 0) => {
    if (depth > 2 || start + 2 > view.byteLength) return null;
    const count = view.getUint16(start, little);
    let exifIfd = null;

    for (let i = 0; i < count; i += 1) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = view.getUint16(entry, little);
      const valueOffset = view.getUint32(entry + 8, little);

      if (tag === 0x8769) exifIfd = tiffStart + valueOffset;
      if (tag === 0x9003 || tag === 0x0132) {
        const length = view.getUint32(entry + 4, little);
        const text = readAscii(view, tiffStart + valueOffset, length);
        const parsed = parseExifDate(text);
        if (parsed) return parsed;
      }
    }
    return exifIfd ? readIfd(exifIfd, depth + 1) : null;
  };

  return readIfd(tiffStart + ifdOffset);
};

const readAscii = (view, start, length) => {
  let out = '';
  for (let i = 0; i < length - 1 && start + i < view.byteLength; i += 1) {
    out += String.fromCharCode(view.getUint8(start + i));
  }
  return out;
};

/**
 * 얼굴 분석에 쓸 축소본을 만든다. 원본은 그대로 Drive 에 올라가고,
 * 이 축소본은 브라우저 메모리에서만 쓰이고 사라진다.
 */
export const makePreview = async (file, maxSide = 1280) => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas;
  } catch (error) {
    // HEIC 처럼 브라우저가 디코드하지 못하는 형식이 있다. 그러면 분석을 건너뛴다.
    console.error('축소본 만들기 실패(얼굴 분석을 건너뜁니다):', error?.message || error);
    return null;
  }
};

export default {
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_FILES,
  extensionOf, kindOf, checkFile, partitionFiles, readTakenAt, parseExifDate, makePreview
};
