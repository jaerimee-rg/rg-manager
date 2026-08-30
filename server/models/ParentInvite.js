import pool from '../database.js';
import { generatePublicId } from '../utils/publicId.js';

class ParentInvite {
  // 선생님당 1개. 없으면 만들어서 돌려준다 (동시 요청도 UNIQUE 로 1개 유지)
  static async getOrCreate(userId) {
    const existing = await pool.query('SELECT * FROM parent_invites WHERE "userId" = $1', [userId]);
    if (existing.rows.length > 0) return existing.rows[0];

    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO parent_invites ("userId", token, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3)
       ON CONFLICT ("userId") DO NOTHING
       RETURNING *`,
      [userId, generatePublicId(), now]
    );

    if (result.rows.length > 0) return result.rows[0];

    const again = await pool.query('SELECT * FROM parent_invites WHERE "userId" = $1', [userId]);
    return again.rows[0];
  }

  static async getByToken(token) {
    const result = await pool.query(
      `SELECT i.*, COALESCE(NULLIF(u."displayName", ''), u.username) AS "teacherName"
       FROM parent_invites i
       JOIN users u ON u.id = i."userId"
       WHERE i.token = $1`,
      [token]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 만료가 설정돼 있으면 지난 링크는 무효로 본다
  static isUsable(invite, now = Date.now()) {
    if (!invite) return false;
    if (!invite.expiresAt) return true;
    const at = Date.parse(invite.expiresAt);
    return Number.isNaN(at) ? true : now < at;
  }

  static async regenerate(userId) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE parent_invites SET token = $1, "updatedAt" = $2 WHERE "userId" = $3 RETURNING *`,
      [generatePublicId(), now, userId]
    );
    return result.rows.length > 0 ? result.rows[0] : this.getOrCreate(userId);
  }
}

export default ParentInvite;
