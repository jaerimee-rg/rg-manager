// 상품 폼의 사진 목록 (여러 장 · 순서 · 자르기). 화면을 모르는 순수 함수만 둔다.
//
// 목록의 한 칸(item):
//   이미 올린 사진 — { key, id, url }
//   새로 넣은 사진 — { key, file, url(미리보기 blob 주소), crop }
// 첫 칸이 대표 사진이다. 저장할 때 planImageSave 로 서버에 보낼 일을 나눈다.
import { isAllowedImageName } from './imageResize';
import { DEFAULT_CROP } from './imageCrop';

export const MAX_PRODUCT_IMAGES = 10;

let sequence = 0;
const nextKey = () => {
  sequence += 1;
  return `new-${sequence}`;
};

export const fromSavedImages = (images = []) =>
  images.map((image) => ({ key: `saved-${image.id}`, id: image.id, url: image.url }));

export const newImageItem = (file, previewUrl) => ({ key: nextKey(), file, url: previewUrl, crop: DEFAULT_CROP });

/**
 * 고른·붙여 넣은 파일을 맨 뒤에 붙인다. 형식이 맞지 않는 것, 장 수를 넘는 것은 빼고 그 수를 돌려준다.
 * @param makePreview 파일 → 미리보기 주소 (화면이 URL.createObjectURL 을 넘긴다)
 */
export const appendImageFiles = (items, files, makePreview, max = MAX_PRODUCT_IMAGES) => {
  const allowed = Array.from(files || []).filter((file) => isAllowedImageName(file.name));
  const invalid = (files?.length || 0) - allowed.length;
  const room = Math.max(0, max - items.length);
  const taken = allowed.slice(0, room);
  return {
    items: [...items, ...taken.map((file) => newImageItem(file, makePreview(file)))],
    invalid,
    overflow: allowed.length - taken.length
  };
};

/** 빼고 남은 사진에 대한 안내 — 없으면 null */
export const imageAddMessage = ({ invalid = 0, overflow = 0 }, max = MAX_PRODUCT_IMAGES) => {
  if (overflow > 0) return `사진은 ${max}장까지예요 — 고른 사진 중 ${overflow}장은 넣지 못했어요.`;
  if (invalid > 0) return 'jpg · png · webp · gif 이미지만 올릴 수 있어요';
  return null;
};

/** from 칸을 to 자리로 옮긴다. 바뀌는 게 없으면 같은 배열을 돌려준다 */
export const moveImage = (items, from, to) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const updateImage = (items, key, patch) =>
  items.map((item) => (item.key === key ? { ...item, ...patch } : item));

/**
 * 저장할 일을 나눈다.
 * deletes — 원래 있었는데 목록에서 뺀 사진 id
 * uploads — 새로 넣은 사진(목록 순서대로 올린다 → 서버는 맨 뒤에 차례로 붙인다)
 */
export const planImageSave = (savedImages = [], items = []) => {
  const kept = new Set(items.filter((item) => item.id != null).map((item) => item.id));
  return {
    deletes: savedImages.map((image) => image.id).filter((id) => !kept.has(id)),
    uploads: items.filter((item) => item.file)
  };
};

/** 올린 뒤의 원하는 순서(id). 올리지 못한 사진은 빠진다 */
export const desiredImageOrder = (items, uploadedIds) =>
  items.map((item) => item.id ?? uploadedIds.get(item.key)).filter((id) => id != null);

export const sameOrder = (a = [], b = []) => a.length === b.length && a.every((id, i) => id === b[i]);
