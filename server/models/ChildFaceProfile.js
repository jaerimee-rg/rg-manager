import pool from '../database.js';
import { decodeDescriptor } from '../utils/faceVector.js';

/** 학부모가 자녀당 등록할 수 있는 장수 / 학생 한 명에 쌓일 수 있는 총 장수 (FR-260) */
export const MAX_PER_PARENT = 3;
export const MAX_PER_STUDENT = 5;

/**
 * 자녀 기준 얼굴. 학생 단위로 모으고, 누가 올렸는지 기억한다.
 * 이미지는 선택이며(비공개 버킷), 매칭에 쓰는 것은 descriptor 뿐이다.
 */
class ChildFaceProfile {
  static async create({ studentId, teacherUserId, parentUserId, createdBy = 'parent', descriptor, storagePath = null, consentAt = null }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO child_face_profiles
         ("studentId", "teacherUserId", "parentUserId", "createdBy", "storagePath", descriptor, "consentAt", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [studentId, teacherUserId, parentUserId, createdBy, storagePath, descriptor, consentAt, now]
    );
    return result.rows[0];
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM child_face_profiles WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async listByStudent(studentId) {
    const result = await pool.query(
      'SELECT * FROM child_face_profiles WHERE "studentId" = $1 ORDER BY id',
      [studentId]
    );
    return result.rows;
  }

  static async countByParentAndStudent(parentUserId, studentId) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM child_face_profiles WHERE "parentUserId" = $1 AND "studentId" = $2',
      [parentUserId, studentId]
    );
    return result.rows[0]?.count || 0;
  }

  static async countByStudent(studentId) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM child_face_profiles WHERE "studentId" = $1',
      [studentId]
    );
    return result.rows[0]?.count || 0;
  }

  /** 여러 자녀의 등록 장수를 한 번에 (내 정보 화면) */
  static async countsByStudents(studentIds) {
    if (!studentIds?.length) return {};
    const result = await pool.query(
      `SELECT "studentId", COUNT(*)::int AS count FROM child_face_profiles
        WHERE "studentId" = ANY($1::int[]) GROUP BY "studentId"`,
      [studentIds]
    );
    return Object.fromEntries(result.rows.map((row) => [row.studentId, row.count]));
  }

  /** 매칭용 — 선생님의 학생 전체 기준 얼굴 */
  static async listVectorsByTeacher(teacherUserId, { studentId = null } = {}) {
    const params = [teacherUserId];
    let clause = '"teacherUserId" = $1';
    if (studentId) {
      params.push(studentId);
      clause += ` AND "studentId" = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT id, "studentId", descriptor FROM child_face_profiles WHERE ${clause}`,
      params
    );
    return result.rows
      .map((row) => ({ id: row.id, studentId: row.studentId, descriptor: decodeDescriptor(row.descriptor) }))
      .filter((row) => row.descriptor);
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM child_face_profiles WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

export default ChildFaceProfile;
