import pool from '../database.js';
import { RESERVATION_LIST_LIMIT } from '../utils/shopReservation.js';

const UNIQUE_VIOLATION = '23505';
// 그 날을 차지하는 상태 (utils/shopReservation.js ACTIVE_RESERVATION_STATUSES 와 같다)
const ACTIVE = `('requested', 'confirmed')`;

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
   * 학부모의 예약 요청. 한 상품의 한 날짜에는 예약이 하나만 선다(요청·확정이 그 날을 차지한다).
   * - created   — 새로 만들었다
   * - duplicate — 그 날을 차지한 예약이 같은 전화번호 것이다(버튼을 두 번 누르거나 다시 보낸 경우)
   * - taken     — 다른 사람이 이미 그 날을 잡았다
   * 먼저 확인하고 넣고, 동시에 들어온 요청은 고유 인덱스(idx_shop_reservations_product_date)가 막는다.
   * @returns {{ reservation: object|null, outcome: 'created'|'duplicate'|'taken' }}
   */
  static async create(userId, { productId, productTitle, name, phone, reservedDate }) {
    const now = new Date().toISOString();
    let result;
    try {
      result = await pool.query(
        `WITH taken AS (
           SELECT * FROM shop_reservations
           WHERE "userId" = $1 AND "productId" = $2 AND "reservedDate" = $6 AND status IN ${ACTIVE}
           ORDER BY id LIMIT 1
         ), inserted AS (
           INSERT INTO shop_reservations
             ("userId", "productId", "productTitle", name, phone, "reservedDate", status, "createdAt", "updatedAt")
           SELECT $1::int, $2::int, $3::text, $4::text, $5::text, $6::text, 'requested', $7::text, $7::text
           WHERE NOT EXISTS (SELECT 1 FROM taken)
           RETURNING *
         )
         SELECT *, 'created' AS outcome FROM inserted
         UNION ALL
         SELECT *, CASE WHEN phone = $5::text THEN 'duplicate' ELSE 'taken' END AS outcome FROM taken`,
        [userId, productId, productTitle, name, phone, reservedDate, now]
      );
    } catch (error) {
      if (error?.code !== UNIQUE_VIOLATION) throw error;
      // 같은 순간에 다른 요청이 먼저 들어갔다 — 그 예약이 누구 것인지만 본다
      const winner = await pool.query(
        `SELECT * FROM shop_reservations
         WHERE "productId" = $1 AND "reservedDate" = $2 AND status IN ${ACTIVE} ORDER BY id LIMIT 1`,
        [productId, reservedDate]
      );
      const row = winner.rows[0] || null;
      return { reservation: row, outcome: row && row.phone === phone ? 'duplicate' : 'taken' };
    }
    const { outcome, ...reservation } = result.rows[0];
    return { reservation, outcome };
  }

  /** 그 상품에서 이미 차 있는 날짜(from 부터) — 학부모 달력에서 고를 수 없게 한다. 날짜만 나간다 */
  static async listTakenDates(productId, userId, from) {
    const result = await pool.query(
      `SELECT DISTINCT "reservedDate" FROM shop_reservations
       WHERE "productId" = $1 AND "userId" = $2 AND status IN ${ACTIVE} AND "reservedDate" >= $3
       ORDER BY "reservedDate"`,
      [productId, userId, from]
    );
    return result.rows.map((r) => r.reservedDate);
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

  /**
   * 상태 변경. 요청·확정으로 바꾸려는데 그 상품의 그 날을 다른 예약이 이미 차지하고 있으면 바꾸지 않는다
   * (취소했던 예약을 되살릴 때). 취소로 바꾸는 것은 언제나 된다.
   * @returns {{ reservation: object } | { error: 'notFound'|'conflict' }}
   */
  static async setStatus(id, userId, status) {
    let updated;
    try {
      updated = await pool.query(
        `UPDATE shop_reservations r SET status = $1::text, "updatedAt" = $2
         WHERE r.id = $3 AND r."userId" = $4
           AND ($1::text NOT IN ${ACTIVE} OR r."productId" IS NULL OR NOT EXISTS (
             SELECT 1 FROM shop_reservations o
             WHERE o."productId" = r."productId" AND o."reservedDate" = r."reservedDate"
               AND o.status IN ${ACTIVE} AND o.id <> r.id
           ))
         RETURNING r.id`,
        [status, new Date().toISOString(), id, userId]
      );
    } catch (error) {
      if (error?.code === UNIQUE_VIOLATION) return { error: 'conflict' };
      throw error;
    }

    if (!updated.rows[0]) {
      const owned = await pool.query('SELECT 1 FROM shop_reservations WHERE id = $1 AND "userId" = $2', [id, userId]);
      return { error: owned.rows[0] ? 'conflict' : 'notFound' };
    }

    const result = await pool.query(`${SELECT} WHERE r.id = $1 AND r."userId" = $2`, [id, userId]);
    return result.rows[0] ? { reservation: result.rows[0] } : { error: 'notFound' };
  }
}

export default ShopReservation;
