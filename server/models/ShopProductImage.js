import pool from '../database.js';

// 상품 사진(여러 장). 순서는 "sortOrder" 오름차순 — 첫 장이 대표 사진이다.
const ORDER = 'ORDER BY "sortOrder" ASC, id ASC';

const groupByProduct = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId).push(row);
  });
  return map;
};

class ShopProductImage {
  /** 여러 상품의 사진을 한 번에 읽는다 — 상품 id → 사진 배열 (목록에서 상품마다 묻지 않게) */
  static async listByProducts(productIds) {
    if (!productIds.length) return new Map();
    const result = await pool.query(
      `SELECT * FROM shop_product_images WHERE "productId" = ANY($1::int[]) ${ORDER}`,
      [productIds]
    );
    return groupByProduct(result.rows);
  }

  static async listByProduct(productId) {
    const result = await pool.query(`SELECT * FROM shop_product_images WHERE "productId" = $1 ${ORDER}`, [productId]);
    return result.rows;
  }

  static async countByProduct(productId) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM shop_product_images WHERE "productId" = $1',
      [productId]
    );
    return result.rows[0]?.count || 0;
  }

  /** 상품을 지우기 전에 저장소에서 치울 파일 경로를 읽는다(행은 FK CASCADE 로 함께 지워진다) */
  static async listPathsOwned(productId, userId) {
    const result = await pool.query(
      'SELECT "imagePath" FROM shop_product_images WHERE "productId" = $1 AND "userId" = $2',
      [productId, userId]
    );
    return result.rows.map((r) => r.imagePath);
  }

  /**
   * 맨 뒤에 붙인다. 상품 행을 잠가 두 장을 동시에 올려도 장 수 제한을 넘지 않는다.
   * @returns {{ image?: object, error?: 'notFound' | 'full' }}
   */
  static async append(productId, userId, { imagePath, imageUrl }, maxImages) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        'SELECT id FROM shop_products WHERE id = $1 AND "userId" = $2 FOR UPDATE',
        [productId, userId]
      );
      if (!owned.rows.length) {
        await client.query('ROLLBACK');
        return { error: 'notFound' };
      }

      const current = await client.query(
        'SELECT COUNT(*)::int AS count, MAX("sortOrder") AS last FROM shop_product_images WHERE "productId" = $1',
        [productId]
      );
      const { count, last } = current.rows[0];
      if (count >= maxImages) {
        await client.query('ROLLBACK');
        return { error: 'full' };
      }

      const result = await client.query(
        `INSERT INTO shop_product_images ("productId", "userId", "imagePath", "imageUrl", "sortOrder", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [productId, userId, imagePath, imageUrl, last == null ? 0 : last + 1, new Date().toISOString()]
      );
      await client.query('COMMIT');
      return { image: result.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async delete(imageId, productId, userId) {
    const result = await pool.query(
      'DELETE FROM shop_product_images WHERE id = $1 AND "productId" = $2 AND "userId" = $3 RETURNING *',
      [imageId, productId, userId]
    );
    return result.rows[0] || null;
  }

  static async reorder(productId, ids) {
    await pool.query(
      `UPDATE shop_product_images i SET "sortOrder" = t.ord - 1
       FROM unnest($1::int[]) WITH ORDINALITY AS t(id, ord)
       WHERE i.id = t.id AND i."productId" = $2`,
      [ids, productId]
    );
  }
}

export default ShopProductImage;
