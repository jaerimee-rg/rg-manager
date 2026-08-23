import pool from '../database.js';

class ParentChild {
  static async create({ parentUserId, childName, childBirthdate, studentId = null, linkedBy = null }) {
    const now = new Date().toISOString();
    const status = studentId ? 'linked' : 'pending';
    const result = await pool.query(
      `INSERT INTO parent_children
         ("parentUserId", "studentId", "childName", "childBirthdate", status, "linkedAt", "linkedBy", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [parentUserId, studentId, childName, childBirthdate, status, studentId ? now : null, studentId ? linkedBy : null, now]
    );
    return result.rows[0];
  }

  static async listByParent(parentUserId) {
    const result = await pool.query(
      `SELECT c.*, s.name AS "studentName", s.birthdate AS "studentBirthdate"
       FROM parent_children c
       LEFT JOIN students s ON s.id = c."studentId"
       WHERE c."parentUserId" = $1
       ORDER BY c.id ASC`,
      [parentUserId]
    );
    return result.rows;
  }

  // 권한 확인용 — 소유 학부모와 소속 선생님을 함께 가져온다
  static async getWithOwner(childId) {
    const result = await pool.query(
      `SELECT c.*, a."teacherId"
       FROM parent_children c
       JOIN parent_accounts a ON a."userId" = c."parentUserId"
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

  // 연결된 자녀만 (신청 가능 대상)
  static async linkedStudentIds(parentUserId) {
    const result = await pool.query(
      `SELECT "studentId" FROM parent_children WHERE "parentUserId" = $1 AND "studentId" IS NOT NULL`,
      [parentUserId]
    );
    return result.rows.map((r) => r.studentId);
  }
}

export default ParentChild;
