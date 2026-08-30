import pool from '../database.js';
import { displayNameSql } from '../utils/usernames.js';

/**
 * 학부모 ↔ 선생님 다대다 (docs/accounts-roles FR-350).
 * 학부모가 무엇을 볼 수 있는지는 전부 이 표에서 나온다.
 */
class ParentTeacher {
  /** 이미 연결돼 있으면 아무 것도 바꾸지 않는다 (초대 링크를 다시 눌러도 안전) */
  static async link({ parentUserId, teacherId, inviteId = null }) {
    const result = await pool.query(
      `INSERT INTO parent_teachers ("parentUserId", "teacherId", "inviteId", "createdAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("parentUserId", "teacherId") DO NOTHING
       RETURNING *`,
      [parentUserId, teacherId, inviteId, new Date().toISOString()]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async unlink(parentUserId, teacherId) {
    const result = await pool.query(
      'DELETE FROM parent_teachers WHERE "parentUserId" = $1 AND "teacherId" = $2 RETURNING id',
      [parentUserId, teacherId]
    );
    return result.rows.length > 0;
  }

  /** 연결된 선생님 (이름 포함, 먼저 연결한 순서) */
  static async listTeachers(parentUserId) {
    const result = await pool.query(
      `SELECT pt."teacherId" AS id, ${displayNameSql('u')} AS name, pt."createdAt" AS since
         FROM parent_teachers pt
         JOIN users u ON u.id = pt."teacherId"
        WHERE pt."parentUserId" = $1
        ORDER BY pt."createdAt" ASC, pt.id ASC`,
      [parentUserId]
    );
    return result.rows;
  }

  /** 스코프 질의용 id 배열 */
  static async teacherIds(parentUserId) {
    const result = await pool.query(
      'SELECT "teacherId" FROM parent_teachers WHERE "parentUserId" = $1 ORDER BY "createdAt" ASC, id ASC',
      [parentUserId]
    );
    return result.rows.map((row) => row.teacherId);
  }

  static async isLinked(parentUserId, teacherId) {
    const result = await pool.query(
      'SELECT 1 FROM parent_teachers WHERE "parentUserId" = $1 AND "teacherId" = $2',
      [parentUserId, teacherId]
    );
    return result.rows.length > 0;
  }

  /** 여러 학부모의 선생님을 한 번에 (목록 화면의 N+1 방지) */
  static async listTeachersByParents(parentUserIds = []) {
    if (!parentUserIds.length) return {};

    const result = await pool.query(
      `SELECT pt."parentUserId", pt."teacherId" AS id, ${displayNameSql('u')} AS name, pt."createdAt" AS since
         FROM parent_teachers pt
         JOIN users u ON u.id = pt."teacherId"
        WHERE pt."parentUserId" = ANY($1)
        ORDER BY pt."createdAt" ASC, pt.id ASC`,
      [parentUserIds]
    );

    const byParent = {};
    for (const row of result.rows) {
      (byParent[row.parentUserId] ||= []).push({ id: row.id, name: row.name, since: row.since });
    }
    return byParent;
  }

  /**
   * 선생님을 지우기 전에 부른다. 연결을 끊고, 그 결과 어느 선생님과도
   * 연결되지 않은 학부모 계정 id 를 돌려준다 (FR-362).
   */
  static async unlinkAllByTeacher(teacherId) {
    const affected = await pool.query(
      'DELETE FROM parent_teachers WHERE "teacherId" = $1 RETURNING "parentUserId"',
      [teacherId]
    );
    const parentIds = affected.rows.map((row) => row.parentUserId);
    if (!parentIds.length) return [];

    const orphans = await pool.query(
      `SELECT u.id FROM users u
        WHERE u.id = ANY($1) AND u.role = 'parent'
          AND NOT EXISTS (SELECT 1 FROM parent_teachers pt WHERE pt."parentUserId" = u.id)`,
      [parentIds]
    );
    return orphans.rows.map((row) => row.id);
  }
}

export default ParentTeacher;
