import pool from '../database.js';
import { RESERVATION_LIST_LIMIT } from '../utils/shopReservation.js';

// 추천 상품 예약 (docs/recommended-shop/05-reservations.md).
// 상품 이름은 지금 이름을 보여 주고, 상품이 지워졌으면 예약할 때 적어 둔 이름으로 떨어진다.
const SELECT = `
  SELECT r.id, r."productId", COALESCE(p.title, r."productTitle") AS "productTitle",
         r.name, r.phone, r."reservedDate", r.status, r."createdAt", r."updatedAt",
         (SELECT i."imageUrl" FROM shop_product_images i
          WHERE i."productId" = r."productId" ORDER BY i."sortOrder", i.id LIMIT 1) AS "imageUrl"
  FROM shop_reservations r
  LEFT JOIN shop_products p ON p.id = r."productId"`;

class ShopReservation {
  /**
   * 학부모의 예약 요청. 같은 상품·전화번호·날짜로 아직 '요청' 상태인 예약이 있으면
   * 새로 만들지 않고 그것을 돌려준다(버튼을 두 번 누르거나 다시 보낸 경우).
   * @returns {{ reservation: object, duplicate: boolean }}
   */
  static async create(userId, { productId, productTitle, name, phone, reservedDate }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `WITH existing AS (
         SELECT * FROM shop_reservations
         WHERE "userId" = $1 AND "productId" = $2 AND phone = $5 AND "reservedDate" = $6 AND status = 'requested'
         ORDER BY id LIMIT 1
       ), inserted AS (
         INSERT INTO shop_reservations
           ("userId", "productId", "productTitle", name, phone, "reservedDate", status, "createdAt", "updatedAt")
         SELECT $1::int, $2::int, $3::text, $4::text, $5::text, $6::text, 'requested', $7::text, $7::text
         WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING *
       )
       SELECT *, FALSE AS duplicate FROM inserted
       UNION ALL
       SELECT *, TRUE AS duplicate FROM existing`,
      [userId, productId, productTitle, name, phone, reservedDate, now]
    );
    const { duplicate, ...reservation } = result.rows[0];
    return { reservation, duplicate: Boolean(duplicate) };
  }

  /** 선생님 목록 — 최근 요청이 위 */
  static async listByUser(userId) {
    const result = await pool.query(
      `${SELECT}
       WHERE r."userId" = $1
       ORDER BY r."createdAt" DESC, r.id DESC
       LIMIT ${RESERVATION_LIST_LIMIT}`,
      [userId]
    );
    return result.rows;
  }

  /** 아직 처리하지 않은(요청) 예약 수 — 탭 옆 숫자 */
  static async countRequested(userId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shop_reservations WHERE "userId" = $1 AND status = 'requested'`,
      [userId]
    );
    return result.rows[0]?.count || 0;
  }

  /** 상태 변경 — 남의 예약이면 null */
  static async setStatus(id, userId, status) {
    const updated = await pool.query(
      `UPDATE shop_reservations SET status = $1, "updatedAt" = $2
       WHERE id = $3 AND "userId" = $4
       RETURNING id`,
      [status, new Date().toISOString(), id, userId]
    );
    if (!updated.rows[0]) return null;

    const result = await pool.query(`${SELECT} WHERE r.id = $1 AND r."userId" = $2`, [id, userId]);
    return result.rows[0] || null;
  }
}

export default ShopReservation;
