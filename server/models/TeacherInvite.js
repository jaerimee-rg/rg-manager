import pool from '../database.js';
import { generatePublicId } from '../utils/publicId.js';

const DEFAULT_EXPIRES_DAYS = 14;

/**
 * 선생님 초대 (관리자 발급, 일회용) — docs/accounts-roles FR-340~348.
 * 상태는 컬럼이 아니라 usedAt·revokedAt·expiresAt 에서 파생한다.
 */
class TeacherInvite {
  /** 대기 / 사용됨 / 회수됨 / 만료 — 순수 함수라 화면·테스트가 같은 규칙을 쓴다 */
  static statusOf(invite, now = Date.now()) {
    if (!invite) return 'invalid';
    if (invite.revokedAt) return 'revoked';
    if (invite.usedAt) return 'used';
    if (invite.expiresAt) {
      const at = Date.parse(invite.expiresAt);
      if (!Number.isNaN(at) && now >= at) return 'expired';
    }
    return 'pending';
  }

  /** 이 토큰으로 지금 가입할 수 있는가 */
  static isUsable(invite, now = Date.now()) {
    return this.statusOf(invite, now) === 'pending';
  }

  static async create({ createdBy, label = null, expiresInDays = DEFAULT_EXPIRES_DAYS }) {
    const now = new Date();
    const days = Number(expiresInDays);
    // 0 · null · 숫자가 아니면 만료 없음
    const expiresAt =
      Number.isFinite(days) && days > 0
        ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const result = await pool.query(
      `INSERT INTO teacher_invites (token, "createdBy", label, "expiresAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [generatePublicId(), createdBy, label ? String(label).trim().slice(0, 100) : null, expiresAt, now.toISOString()]
    );
    return result.rows[0];
  }

  static async list() {
    const result = await pool.query(
      `SELECT i.*, COALESCE(NULLIF(u."displayName", ''), u.username) AS "usedByName", COALESCE(NULLIF(c."displayName", ''), c.username) AS "createdByName"
         FROM teacher_invites i
         LEFT JOIN users u ON u.id = i."usedByUserId"
         LEFT JOIN users c ON c.id = i."createdBy"
        ORDER BY i.id DESC`
    );
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM teacher_invites WHERE id = $1', [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getByToken(token) {
    const result = await pool.query(
      `SELECT i.*, COALESCE(NULLIF(c."displayName", ''), c.username) AS "createdByName"
         FROM teacher_invites i
         LEFT JOIN users c ON c.id = i."createdBy"
        WHERE i.token = $1`,
      [token]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 사용 처리. 두 사람이 같은 링크를 동시에 열어도 `usedAt IS NULL` 조건 덕분에
   * 한 명만 성공한다 (실패하면 null → 컨트롤러가 409).
   */
  static async markUsed(id, userId) {
    const result = await pool.query(
      `UPDATE teacher_invites
          SET "usedAt" = $1, "usedByUserId" = $2
        WHERE id = $3 AND "usedAt" IS NULL AND "revokedAt" IS NULL
        RETURNING *`,
      [new Date().toISOString(), userId, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** 아직 쓰이지 않은 초대만 회수할 수 있다 */
  static async revoke(id) {
    const result = await pool.query(
      `UPDATE teacher_invites
          SET "revokedAt" = $1
        WHERE id = $2 AND "usedAt" IS NULL
        RETURNING *`,
      [new Date().toISOString(), id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export default TeacherInvite;
export { DEFAULT_EXPIRES_DAYS };
