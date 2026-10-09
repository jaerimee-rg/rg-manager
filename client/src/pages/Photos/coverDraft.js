import { normalizeCrop, sameCrop } from '../../utils/coverCrop';

/**
 * 대표 사진 고치기 초안 — [저장하기] 를 누르기 전까지 화면에만 있는 대표 사진 목록.
 * 고르기의 [대표 사진 만들기], 대표 사진 칸의 순서 바꾸기·빼기·보일 부분, 사진 보기의 [대표 사진으로] 가 모두 이것만 바꾸고,
 * [저장하기] 가 PATCH …/album {coverMediaIds, coverCrops} 로 한 번에 보낸다.
 * cover = { id, kind, driveFileId, thumbnailUrl, crop } (GET …/album 의 covers 와 같은 모양, crop 은 보일 부분 또는 null)
 */

/** 사진 칸(선생님 미디어) → 대표 사진 칸이 그리는 모양. 새로 고른 사진은 가운데부터 */
export const toCover = (item) => ({
  id: item.id, kind: item.kind, driveFileId: item.driveFileId, thumbnailUrl: item.thumbnailUrl, crop: null
});

/** 두 목록이 같은 사진을 같은 순서·같은 보일 부분으로 담았는지 — 같으면 저장할 것이 없다 */
export const sameCovers = (a = [], b = []) => a.length === b.length
  && a.every((cover, index) => cover.id === b[index]?.id && sameCrop(cover.crop, b[index]?.crop));

/** 보일 부분 고르기 창의 [적용] — 같은 순서의 보일 부분들로 바꾼 새 초안(여러 장을 한 번에). 없는 자리는 그대로 */
export const setCoverCrops = (draft = [], crops = []) => draft.map((cover, i) => (
  i < crops.length ? { ...cover, crop: normalizeCrop(crops[i]) } : cover
));

/** [저장하기] 가 보낼 보일 부분 — { [id]: { x, y, zoom } | null } (목록에 든 사진 모두. null 은 가운데) */
export const coverCropsBody = (draft = []) => Object.fromEntries(draft.map((cover) => [cover.id, normalizeCrop(cover.crop)]));

/** 고르기에서 고른 id 들(고른 순서) → 초안. 지금 보이는 사진 칸에 없는 id 는 뺀다 */
export const coversFromPicks = (ids = [], items = []) => ids
  .map((id) => items.find((item) => item.id === id))
  .filter(Boolean)
  .map(toCover);

/** [대표 사진으로] / [대표 사진 n] — 없으면 뒤에 붙이고(max 장까지), 있으면 뺀다 */
export const toggleCover = (draft = [], item, max = 4) => {
  if (draft.some((cover) => cover.id === item.id)) return draft.filter((cover) => cover.id !== item.id);
  if (draft.length >= max) return draft;
  return [...draft, toCover(item)];
};

/** 숨기거나 지운 사진은 대표 사진이 될 수 없다 — 초안에서도 뺀다 */
export const dropCovers = (draft = [], ids = []) => draft.filter((cover) => !ids.includes(cover.id));

export default { toCover, sameCovers, setCoverCrops, coverCropsBody, coversFromPicks, toggleCover, dropCovers };
