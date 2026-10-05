import pool from '../database.js';
import { CLICK_DEDUP_MS, VIEW_DEDUP_MS } from '../utils/shopValidation.js';
import { CLICKABLE_SQL } from './ShopProduct.js';

// 공개 상점 방문·클릭 기록. 시각은 다른 테이블처럼 ISO 문자열이라 문자열 비교가 곧 시간 비교다.
class ShopEvent {
  /** 같은 방문자의 방문은 30분에 한 번만 센다. visitorKey 가 없으면 매번 센다. */
  static async recordView(userId, visitorKey, now = Date.now()) {
    const result = await pool.query(
      `INSERT INTO shop_events ("userId", "productId", type, "visitorKey", "createdAt")
       SELECT $1::int, NULL::int, 'view', $2::text, $3::text
       WHERE NOT EXISTS (
         SELECT 1 FROM shop_events
         WHERE "userId" = $1 AND type = 'view' AND "visitorKey" = $2::text AND "createdAt" > $4::text
       )`,
      [userId, visitorKey, new Date(now).toISOString(), new Date(now - VIEW_DEDUP_MS).toISOString()]
    );
    return result.rowCount > 0;
  }

  /** 같은 방문자가 같은 상품을 10초 안에 다시 누르면 세지 않는다(FR-442). */
  static async recordClick(userId, productId, visitorKey, now = Date.now()) {
    const result = await pool.query(
      `INSERT INTO shop_events ("userId", "productId", type, "visitorKey", "createdAt")
       SELECT $1::int, $2::int, 'click', $3::text, $4::text
       WHERE NOT EXISTS (
         SELECT 1 FROM shop_events
         WHERE "productId" = $2 AND type = 'click' AND "visitorKey" = $3::text AND "createdAt" > $5::text
       )`,
      [userId, productId, visitorKey, new Date(now).toISOString(), new Date(now - CLICK_DEDUP_MS).toISOString()]
    );
    return result.rowCount > 0;
  }

  /** 요약 타일 — since 가 null 이면 전체 기간 */
  static async summary(userId, since) {
    const result = await pool.query(
      `SELECT
         COUNT(*)                     FILTER (WHERE type = 'view')  AS views,
         COUNT(DISTINCT "visitorKey") FILTER (WHERE type = 'view')  AS visitors,
         COUNT(*)                     FILTER (WHERE type = 'click') AS clicks,
         COUNT(DISTINCT "visitorKey") FILTER (WHERE type = 'click') AS "clickVisitors"
       FROM shop_events
       WHERE "userId" = $1 AND ($2::text IS NULL OR "createdAt" >= $2::text)`,
      [userId, since]
    );
    return result.rows[0];
  }

  /** 상품별 클릭 — 클릭 0 상품도 나오도록 상품 기준으로 묶는다. clickable = 공개 목록에서 누를 수 있는 상품 */
  static async productStats(userId, since) {
    const result = await pool.query(
      `SELECT p.id, p.title, p."isVisible", p."categoryId",
              (SELECT i."imageUrl" FROM shop_product_images i
               WHERE i."productId" = p.id ORDER BY i."sortOrder", i.id LIMIT 1) AS "imageUrl",
              (${CLICKABLE_SQL}) AS clickable,
              COUNT(e.id) AS clicks,
              COUNT(DISTINCT e."visitorKey") AS visitors,
              MAX(e."createdAt") AS "lastClickedAt"
       FROM shop_products p
       LEFT JOIN shop_events e
         ON e."productId" = p.id AND e.type = 'click'
        AND ($2::text IS NULL OR e."createdAt" >= $2::text)
       WHERE p."userId" = $1
       GROUP BY p.id`,
      [userId, since]
    );
    return result.rows;
  }
}

export default ShopEvent;
