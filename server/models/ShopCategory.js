import pool from '../database.js';

// 상품 종류(발레복·기구 …). 선생님마다 따로 관리한다.
class ShopCategory {
  // productCount 는 숨긴 상품까지 센다 — 설정 화면에서 "지우면 몇 개가 영향받는지" 를 보여 주기 위해
  static async listByUser(userId) {
    const result = await pool.query(
      `SELECT c.*, COUNT(p.id)::int AS "productCount"
       FROM shop_categories c
       LEFT JOIN shop_products p ON p."categoryId" = c.id
       WHERE c."userId" = $1
       GROUP BY c.id
       ORDER BY c."sortOrder" ASC, c.id ASC`,
      [userId]
    );
    return result.rows;
  }

  static async getOwned(id, userId) {
    const result = await pool.query('SELECT * FROM shop_categories WHERE id = $1 AND "userId" = $2', [id, userId]);
    return result.rows[0] || null;
  }

  static async countByUser(userId) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM shop_categories WHERE "userId" = $1', [userId]);
    return result.rows[0]?.count || 0;
  }

  /** 맨 뒤에 붙인다. 같은 이름이면 pg 가 23505 를 던진다(컨트롤러가 409 로 바꾼다). */
  static async create(userId, name) {
    const result = await pool.query(
      `INSERT INTO shop_categories ("userId", name, "sortOrder", "createdAt")
       SELECT $1::int, $2::text, COALESCE(MAX("sortOrder"), -1) + 1, $3::text
       FROM shop_categories WHERE "userId" = $1
       RETURNING *`,
      [userId, name, new Date().toISOString()]
    );
    return { ...result.rows[0], productCount: 0 };
  }

  static async rename(id, userId, name) {
    const result = await pool.query(
      'UPDATE shop_categories SET name = $1 WHERE id = $2 AND "userId" = $3 RETURNING *',
      [name, id, userId]
    );
    return result.rows[0] || null;
  }

  /** 지운 뒤 "카테고리 없음" 이 된 상품 수를 돌려준다(FK ON DELETE SET NULL). */
  static async delete(id, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const affected = await client.query(
        'SELECT COUNT(*)::int AS count FROM shop_products WHERE "categoryId" = $1 AND "userId" = $2',
        [id, userId]
      );
      const deleted = await client.query(
        'DELETE FROM shop_categories WHERE id = $1 AND "userId" = $2 RETURNING id',
        [id, userId]
      );
      await client.query('COMMIT');
      return deleted.rows[0] ? { affectedProducts: affected.rows[0]?.count || 0 } : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async listIdsByUser(userId) {
    const result = await pool.query('SELECT id FROM shop_categories WHERE "userId" = $1', [userId]);
    return result.rows.map((r) => r.id);
  }

  static async reorder(userId, ids) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE shop_categories c SET "sortOrder" = t.ord - 1
         FROM unnest($1::int[]) WITH ORDINALITY AS t(id, ord)
         WHERE c.id = t.id AND c."userId" = $2`,
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

export default ShopCategory;
