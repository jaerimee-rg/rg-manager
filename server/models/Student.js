import pool from '../database.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

class Student {
  static async getAll(userId, role) {
    let query = 'SELECT * FROM students';
    let params = [];

    // Admin이 아닌 경우 userId로 필터링
    if (role !== 'admin') {
      query += ' WHERE "userId" = $1';
      params.push(userId);
    }

    query += ' ORDER BY id';
    const result = await pool.query(query, params);

    // classIds를 JSON 파싱
    return result.rows.map(student => ({
      ...student,
      classIds: safeJsonParse(student.classIds, [])
    }));
  }

  static async getById(id, userId, role) {
    let query = 'SELECT * FROM students WHERE id = $1';
    let params = [id];

    // Admin이 아닌 경우 userId로 추가 필터링
    if (role !== 'admin') {
      query += ' AND "userId" = $2';
      params.push(userId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) return null;

    const student = result.rows[0];
    return {
      ...student,
      classIds: safeJsonParse(student.classIds, [])
    };
  }

  // 여러 학생을 한 번에. 이름을 붙이거나 태그 대상을 검증할 때 쓴다.
  // 소유 규칙은 getById 와 같다 — 남의 학생은 결과에서 빠진다.
  static async getByIds(ids, userId, role) {
    if (!ids?.length) return [];

    let query = 'SELECT * FROM students WHERE id = ANY($1::int[])';
    const params = [ids];

    if (role !== 'admin') {
      query += ' AND "userId" = $2';
      params.push(userId);
    }

    const result = await pool.query(query, params);
    return result.rows.map((student) => ({ ...student, classIds: safeJsonParse(student.classIds, []) }));
  }

  static async create(data, userId) {
    const { name, birthdate, phone, parentPhone, classIds } = data;
    const createdAt = new Date().toISOString();
    const classIdsJson = JSON.stringify(classIds || []);

    const result = await pool.query(
      `INSERT INTO students (name, birthdate, phone, "parentPhone", "classIds", "userId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, birthdate, phone, parentPhone, classIdsJson, userId, createdAt]
    );

    const newStudent = result.rows[0];
    return {
      ...newStudent,
      classIds: safeJsonParse(newStudent.classIds, [])
    };
  }

  static async update(id, data, userId, role) {
    const { name, birthdate, phone, parentPhone, classIds } = data;
    const classIdsJson = JSON.stringify(classIds || []);

    let query = `UPDATE students
       SET name = $1, birthdate = $2, phone = $3, "parentPhone" = $4, "classIds" = $5
       WHERE id = $6`;
    let params = [name, birthdate, phone, parentPhone, classIdsJson, id];

    // Admin이 아닌 경우 userId로 추가 필터링
    if (role !== 'admin') {
      query += ' AND "userId" = $7';
      params.push(userId);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, params);

    if (result.rows.length === 0) return null;

    const updatedStudent = result.rows[0];
    return {
      ...updatedStudent,
      classIds: safeJsonParse(updatedStudent.classIds, [])
    };
  }

  static async delete(id, userId, role) {
    // 학생이 사라지면 parent_children.studentId 는 FK 로 NULL 이 되지만,
    // 상태까지 바꿔 두어야 학부모 화면에 "연결이 해제되었어요" 로 보인다.
    await pool.query(`UPDATE parent_children SET status = 'unlinked' WHERE "studentId" = $1`, [id]);

    let query = 'DELETE FROM students WHERE id = $1';
    let params = [id];

    // Admin이 아닌 경우 userId로 추가 필터링
    if (role !== 'admin') {
      query += ' AND "userId" = $2';
      params.push(userId);
    }

    await pool.query(query, params);
  }

  static async getByClassId(classId, userId, role) {
    // 해당 수업에 등록된 학생들 조회 (classIds JSON 배열에 classId 포함)
    let query = 'SELECT * FROM students';
    let params = [];

    // Admin이 아닌 경우 userId로 필터링
    if (role !== 'admin') {
      query += ' WHERE "userId" = $1';
      params.push(userId);
    }

    query += ' ORDER BY id';
    const result = await pool.query(query, params);

    // classIds에 해당 classId가 포함된 학생만 필터링
    const filteredStudents = result.rows
      .map(student => ({
        ...student,
        classIds: safeJsonParse(student.classIds, [])
      }))
      .filter(student => student.classIds.includes(parseInt(classId)));

    return filteredStudents;
  }
}

export default Student;
