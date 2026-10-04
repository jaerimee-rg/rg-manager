// 상품 사진 자르기 (docs/recommended-shop/04-images-description.md).
// 카드·상세 모두 정사각형이라, 올리기 전에 선생님이 고른 부분을 정사각형으로 잘라 올린다.
//
// 자르는 범위는 { x, y, zoom } 하나로 나타낸다.
//   x, y — 0~1. 정사각형 칸을 꽉 채운(cover) 사진에서 어느 쪽을 보일지 (0.5 = 가운데)
//   zoom — 1~MAX_ZOOM. 그 점을 중심으로 확대
// 미리보기는 CSS(object-position + scale)로, 실제 자르기는 canvas 로 같은 범위를 계산한다.
import { extensionOf, toJpegName, QUALITY, MAX_SIDE } from './imageResize';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const DEFAULT_CROP = Object.freeze({ x: 0.5, y: 0.5, zoom: 1 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const clampCrop = (crop = DEFAULT_CROP) => ({
  x: clamp(Number.isFinite(crop.x) ? crop.x : 0.5, 0, 1),
  y: clamp(Number.isFinite(crop.y) ? crop.y : 0.5, 0, 1),
  zoom: clamp(Number.isFinite(crop.zoom) ? crop.zoom : 1, MIN_ZOOM, MAX_ZOOM)
});

export const isDefaultCrop = (crop) => {
  const c = clampCrop(crop);
  return c.zoom === 1 && c.x === 0.5 && c.y === 0.5;
};

/** 정사각형 칸(한 변 = 1)을 꽉 채웠을 때 사진의 가로·세로 — 짧은 변이 1 이 된다 */
export const coverSize = ({ width, height }) => {
  const side = Math.min(width, height);
  return { w: width / side, h: height / side };
};

/**
 * 원본 사진에서 잘라 낼 정사각형(px). 미리보기 CSS 와 같은 계산이다.
 * 칸 안에서 사진의 왼쪽 끝은 x·(1 − w·zoom) 이고, 보이는 폭은 원본의 1/(w·zoom) 이다.
 */
export const cropRect = (size, crop) => {
  const { x, y, zoom } = clampCrop(crop);
  const { w, h } = coverSize(size);
  const side = Math.min(size.width, size.height) / zoom;
  return {
    sx: (x * (w * zoom - 1)) / (w * zoom) * size.width,
    sy: (y * (h * zoom - 1)) / (h * zoom) * size.height,
    sw: side,
    sh: side
  };
};

/**
 * 끌어서 옮기기. dx·dy 는 칸 한 변에 대한 비율(오른쪽·아래로 끌면 +).
 * 사진이 칸보다 크지 않은 방향(넘치는 부분이 없음)으로는 움직이지 않는다.
 */
export const panCrop = (crop, size, dx, dy) => {
  const c = clampCrop(crop);
  const { w, h } = coverSize(size);
  const overflowX = w * c.zoom - 1;
  const overflowY = h * c.zoom - 1;
  return clampCrop({
    ...c,
    x: overflowX > 1e-6 ? c.x - dx / overflowX : c.x,
    y: overflowY > 1e-6 ? c.y - dy / overflowY : c.y
  });
};

/** 미리보기 — 칸을 꽉 채운 <img> 에 그대로 붙인다(cropRect 와 같은 범위가 보인다) */
export const cropStyle = (crop) => {
  const { x, y, zoom } = clampCrop(crop);
  const point = `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  return {
    objectFit: 'cover',
    objectPosition: point,
    transformOrigin: point,
    transform: zoom === 1 ? undefined : `scale(${zoom})`
  };
};

// 휴대폰 사진의 EXIF 방향을 미리보기(<img>)와 같게 따른다 — 이 옵션을 모르는 브라우저는 옵션 없이 다시 읽는다
const decode = async (file) => {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(file);
  }
};

/**
 * 고른 범위를 정사각형 JPEG(한 변 최대 1,200px)로 잘라 낸다. 투명 배경은 흰색.
 * GIF 를 그대로 두면(자르기를 안 바꿨으면) 움직임이 남도록 원본을 보낸다 — 화면에서는 가운데가 보인다.
 * 브라우저가 못 읽는 파일도 원본을 보낸다(서버가 형식·크기를 본다).
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export const cropToSquare = async (file, crop, maxSide = MAX_SIDE) => {
  const original = { blob: file, filename: file.name };
  if (extensionOf(file.name) === 'gif' && isDefaultCrop(crop)) return original;
  if (typeof createImageBitmap !== 'function') return original;

  try {
    const bitmap = await decode(file);
    const size = { width: bitmap.width, height: bitmap.height };
    const { sx, sy, sw, sh } = cropRect(size, crop);
    const out = Math.max(1, Math.round(Math.min(maxSide, sw)));

    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out, out);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return original;
    return { blob, filename: toJpegName(file.name) };
  } catch (error) {
    console.error('사진 자르기 실패(원본을 올립니다):', error?.message || error);
    return original;
  }
};
