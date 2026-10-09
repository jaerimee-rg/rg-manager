import pool from '../database.js';
import { generatePublicId } from '../utils/publicId.js';

// 선생님당 상점 1개 (docs/recommended-shop). 공개 링크는 /shop/:publicId
class Shop {
  static async getByUserId(userId) {
    const result = await pool.query('SELECT * FROM shops WHERE "userId" = $1', [userId]);
    return result.rows[0] || null;
  }

  static async getByPublicId(publicId) {
    const result = await pool.query('SELECT * FROM shops WHERE "publicId" = $1', [publicId]);
    return result.rows[0] || null;
  }

  /** 학부모 [추천 상품] 탭 — 연결된 선생님들의 공개 중인 상점 (닫힌 상점은 빼고, 순서는 부르는 쪽이 정한다) */
  static async listActiveByUserIds(userIds = []) {
    if (!userIds.length) return [];
    const result = await pool.query(
      'SELECT "userId", "publicId", title FROM shops WHERE "userId" = ANY($1::int[]) AND "isActive" = TRUE',
      [userIds]
    );
    return result.rows;
  }

  /**
   * 상점과 기본 카테고리를 한 트랜잭션으로 만든다.
   * 동시에 두 번 들어와도 상점은 하나다("userId" UNIQUE) — 늦은 쪽은 이미 있는 상점을 받는다.
   */
  static async createWithDefaults(userId, title, categoryNames = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = new Date().toISOString();
      const inserted = await client.query(
        `INSERT INTO shops ("userId", "publicId", title, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, TRUE, $4, $4)
         ON CONFLICT ("userId") DO NOTHING
         RETURNING *`,
        [userId, generatePublicId(), title, now]
      );

      if (inserted.rows[0] && categoryNames.length) {
        await client.query(
          `INSERT INTO shop_categories ("userId", name, "sortOrder", "createdAt")
           SELECT $1::int, t.name, (t.ord - 1)::int, $3::text
           FROM unnest($2::text[]) WITH ORDINALITY AS t(name, ord)
           ON CONFLICT DO NOTHING`,
          [userId, categoryNames, now]
        );
      }

      await client.query('COMMIT');
      return inserted.rows[0] || (await Shop.getByUserId(userId));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(userId, { title, intro, notice, isActive }) {
    const result = await pool.query(
      `UPDATE shops
       SET title = $1, intro = $2, notice = $3, "isActive" = $4, "updatedAt" = $5
       WHERE "userId" = $6
       RETURNING *`,
      [title, intro, notice, isActive, new Date().toISOString(), userId]
    );
    return result.rows[0] || null;
  }
}

export default Shop;
