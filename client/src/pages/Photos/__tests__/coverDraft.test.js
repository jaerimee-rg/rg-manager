import { toCover, sameCovers, coversFromPicks, toggleCover, dropCovers } from '../coverDraft';

const item = (id, kind = 'image') => ({ id, kind, thumbnailUrl: `https://t/${id}`, uploaderRole: 'teacher', isHidden: false });
const cover = (id, kind = 'image') => ({ id, kind, thumbnailUrl: `https://t/${id}` });

describe('coverDraft — 저장하기 전 대표 사진 초안', () => {
  it('toCover — 대표 사진 칸이 그리는 세 값만 남긴다', () => {
    expect(toCover(item(4, 'video'))).toEqual({ id: 4, kind: 'video', thumbnailUrl: 'https://t/4' });
  });

  it('sameCovers — 같은 사진이 같은 순서일 때만 같다', () => {
    expect(sameCovers([cover(1), cover(2)], [cover(1), cover(2)])).toBe(true);
    expect(sameCovers([cover(1), cover(2)], [cover(2), cover(1)])).toBe(false);
    expect(sameCovers([cover(1)], [cover(1), cover(2)])).toBe(false);
    expect(sameCovers([], [])).toBe(true);
    expect(sameCovers()).toBe(true);
  });

  it('coversFromPicks — 고른 순서대로, 사진 칸에 없는 id 는 뺀다', () => {
    expect(coversFromPicks([5, 1, 99], [item(1), item(5)])).toEqual([cover(5), cover(1)]);
  });

  it('toggleCover — 없으면 뒤에 붙이고 있으면 뺀다 · max 장이면 더 붙이지 않는다', () => {
    expect(toggleCover([cover(1)], item(2))).toEqual([cover(1), cover(2)]);
    expect(toggleCover([cover(1), cover(2)], item(1))).toEqual([cover(2)]);
    const full = [cover(1), cover(2), cover(3), cover(4)];
    expect(toggleCover(full, item(5), 4)).toBe(full);
    expect(toggleCover(full, item(3), 4)).toEqual([cover(1), cover(2), cover(4)]);
  });

  it('dropCovers — 숨기거나 지운 사진을 초안에서 뺀다', () => {
    expect(dropCovers([cover(1), cover(2), cover(3)], [2, 7])).toEqual([cover(1), cover(3)]);
  });
});
