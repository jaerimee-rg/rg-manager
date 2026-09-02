import pool from '../database.js';
import { displayNameSql } from '../utils/usernames.js';

class ParentChild {
  static async create({ parentUserId, teacherId, childName, childBirthdate, studentId = null, linkedBy = null }) {
    const now = new Date().toISOString();
    const status = studentId ? 'linked' : 'pending';
    const result = await pool.query(
      `INSERT INTO parent_children
         ("parentUserId", "teacherId", "studentId", "childName", "childBirthdate", status, "linkedAt", "linkedBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [parentUserId, teacherId, studentId, childName, childBirthdate, status, studentId ? now : null, studentId ? linkedBy : null, now]
    );
    return result.rows[0];
  }

  /**
   * 자녀 목록. 선생님 이름을 함께 담아 학부모 화면이 "어느 선생님 아이인지" 를
   * 표시할 수 있게 한다. teacherIds 를 주면 그 선생님들 것만 (필터).
   */
  static async listByParent(parentUserId, { teacherIds } = {}) {
    const params = [parentUserId];
    let scope = '';

    if (Array.isArray(teacherIds)) {
      if (!teacherIds.length) return [];
      params.push(teacherIds);
      scope = ` AND c."teacherId" = ANY($${params.length})`;
    }

    const result = await pool.query(
      `SELECT c.*, s.name AS "studentName", s.birthdate AS "studentBirthdate",
              ${displayNameSql('t')} AS "teacherName"
       FROM parent_children c
       LEFT JOIN students s ON s.id = c."studentId"
       LEFT JOIN users t ON t.id = c."teacherId"
       WHERE c."parentUserId" = $1${scope}
       ORDER BY COALESCE(s.name, c."childName") ASC, c.id ASC`,
      params
    );
    return result.rows;
  }

  /**
   * 권한 확인용. 소속 선생님은 자녀 행이 직접 갖고 있다 —
   * 학부모가 여러 선생님과 연결되면 parent_accounts 조인으로는 결정할 수 없다.
   */
  static async getWithOwner(childId) {
    const result = await pool.query(
      `SELECT c.*, ${displayNameSql('t')} AS "teacherName"
       FROM parent_children c
       LEFT JOIN users t ON t.id = c."teacherId"
       WHERE c.id = $1`,
      [childId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async link(childId, studentId, linkedBy = 'teacher') {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE parent_children
       SET "studentId" = $1, status = 'linked', "linkedAt" = $2, "linkedBy" = $3
       WHERE id = $4
       RETURNING *`,
      [studentId, now, linkedBy, childId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async unlink(childId) {
    const result = await pool.query(
      `UPDATE parent_children
       SET "studentId" = NULL, status = 'pending', "linkedAt" = NULL, "linkedBy" = NULL
       WHERE id = $1
       RETURNING *`,
      [childId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async delete(childId) {
    const result = await pool.query('DELETE FROM parent_children WHERE id = $1 RETURNING id', [childId]);
    return result.rows.length > 0;
  }

  /**
   * 학생을 지우기 전에 호출한다. FK 는 SET NULL 이라 연결만 끊기고 행은 남으므로
   * 학부모 화면에서 "연결이 해제되었어요" 로 보이도록 상태를 함께 바꾼다.
   */
  static async markUnlinkedByStudent(studentId) {
    await pool.query(
      `UPDATE parent_children SET status = 'unlinked' WHERE "studentId" = $1`,
      [studentId]
    );
  }

  // 이 학부모가 이미 그 학생을 연결해 두었는지 (중복 연결 방지)
  static async hasStudent(parentUserId, studentId) {
    const result = await pool.query(
      'SELECT id FROM parent_children WHERE "parentUserId" = $1 AND "studentId" = $2',
      [parentUserId, studentId]
    );
    return result.rows.length > 0;
  }

  // 연결된 자녀만 (신청 가능 대상). teacherIds 를 주면 그 선생님들 자녀만.
  static async linkedStudentIds(parentUserId, { teacherIds } = {}) {
    const params = [parentUserId];
    let scope = '';

    if (Array.isArray(teacherIds)) {
      if (!teacherIds.length) return [];
      params.push(teacherIds);
      scope = ` AND "teacherId" = ANY($${params.length})`;
    }

    const result = await pool.query(
      `SELECT "studentId" FROM parent_children
        WHERE "parentUserId" = $1 AND "studentId" IS NOT NULL${scope}`,
      params
    );
    return result.rows.map((r) => r.studentId);
  }
}

export default ParentChild;
