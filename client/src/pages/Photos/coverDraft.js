/**
 * 대표 사진 고치기 초안 — [저장하기] 를 누르기 전까지 화면에만 있는 대표 사진 목록.
 * 고르기의 [대표 사진 만들기], 대표 사진 칸의 순서 바꾸기·빼기, 사진 보기의 [대표 사진으로] 가 모두 이것만 바꾸고,
 * [저장하기] 가 PATCH …/album {coverMediaIds} 로 한 번에 보낸다.
 * cover = { id, kind, thumbnailUrl } (GET …/album 의 covers 와 같은 모양)
 */

/** 사진 칸(선생님 미디어) → 대표 사진 칸이 그리는 모양 */
export const toCover = (item) => ({ id: item.id, kind: item.kind, thumbnailUrl: item.thumbnailUrl });

/** 두 목록이 같은 사진을 같은 순서로 담았는지 — 같으면 저장할 것이 없다 */
export const sameCovers = (a = [], b = []) => a.length === b.length && a.every((cover, index) => cover.id === b[index]?.id);

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

export default { toCover, sameCovers, coversFromPicks, toggleCover, dropCovers };
