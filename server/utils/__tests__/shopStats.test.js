import { rankProducts, sumByCategory, toSummary, UNCATEGORIZED } from '../shopStats.js';

const CATEGORIES = [
  { id: 1, name: '발레복' },
  { id: 3, name: '기구' },
  { id: 5, name: '용품' }
];

const row = (id, title, clicks, visitors, extra = {}) => ({
  id, title, clicks: String(clicks), visitors: String(visitors), clickable: true, categoryId: 3, isVisible: true, ...extra
});

describe('toSummary', () => {
  it('pg 가 문자열로 주는 COUNT 를 숫자로 바꾼다', () => {
    expect(toSummary({ views: '124', visitors: '41', clicks: '96', clickVisitors: '29' })).toEqual({
      views: 124, visitors: 41, clicks: 96, clickVisitors: 29
    });
    expect(toSummary(undefined)).toEqual({ views: 0, visitors: 0, clicks: 0, clickVisitors: 0 });
  });
});

describe('rankProducts — 상품별 클릭 순위 (FR-452)', () => {
  it('클릭 ↓ → 클릭한 방문자 ↓ → 타이틀 가나다순', () => {
    const ranked = rankProducts([
      row(1, '후프', 21, 12),
      row(2, '리본', 31, 18),
      row(3, '볼', 21, 15),
      row(4, '나비', 0, 0),
      row(5, '가방', 0, 0)
    ], CATEGORIES);
    expect(ranked.map((r) => r.title)).toEqual(['리본', '볼', '후프', '가방', '나비']);
  });

  it('클릭 수가 같으면 같은 순위 (1, 2, 2, 4)', () => {
    const ranked = rankProducts([row(1, 'a', 9, 1), row(2, 'b', 5, 3), row(3, 'c', 5, 2), row(4, 'd', 1, 1)], CATEGORIES);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('클릭 0 상품도 들어가고, 공개 목록에서 누를 수 없는 상품은 순위 없이 맨 아래', () => {
    const ranked = rankProducts([
      row(1, '곤봉', 0, 0, { clickable: false }),
      row(2, '볼', 0, 0),
      row(3, '리본', 4, 2)
    ], CATEGORIES);
    expect(ranked.map((r) => [r.title, r.rank, r.clickable])).toEqual([['리본', 1, true], ['볼', 2, true], ['곤봉', null, false]]);
  });

  it('카테고리 이름을 붙이고, 없거나 지워진 카테고리는 "카테고리 없음"', () => {
    const ranked = rankProducts([
      row(1, 'a', 3, 1, { categoryId: 1 }),
      row(2, 'b', 2, 1, { categoryId: null }),
      row(3, 'c', 1, 1, { categoryId: 99 })
    ], CATEGORIES);
    expect(ranked.map((r) => r.categoryName)).toEqual(['발레복', UNCATEGORIZED, UNCATEGORIZED]);
  });

  it('숨긴 상품도 남는다', () => {
    const [item] = rankProducts([row(1, '스타킹', 9, 6, { isVisible: false })], CATEGORIES);
    expect(item.isVisible).toBe(false);
    expect(item.rank).toBe(1);
  });
});

describe('sumByCategory — 카테고리별 클릭 (FR-453)', () => {
  it('카테고리 순서대로, 0 인 카테고리도 넣는다', () => {
    const products = [
      { categoryId: 3, clicks: 31 },
      { categoryId: 3, clicks: 21 },
      { categoryId: 1, clicks: 17 }
    ];
    expect(sumByCategory(products, CATEGORIES)).toEqual([
      { id: 1, name: '발레복', clicks: 17 },
      { id: 3, name: '기구', clicks: 52 },
      { id: 5, name: '용품', clicks: 0 }
    ]);
  });

  it('카테고리 없는 상품이 있으면 맨 뒤에 "카테고리 없음"', () => {
    const list = sumByCategory([{ categoryId: null, clicks: 9 }, { categoryId: 3, clicks: 1 }], CATEGORIES);
    expect(list[list.length - 1]).toEqual({ id: null, name: UNCATEGORIZED, clicks: 9 });
  });

  it('카테고리 없는 상품이 없으면 그 칸은 없다', () => {
    expect(sumByCategory([{ categoryId: 1, clicks: 1 }], CATEGORIES).some((c) => c.id === null)).toBe(false);
  });
});
