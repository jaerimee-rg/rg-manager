import {
  MAX_PRODUCT_IMAGES, fromSavedImages, appendImageFiles, imageAddMessage, moveImage, updateImage,
  planImageSave, desiredImageOrder, sameOrder
} from '../productImages';
import { DEFAULT_CROP } from '../imageCrop';

const file = (name) => new File(['x'], name, { type: 'image/png' });
const preview = (f) => `blob:${f.name}`;

describe('appendImageFiles — 맨 뒤에 붙인다', () => {
  it('새 사진은 미리보기 주소와 기본 자르기(가운데)를 갖는다', () => {
    const { items, invalid, overflow } = appendImageFiles([], [file('a.png'), file('b.jpg')], preview);
    expect(items.map((i) => i.url)).toEqual(['blob:a.png', 'blob:b.jpg']);
    expect(items[0]).toMatchObject({ crop: DEFAULT_CROP });
    expect(items[0].key).not.toBe(items[1].key);
    expect([invalid, overflow]).toEqual([0, 0]);
  });

  it('허용하지 않는 형식(svg·heic)은 빼고 수를 알려 준다', () => {
    const { items, invalid } = appendImageFiles([], [file('logo.svg'), file('a.png'), file('b.heic')], preview);
    expect(items).toHaveLength(1);
    expect(invalid).toBe(2);
  });

  it(`${MAX_PRODUCT_IMAGES}장을 넘는 것은 앞에서부터 들어갈 만큼만`, () => {
    const start = fromSavedImages(Array.from({ length: 8 }, (_, i) => ({ id: i + 1, url: `u${i}` })));
    const { items, overflow } = appendImageFiles(start, [file('a.png'), file('b.png'), file('c.png'), file('d.png')], preview);
    expect(items).toHaveLength(10);
    expect(items.slice(8).map((i) => i.url)).toEqual(['blob:a.png', 'blob:b.png']);
    expect(overflow).toBe(2);
  });
});

describe('imageAddMessage', () => {
  it('넘친 것이 먼저, 그다음 형식', () => {
    expect(imageAddMessage({ overflow: 2, invalid: 1 })).toBe('사진은 10장까지예요 — 고른 사진 중 2장은 넣지 못했어요.');
    expect(imageAddMessage({ invalid: 1 })).toBe('jpg · png · webp · gif 이미지만 올릴 수 있어요');
    expect(imageAddMessage({})).toBeNull();
  });
});

describe('moveImage · updateImage', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('옮긴다 — 첫 자리로 옮기면 대표 사진이 된다', () => {
    expect(moveImage(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveImage(list, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('범위 밖이거나 제자리면 같은 배열', () => {
    expect(moveImage(list, 0, -1)).toBe(list);
    expect(moveImage(list, 3, 4)).toBe(list);
    expect(moveImage(list, 1, 1)).toBe(list);
  });

  it('한 칸만 바꾼다', () => {
    const items = [{ key: 'a', crop: DEFAULT_CROP }, { key: 'b', crop: DEFAULT_CROP }];
    const next = updateImage(items, 'b', { crop: { x: 0, y: 0, zoom: 2 } });
    expect(next[1].crop).toEqual({ x: 0, y: 0, zoom: 2 });
    expect(next[0]).toBe(items[0]);
  });
});

describe('저장 계획', () => {
  const saved = [{ id: 1, url: 'u1' }, { id: 2, url: 'u2' }, { id: 3, url: 'u3' }];

  it('뺀 사진은 지우고, 새 사진은 목록 순서대로 올린다', () => {
    const items = [
      { key: 'n1', file: file('new.png'), url: 'blob:1' },
      ...fromSavedImages(saved).filter((i) => i.id !== 2)
    ];
    const plan = planImageSave(saved, items);
    expect(plan.deletes).toEqual([2]);
    expect(plan.uploads.map((i) => i.key)).toEqual(['n1']);
  });

  it('원하는 순서 — 올린 사진은 받은 id 로, 올리지 못한 사진은 빠진다', () => {
    const items = [{ key: 'n1', file: file('a.png') }, { key: 's3', id: 3 }, { key: 'n2', file: file('b.png') }, { key: 's1', id: 1 }];
    expect(desiredImageOrder(items, new Map([['n1', 10]]))).toEqual([10, 3, 1]);
  });

  it('순서 비교', () => {
    expect(sameOrder([1, 2], [1, 2])).toBe(true);
    expect(sameOrder([2, 1], [1, 2])).toBe(false);
    expect(sameOrder([1], [1, 2])).toBe(false);
  });
});
