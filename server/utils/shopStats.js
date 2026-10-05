// 추천 상품 통계 가공 (FR-450~455). DB 에서 센 숫자를 화면 순서로 정렬·합산만 한다.
// pg 는 COUNT 를 문자열(bigint)로 돌려주므로 여기서 숫자로 바꾼다.

export const UNCATEGORIZED = '카테고리 없음';

const num = (v) => Number(v ?? 0) || 0;

export const toSummary = (row = {}) => ({
  views: num(row.views),
  visitors: num(row.visitors),
  clicks: num(row.clicks),
  clickVisitors: num(row.clickVisitors)
});

/**
 * 상품별 클릭 순위.
 * 누를 수 있는 상품 먼저 → 클릭 ↓ → 클릭한 방문자 ↓ → 타이틀 가나다순.
 * 순위는 클릭 수가 같으면 같다(1, 2, 2, 4). 링크·사진·예약이 모두 없는 상품은 공개 목록에서 누를 수 없어
 * 순위가 없다.
 */
export const rankProducts = (rows = [], categories = []) => {
  const names = new Map(categories.map((c) => [c.id, c.name]));

  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    imageUrl: r.imageUrl ?? null,
    categoryId: r.categoryId ?? null,
    categoryName: r.categoryId != null && names.has(r.categoryId) ? names.get(r.categoryId) : UNCATEGORIZED,
    isVisible: r.isVisible !== false,
    clickable: Boolean(r.clickable),
    clicks: num(r.clicks),
    visitors: num(r.visitors),
    lastClickedAt: r.lastClickedAt ?? null
  }));

  items.sort((a, b) =>
    Number(b.clickable) - Number(a.clickable) ||
    b.clicks - a.clicks ||
    b.visitors - a.visitors ||
    String(a.title).localeCompare(String(b.title), 'ko')
  );

  let previous = null;
  let rank = 0;
  items.forEach((item, index) => {
    if (!item.clickable) {
      item.rank = null;
      return;
    }
    if (previous === null || item.clicks !== previous) rank = index + 1;
    previous = item.clicks;
    item.rank = rank;
  });

  return items;
};

/**
 * 카테고리별 클릭 합계 — 카테고리 순서대로, 0 인 카테고리도 넣는다.
 * "카테고리 없음" 은 그런 상품이 있을 때만 맨 뒤에 붙인다.
 */
export const sumByCategory = (products = [], categories = []) => {
  const totals = new Map(categories.map((c) => [c.id, 0]));
  let uncategorized = 0;
  let hasUncategorized = false;

  products.forEach((p) => {
    if (p.categoryId != null && totals.has(p.categoryId)) {
      totals.set(p.categoryId, totals.get(p.categoryId) + num(p.clicks));
    } else {
      hasUncategorized = true;
      uncategorized += num(p.clicks);
    }
  });

  const list = categories.map((c) => ({ id: c.id, name: c.name, clicks: totals.get(c.id) }));
  if (hasUncategorized) list.push({ id: null, name: UNCATEGORIZED, clicks: uncategorized });
  return list;
};
