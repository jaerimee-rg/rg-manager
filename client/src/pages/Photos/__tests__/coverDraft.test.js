import { toCover, sameCovers, setCoverCrop, coverCropsBody, coversFromPicks, toggleCover, dropCovers } from '../coverDraft';

const item = (id, kind = 'image') => ({
  id, kind, driveFileId: `f${id}`, thumbnailUrl: `https://t/${id}`, uploaderRole: 'teacher', isHidden: false
});
const cover = (id, kind = 'image', crop = null) => ({ id, kind, driveFileId: `f${id}`, thumbnailUrl: `https://t/${id}`, crop });

describe('coverDraft — 저장하기 전 대표 사진 초안', () => {
  it('toCover — 대표 사진 칸이 그리는 값만 남기고, 새로 고른 사진은 가운데부터', () => {
    expect(toCover(item(4, 'video'))).toEqual({ id: 4, kind: 'video', driveFileId: 'f4', thumbnailUrl: 'https://t/4', crop: null });
  });

  it('sameCovers — 같은 사진이 같은 순서일 때만 같다', () => {
    expect(sameCovers([cover(1), cover(2)], [cover(1), cover(2)])).toBe(true);
    expect(sameCovers([cover(1), cover(2)], [cover(2), cover(1)])).toBe(false);
    expect(sameCovers([cover(1)], [cover(1), cover(2)])).toBe(false);
    expect(sameCovers([], [])).toBe(true);
    expect(sameCovers()).toBe(true);
  });

  it('sameCovers — 보일 부분이 바뀌어도 다르다(저장할 것이 있다) · 가운데와 null 은 같다', () => {
    expect(sameCovers([cover(1, 'image', { x: 30, y: 50, zoom: 1 })], [cover(1)])).toBe(false);
    expect(sameCovers([cover(1, 'image', { x: 50, y: 50, zoom: 1 })], [cover(1)])).toBe(true);
    expect(sameCovers([cover(1, 'image', { x: 30, y: 50, zoom: 2 })], [cover(1, 'image', { x: 30, y: 50, zoom: 2 })])).toBe(true);
  });

  it('setCoverCrop — 그 칸의 보일 부분만 바꾼다(가운데는 null)', () => {
    const draft = [cover(1), cover(2)];
    expect(setCoverCrop(draft, 1, { x: 20, y: 80, zoom: 1.5 })).toEqual([cover(1), cover(2, 'image', { x: 20, y: 80, zoom: 1.5 })]);
    expect(setCoverCrop([cover(1, 'image', { x: 1, y: 1, zoom: 1 })], 0, { x: 50, y: 50, zoom: 1 })).toEqual([cover(1)]);
    expect(draft[1].crop).toBeNull();   // 원래 초안은 그대로
  });

  it('coverCropsBody — [저장하기] 가 보낼 { id: 보일 부분 | null }, 목록의 사진 모두', () => {
    expect(coverCropsBody([cover(3, 'image', { x: 10, y: 20, zoom: 2 }), cover(1)])).toEqual({ 3: { x: 10, y: 20, zoom: 2 }, 1: null });
    expect(coverCropsBody([])).toEqual({});
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
