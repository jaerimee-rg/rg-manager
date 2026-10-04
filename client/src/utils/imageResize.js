// 상품 사진을 올리기 전에 줄인다 (FR-413). 긴 변 1,200px · JPEG 0.85 · 투명 배경은 흰색.
// 휴대폰 사진(수 MB)을 그대로 올리면 Vercel 요청 한도(4.5MB)에 걸리고 공개 상점도 느려진다.

export const MAX_SIDE = 1200;
export const QUALITY = 0.85;
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

export const extensionOf = (name = '') => {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

export const isAllowedImageName = (name) => ALLOWED_EXTENSIONS.includes(extensionOf(name));

/** 줄인 결과의 파일명 — 확장자를 .jpg 로 바꾼다 */
export const toJpegName = (name = 'image') => {
  const base = String(name).replace(/\.[^.]+$/, '') || 'image';
  return `${base}.jpg`;
};

/** 긴 변이 maxSide 를 넘지 않게 비율을 유지한 크기 */
export const fitSize = (width, height, maxSide = MAX_SIDE) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/**
 * @returns {Promise<{ blob: Blob, filename: string }>}
 * GIF 는 움직임이 사라지지 않게 그대로 보낸다. 브라우저가 못 읽는 파일도 그대로 보낸다(서버가 형식·크기를 본다).
 */
export const resizeForUpload = async (file, maxSide = MAX_SIDE) => {
  const original = { blob: file, filename: file.name };
  if (extensionOf(file.name) === 'gif' || typeof createImageBitmap !== 'function') return original;

  try {
    const bitmap = await createImageBitmap(file);
    const originalWidth = bitmap.width;
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return original;
    // 이미 작은 파일을 다시 인코딩해 더 커졌다면 원본이 낫다
    if (blob.size >= file.size && width === originalWidth) return original;
    return { blob, filename: toJpegName(file.name) };
  } catch (error) {
    console.error('사진 줄이기 실패(원본을 올립니다):', error?.message || error);
    return original;
  }
};
