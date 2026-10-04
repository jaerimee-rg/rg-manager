import pool from '../database.js';

// 추천 상품. 표시 순서는 "sortOrder" 오름차순(작을수록 위), 같으면 최신이 위.
const ORDER = 'ORDER BY p."sortOrder" ASC, p.id DESC';

// 수정 응답에도 누적 클릭을 담아 목록 숫자가 0 으로 바뀌지 않게 한다
const RETURNING = `RETURNING *,
  (SELECT COUNT(*)::int FROM shop_events e WHERE e."productId" = shop_products.id AND e.type = 'click') AS "clickCount"`;

class ShopProduct {
  /** 선생님 목록 — 누적 클릭 수를 함께 */
  static async listByUser(userId) {
    const result = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM shop_events e WHERE e."productId" = p.id AND e.type = 'click') AS "clickCount"
       FROM shop_products p
       WHERE p."userId" = $1
       ${ORDER}`,
      [userId]
    );
    return result.rows;
  }

  /** 공개 상점 — 공개 상품만 */
  static async listPublic(userId) {
    const result = await pool.query(
      `SELECT p.* FROM shop_products p WHERE p."userId" = $1 AND p."isVisible" = TRUE ${ORDER}`,
      [userId]
    );
    return result.rows;
  }

  static async getOwned(id, userId) {
    const result = await pool.query('SELECT * FROM shop_products WHERE id = $1 AND "userId" = $2', [id, userId]);
    return result.rows[0] || null;
  }

  /** 클릭을 셀 수 있는 상품 — 그 상점의 공개 상품이고 링크가 있어야 한다(FR-441) */
  static async getClickable(id, userId) {
    const result = await pool.query(
      `SELECT id FROM shop_products
       WHERE id = $1 AND "userId" = $2 AND "isVisible" = TRUE AND url IS NOT NULL`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async countByUser(userId) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM shop_products WHERE "userId" = $1', [userId]);
    return result.rows[0]?.count || 0;
  }

  static async listIdsByUser(userId) {
    const result = await pool.query('SELECT id FROM shop_products WHERE "userId" = $1', [userId]);
    return result.rows.map((r) => r.id);
  }

  /** 새 상품은 맨 위 — 현재 가장 작은 순서보다 하나 작게 */
  static async create(userId, { title, url, price, categoryId, isVisible }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO shop_products
         ("userId", "categoryId", title, url, price, "isVisible", "sortOrder", "createdAt", "updatedAt")
       SELECT $1::int, $2::int, $3::text, $4::text, $5::int, $6::boolean, COALESCE(MIN("sortOrder"), 1) - 1, $7::text, $7::text
       FROM shop_products WHERE "userId" = $1
       RETURNING *`,
      [userId, categoryId, title, url, price, isVisible, now]
    );
    return { ...result.rows[0], clickCount: 0 };
  }

  static async update(id, userId, { title, url, price, categoryId, isVisible }) {
    const result = await pool.query(
      `UPDATE shop_products
       SET title = $1, url = $2, price = $3, "categoryId" = $4, "isVisible" = $5, "updatedAt" = $6
       WHERE id = $7 AND "userId" = $8
       ${RETURNING}`,
      [title, url, price, categoryId, isVisible, new Date().toISOString(), id, userId]
    );
    return result.rows[0] || null;
  }

  static async setVisibility(id, userId, isVisible) {
    const result = await pool.query(
      `UPDATE shop_products SET "isVisible" = $1, "updatedAt" = $2
       WHERE id = $3 AND "userId" = $4 ${RETURNING}`,
      [isVisible, new Date().toISOString(), id, userId]
    );
    return result.rows[0] || null;
  }

  static async setImage(id, userId, { imagePath, imageUrl }) {
    const result = await pool.query(
      `UPDATE shop_products SET "imagePath" = $1, "imageUrl" = $2, "updatedAt" = $3
       WHERE id = $4 AND "userId" = $5 ${RETURNING}`,
      [imagePath, imageUrl, new Date().toISOString(), id, userId]
    );
    return result.rows[0] || null;
  }

  /** 클릭 기록은 FK CASCADE 로 함께 지워진다(FR-417) */
  static async delete(id, userId) {
    const result = await pool.query('DELETE FROM shop_products WHERE id = $1 AND "userId" = $2 RETURNING *', [id, userId]);
    return result.rows[0] || null;
  }

  static async reorder(userId, ids) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE shop_products p SET "sortOrder" = t.ord - 1
         FROM unnest($1::int[]) WITH ORDINALITY AS t(id, ord)
         WHERE p.id = t.id AND p."userId" = $2`,
        [ids, userId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default ShopProduct;
