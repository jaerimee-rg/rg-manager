import { jest } from '@jest/globals';

// 공개 목록에서 상품을 누르면 클릭으로 센다(FR-440). 누를 수 있는 상품의 규칙 — 링크·사진·예약 중 하나 —
// 이 클릭 기록(getClickable)과 통계(productStats)에서 같아야 한다. DB 없이 보낸 SQL 만 본다.
const query = jest.fn().mockResolvedValue({ rows: [] });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const { default: ShopProduct, CLICKABLE_SQL } = await import('../ShopProduct.js');
const ShopEvent = (await import('../ShopEvent.js')).default;

const lastSql = () => query.mock.calls.at(-1)[0].replace(/\s+/g, ' ').trim();
const squash = (sql) => sql.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [] });
});

describe('누를 수 있는 상품 = 링크·사진·예약 중 하나라도 있는 상품', () => {
  it('링크만 보지 않는다 — 사진만 있거나 예약만 받는 상품도 누를 수 있다', () => {
    const sql = squash(CLICKABLE_SQL);
    expect(sql).toContain('p.url IS NOT NULL');
    expect(sql).toContain('p."isReservable" = TRUE');
    expect(sql).toContain('EXISTS (SELECT 1 FROM shop_product_images i WHERE i."productId" = p.id)');
  });

  it('getClickable — 그 상점의 공개 상품이면서 누를 수 있어야 클릭을 센다 (FR-441)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 12 }] });
    await expect(ShopProduct.getClickable(12, 9)).resolves.toEqual({ id: 12 });
    expect(lastSql()).toContain(`WHERE p.id = $1 AND p."userId" = $2 AND p."isVisible" = TRUE AND (${squash(CLICKABLE_SQL)})`);
    expect(query.mock.calls.at(-1)[1]).toEqual([12, 9]);
  });

  it('getClickable — 없으면 null', async () => {
    await expect(ShopProduct.getClickable(12, 9)).resolves.toBeNull();
  });

  it('productStats — 같은 규칙으로 clickable 을 돌려준다(순위·클릭 칸이 이걸 본다)', async () => {
    await ShopEvent.productStats(9, null);
    expect(lastSql()).toContain(`(${squash(CLICKABLE_SQL)}) AS clickable`);
    expect(lastSql()).not.toContain('hasUrl');
  });
});
