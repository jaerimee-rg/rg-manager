/**
 * 대표 사진의 보일 부분 { x, y, zoom } — 앨범 카드 표지 칸에서 사진을 object-fit: cover 로 채운 뒤
 * object-position x% y% 로 맞추고, 그 점을 중심으로 zoom 배 키운다. 칸 모양(1장 16:10 · 2장 반쪽 · 4장 2×2 …)이 달라도
 * 같은 값이 통한다 — x·y 는 "사진의 그 점을 칸의 같은 점에 맞춘다" 는 뜻이라 늘 칸을 꽉 채운다.
 * 규칙은 서버 server/utils/mediaValidation.js normalizeCoverCrop 과 같고, 주소는 mediaSerializer.coverImageUrl 과 같다.
 */

export const MAX_COVER_ZOOM = 3;
export const DEFAULT_CROP = Object.freeze({ x: 50, y: 50, zoom: 1 });

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const finite = (n, fallback) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

/** 화면에서 다룰 값 — 범위 안으로 넣고 서버와 같이 반올림한다. 없으면 가운데·확대 없음 */
export const toCrop = (crop) => ({
  x: Math.round(clamp(finite(crop?.x, 50), 0, 100) * 10) / 10,
  y: Math.round(clamp(finite(crop?.y, 50), 0, 100) * 10) / 10,
  zoom: Math.round(clamp(finite(crop?.zoom, 1), 1, MAX_COVER_ZOOM) * 100) / 100
});

/** 저장할 값 — 가운데·확대 없음은 "고르지 않음"(null) */
export const normalizeCrop = (crop) => {
  if (!crop) return null;
  const value = toCrop(crop);
  return value.x === 50 && value.y === 50 && value.zoom === 1 ? null : value;
};

/** 두 보일 부분이 같은가 (null = 가운데) */
export const sameCrop = (a, b) => {
  const left = toCrop(a);
  const right = toCrop(b);
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
};

/** 표지 칸의 <img> 에 줄 style — 고르지 않았으면 빈 객체(CSS 기본: 가운데) */
export const cropStyle = (crop) => {
  const value = normalizeCrop(crop);
  if (!value) return {};
  const at = `${value.x}% ${value.y}%`;
  return {
    objectPosition: at,
    ...(value.zoom > 1 ? { transform: `scale(${value.zoom})`, transformOrigin: at } : {})
  };
};

/**
 * 끌어서 옮기기 — 손가락이 dx·dy(px) 움직인 만큼 사진이 따라오도록 x·y 를 바꾼다.
 * 칸 w×h 에 사진 iw×ih 를 cover 로 채우고 zoom 배 하면 사진 폭은 W·zoom 이고, 왼쪽 끝은 (w − W·zoom)·x/100 에 있다.
 * 그래서 dx 만큼 옮기려면 x 를 100·dx / (w − W·zoom) 만큼 바꾼다(넘칠 것이 없는 쪽은 그대로).
 */
export const panCrop = (crop, { dx = 0, dy = 0, boxWidth, boxHeight, imageWidth, imageHeight }) => {
  const value = toCrop(crop);
  if (!(boxWidth > 0 && boxHeight > 0 && imageWidth > 0 && imageHeight > 0)) return value;
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight) * value.zoom;
  const overflowX = imageWidth * scale - boxWidth;
  const overflowY = imageHeight * scale - boxHeight;
  return toCrop({
    ...value,
    x: overflowX > 0.5 ? value.x - (100 * dx) / overflowX : value.x,
    y: overflowY > 0.5 ? value.y - (100 * dy) / overflowY : value.y
  });
};

/** 확대만 바꾼다 — 같은 점을 중심으로 커진다 */
export const zoomCrop = (crop, zoom) => toCrop({ ...toCrop(crop), zoom });

/**
 * 두 손가락으로 벌리고 옮기기(휴대폰의 사진 보기처럼) — 손가락 가운데 아래에 있던 사진의 점이 손가락을 따라간다.
 * start / now = { x, y, distance } — 두 손가락의 가운데(칸 왼쪽 위 기준 px)와 두 손가락 사이 거리.
 * 확대는 처음 확대 × (지금 거리 ÷ 처음 거리), 1~3배. 휠 확대는 distance 에 배율을 넣어 같은 식을 쓴다(가운데 = 마우스 자리).
 * 사진 폭은 W·zoom 이고 왼쪽 끝은 (w − W·zoom)·x/100 이라, 손가락 아래 점 u(사진 폭의 비율)를 지키는 x 를 거꾸로 푼다.
 */
export const pinchCrop = (crop, { start, now, boxWidth, boxHeight, imageWidth, imageHeight }) => {
  const from = toCrop(crop);
  if (!(boxWidth > 0 && boxHeight > 0 && imageWidth > 0 && imageHeight > 0) || !(start?.distance > 0)) return from;
  const zoom = clamp(from.zoom * ((now?.distance || start.distance) / start.distance), 1, MAX_COVER_ZOOM);
  const base = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
  const axis = (box, size, pos, startAt, nowAt) => {
    const before = size * base * from.zoom;   // 처음 크기
    const after = size * base * zoom;         // 지금 크기
    if (after - box <= 0.5) return pos;       // 넘칠 것이 없으면 위치는 상관없다
    const offset = ((box - before) * pos) / 100;
    const point = (startAt - offset) / before;              // 손가락 아래 사진의 점(0~1)
    return (100 * (nowAt - point * after)) / (box - after);  // 그 점을 지금 손가락 아래에 두는 위치
  };
  return toCrop({
    x: axis(boxWidth, imageWidth, from.x, start.x, now.x),
    y: axis(boxHeight, imageHeight, from.y, start.y, now.y),
    zoom
  });
};

const IMAGE_BASE = 'https://lh3.googleusercontent.com/d';

/**
 * 표지 대표 사진 주소 — 자르지 않은 원래 비율(서버 mediaSerializer.coverImageUrl 과 같다).
 * 한 장이면 폭 1000, 여러 장이면 긴 변 800. 확대한 만큼 크게(100 단위, 1600 까지).
 */
export const coverImageUrl = (driveFileId, { single = true, zoom = 1 } = {}) => {
  if (!driveFileId) return null;
  const size = Math.min(1600, Math.ceil(((single ? 1000 : 800) * Math.max(1, Number(zoom) || 1)) / 100) * 100);
  return `${IMAGE_BASE}/${encodeURIComponent(driveFileId)}=${single ? 'w' : 's'}${size}-rw`;
};

export default {
  MAX_COVER_ZOOM, DEFAULT_CROP, toCrop, normalizeCrop, sameCrop, cropStyle, panCrop, zoomCrop, pinchCrop, coverImageUrl
};
