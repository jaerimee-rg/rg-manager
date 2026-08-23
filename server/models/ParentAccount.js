import pool from '../database.js';

class ParentAccount {
  static async create({ userId, teacherId, inviteId = null }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO parent_accounts ("userId", "teacherId", "inviteId", "createdAt", "lastLoginAt")
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT ("userId") DO UPDATE SET "lastLoginAt" = EXCLUDED."lastLoginAt"
       RETURNING *`,
      [userId, teacherId, inviteId, now]
    );
    return result.rows[0];
  }

  static async getByUserId(userId) {
    const result = await pool.query(
      `SELECT a.*, u.username AS "teacherName"
       FROM parent_accounts a
       JOIN users u ON u.id = a."teacherId"
       WHERE a."userId" = $1`,
      [userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async touchLogin(userId) {
    await pool.query('UPDATE parent_accounts SET "lastLoginAt" = $1 WHERE "userId" = $2', [
      new Date().toISOString(),
      userId
    ]);
  }

  /**
   * 선생님(또는 관리자가 고른 선생님)의 학부모 목록 + 자녀.
   * 학부모 1명이 여러 자녀를 가질 수 있어 행을 합쳐서 돌려준다.
   */
  static async listByTeacher(teacherId) {
    const result = await pool.query(
      `SELECT a."userId", a."teacherId", a."createdAt", a."lastLoginAt",
              u.username, u.email,
              t.username AS "teacherName",
              c.id AS "childId", c."childName", c."childBirthdate", c.status,
              c."studentId", c."linkedBy",
              s.name AS "studentName", s.birthdate AS "studentBirthdate"
       FROM parent_accounts a
       JOIN users u ON u.id = a."userId"
       JOIN users t ON t.id = a."teacherId"
       LEFT JOIN parent_children c ON c."parentUserId" = a."userId"
       LEFT JOIN students s ON s.id = c."studentId"
       WHERE a."teacherId" = $1
       ORDER BY a."createdAt" DESC, c.id ASC`,
      [teacherId]
    );
    return this.groupRows(result.rows);
  }

  // 시스템 관리자: 전체 학부모 (선생님 정보 포함)
  static async listAll() {
    const result = await pool.query(
      `SELECT a."userId", a."teacherId", a."createdAt", a."lastLoginAt",
              u.username, u.email,
              t.username AS "teacherName",
              c.id AS "childId", c."childName", c."childBirthdate", c.status,
              c."studentId", c."linkedBy",
              s.name AS "studentName", s.birthdate AS "studentBirthdate"
       FROM parent_accounts a
       JOIN users u ON u.id = a."userId"
       JOIN users t ON t.id = a."teacherId"
       LEFT JOIN parent_children c ON c."parentUserId" = a."userId"
       LEFT JOIN students s ON s.id = c."studentId"
       ORDER BY a."createdAt" DESC, c.id ASC`
    );
    return this.groupRows(result.rows);
  }

  static groupRows(rows) {
    const byUser = new Map();

    for (const r of rows) {
      if (!byUser.has(r.userId)) {
        byUser.set(r.userId, {
          userId: r.userId,
          username: r.username,
          email: r.email,
          teacherId: r.teacherId,
          teacherName: r.teacherName,
          createdAt: r.createdAt,
          lastLoginAt: r.lastLoginAt,
          children: []
        });
      }
      if (r.childId) {
        byUser.get(r.userId).children.push({
          id: r.childId,
          childName: r.childName,
          childBirthdate: r.childBirthdate,
          status: r.status,
          studentId: r.studentId,
          studentName: r.studentName,
          studentBirthdate: r.studentBirthdate,
          linkedBy: r.linkedBy
        });
      }
    }

    return [...byUser.values()];
  }

  static async delete(userId) {
    // users 를 지우면 parent_accounts·parent_children 은 CASCADE 로 함께 사라진다
    const result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id', [
      userId,
      'parent'
    ]);
    return result.rows.length > 0;
  }

  // 선생님 계정을 지우기 전에 소속 학부모 계정을 함께 정리한다
  static async deleteByTeacher(teacherId) {
    const result = await pool.query(
      `DELETE FROM users WHERE id IN (SELECT "userId" FROM parent_accounts WHERE "teacherId" = $1) RETURNING id`,
      [teacherId]
    );
    return result.rowCount;
  }
}

export default ParentAccount;
