// 상품 사진 형식·크기 규칙 (FR-413). 올리기 전에 정사각형으로 잘라 한 변 1,200px · JPEG 0.85 로 줄인다
// — 실제 자르기·줄이기는 utils/imageCrop.js:cropToSquare.
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
