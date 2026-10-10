import pool from '../database.js';

/**
 * 학부모 브라우저의 알림 구독 (push_subscriptions) — 기기(브라우저)마다 한 줄.
 * endpoint 가 기기를 가리키므로 UNIQUE 이고, 같은 기기에서 다른 학부모 계정으로 켜면 그 계정으로 옮겨 간다.
 */
class PushSubscription {
  static async upsert({ userId, endpoint, p256dh, auth, now = new Date() }) {
    const at = now.toISOString();
    const result = await pool.query(
      `INSERT INTO push_subscriptions ("userId", endpoint, p256dh, auth, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET "userId" = EXCLUDED."userId", p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
             "updatedAt" = EXCLUDED."updatedAt"
       RETURNING id`,
      [userId, endpoint, p256dh, auth, at]
    );
    return result.rows[0];
  }

  /** 내 기기의 구독만 지운다 — 다른 학부모의 endpoint 를 보내도 지워지지 않는다. → 지웠으면 true */
  static async deleteOwned(userId, endpoint) {
    const result = await pool.query(
      'DELETE FROM push_subscriptions WHERE "userId" = $1 AND endpoint = $2',
      [userId, endpoint]
    );
    return result.rowCount > 0;
  }

  /** 푸시 서비스가 "없는 구독"(404/410)이라고 답한 것 — 브라우저에서 알림을 끄거나 앱을 지운 경우 */
  static async deleteByIds(ids) {
    const list = (ids || []).map(Number).filter(Boolean);
    if (!list.length) return 0;
    const result = await pool.query('DELETE FROM push_subscriptions WHERE id = ANY($1::int[])', [list]);
    return result.rowCount;
  }

  /** 이 선생님과 연결된 학부모들의 구독 (학부모 일정에 그 선생님 이벤트가 보이는 사람과 같다) */
  static async listForTeacherParents(teacherId) {
    const result = await pool.query(
      `SELECT ps.id, ps."userId", ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN parent_teachers pt ON pt."parentUserId" = ps."userId"
         JOIN users u ON u.id = ps."userId" AND u.role = 'parent'
        WHERE pt."teacherId" = $1
        ORDER BY ps.id`,
      [teacherId]
    );
    return result.rows;
  }
}

export default PushSubscription;
