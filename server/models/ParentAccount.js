import pool from '../database.js';
import ParentTeacher from './ParentTeacher.js';

/**
 * 학부모 계정.
 *
 * 이 행은 학부모의 **프로필**(마지막 로그인·가입일)이고, 어느 선생님에게 속하는지는
 * `parent_teachers` 가 정한다 (docs/accounts-roles FR-350). `teacherId` 컬럼은
 * **대표 선생님**(가장 먼저 연결된 선생님)으로만 남겨 두어, 배포 중간 상태의
 * 옛 코드가 읽어도 깨지지 않게 한다 (FR-351).
 */
class ParentAccount {
  /**
   * 프로필을 만들거나 마지막 로그인을 갱신하고, 선생님 연결을 더한다.
   * 이미 연결된 선생님이면 아무 것도 바뀌지 않는다.
   */
  static async create({ userId, teacherId, inviteId = null }) {
    const now = new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO parent_accounts ("userId", "teacherId", "inviteId", "createdAt", "lastLoginAt")
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT ("userId") DO UPDATE SET "lastLoginAt" = EXCLUDED."lastLoginAt"
       RETURNING *`,
      [userId, teacherId, inviteId, now]
    );

    if (teacherId) {
      await ParentTeacher.link({ parentUserId: userId, teacherId, inviteId });
    }

    return result.rows[0];
  }

  static async getByUserId(userId) {
    const result = await pool.query('SELECT * FROM parent_accounts WHERE "userId" = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 학부모가 정한 표시 이름 ("예림엄마").
   * users.username 과 달리 UNIQUE 가 아니라 같은 별명이 여럿 있어도 된다.
   */
  static async updateDisplayName(userId, displayName) {
    const result = await pool.query(
      'UPDATE parent_accounts SET "displayName" = $1 WHERE "userId" = $2 RETURNING *',
      [displayName, userId]
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
   * 한 선생님의 학부모 목록 + 자녀.
   * 자녀는 **그 선생님의 자녀만** 담는다 — 학부모가 다른 선생님에게도 다니면
   * 그 집 아이가 이 선생님 화면에 보여선 안 된다 (FR-360).
   */
  static async listByTeacher(teacherId) {
    const result = await pool.query(
      `SELECT a."userId", pt."teacherId", a."createdAt", a."lastLoginAt", a."displayName",
              u.username, u.email,
              t.username AS "teacherName",
              c.id AS "childId", c."childName", c."childBirthdate", c.status,
              c."studentId", c."linkedBy", c."teacherId" AS "childTeacherId",
              s.name AS "studentName", s.birthdate AS "studentBirthdate"
         FROM parent_teachers pt
         JOIN parent_accounts a ON a."userId" = pt."parentUserId"
         JOIN users u ON u.id = pt."parentUserId"
         JOIN users t ON t.id = pt."teacherId"
         LEFT JOIN parent_children c
                ON c."parentUserId" = pt."parentUserId" AND c."teacherId" = pt."teacherId"
         LEFT JOIN students s ON s.id = c."studentId"
        WHERE pt."teacherId" = $1
        ORDER BY a."createdAt" DESC, c.id ASC`,
      [teacherId]
    );
    return this.groupRows(result.rows);
  }

  /** 시스템 관리자: 전체 학부모 (연결된 선생님 전부와 자녀 전부) */
  static async listAll() {
    const result = await pool.query(
      `SELECT a."userId", a."teacherId", a."createdAt", a."lastLoginAt", a."displayName",
              u.username, u.email,
              t.username AS "teacherName",
              c.id AS "childId", c."childName", c."childBirthdate", c.status,
              c."studentId", c."linkedBy", c."teacherId" AS "childTeacherId",
              ct.username AS "childTeacherName",
              s.name AS "studentName", s.birthdate AS "studentBirthdate"
         FROM parent_accounts a
         JOIN users u ON u.id = a."userId"
         LEFT JOIN users t ON t.id = a."teacherId"
         LEFT JOIN parent_children c ON c."parentUserId" = a."userId"
         LEFT JOIN users ct ON ct.id = c."teacherId"
         LEFT JOIN students s ON s.id = c."studentId"
        ORDER BY a."createdAt" DESC, c.id ASC`
    );

    const parents = this.groupRows(result.rows);
    const byParent = await ParentTeacher.listTeachersByParents(parents.map((p) => p.userId));

    for (const parent of parents) {
      parent.teachers = byParent[parent.userId] || [];
    }
    return parents;
  }

  static groupRows(rows) {
    const byUser = new Map();

    for (const r of rows) {
      if (!byUser.has(r.userId)) {
        byUser.set(r.userId, {
          userId: r.userId,
          username: r.username,
          // 학부모가 정한 별명. 없으면(옛 계정) 화면이 username 으로 되돌린다.
          displayName: r.displayName || null,
          email: r.email,
          teacherId: r.teacherId,
          teacherName: r.teacherName,
          createdAt: r.createdAt,
          lastLoginAt: r.lastLoginAt,
          teachers: [],
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
          teacherId: r.childTeacherId,
          teacherName: r.childTeacherName || r.teacherName,
          linkedBy: r.linkedBy
        });
      }
    }

    return [...byUser.values()];
  }

  static async delete(userId) {
    // users 를 지우면 parent_accounts·parent_teachers·parent_children 이 CASCADE 로 사라진다
    const result = await pool.query('DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id', [
      userId,
      'parent'
    ]);
    return result.rows.length > 0;
  }

  /**
   * 선생님을 지우기 전에 부른다.
   * 연결만 끊고, 남은 연결이 하나도 없는 학부모 계정만 함께 지운다 (FR-362) —
   * 다른 선생님에게도 다니는 학부모의 계정을 없애면 안 된다.
   */
  static async deleteByTeacher(teacherId) {
    const orphanIds = await ParentTeacher.unlinkAllByTeacher(teacherId);
    if (!orphanIds.length) return 0;

    const result = await pool.query(
      `DELETE FROM users WHERE id = ANY($1) AND role = 'parent'`,
      [orphanIds]
    );
    return result.rowCount;
  }
}

export default ParentAccount;
