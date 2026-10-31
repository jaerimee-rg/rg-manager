import pool from '../database.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';
import { parseOptions, resolveOptions } from '../services/eventService.js';

// competition_students 의 납부 여부 칸. SQL 칸 이름으로도 쓰이므로 요청 값을 그대로 쓰지 말고 이 목록으로 거른다.
export const PAYMENT_FIELDS = ['paid', 'coachFeePaid', 'photoFeePaid', 'videoFeePaid', 'costumeFeePaid'];

/** 요청 본문에서 납부 칸의 참/거짓 값만 고른다 */
export const pickPaymentChanges = (body) =>
  Object.fromEntries(
    PAYMENT_FIELDS.filter((field) => typeof body?.[field] === 'boolean').map((field) => [field, body[field]])
  );

class Competition {
  static async getAll(userId, role) {
    let query = 'SELECT * FROM competitions';
    let params = [];

    if (role !== 'admin') {
      query += ' WHERE "userId" = $1';
      params.push(userId);
    }

    query += ' ORDER BY date DESC, id DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getById(id, userId, role) {
    let query = 'SELECT * FROM competitions WHERE id = $1';
    let params = [id];

    if (role !== 'admin') {
      query += ' AND "userId" = $2';
      params.push(userId);
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async create(data, userId) {
    const { name, date, location } = data;
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO competitions (name, date, location, "userId", "createdAt")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, date, location, userId, createdAt]
    );

    return result.rows[0];
  }

  static async update(id, data, userId, role) {
    const { name, date, location } = data;

    let query = `UPDATE competitions
       SET name = $1, date = $2, location = $3
       WHERE id = $4`;
    let params = [name, date, location, id];

    if (role !== 'admin') {
      query += ' AND "userId" = $5';
      params.push(userId);
    }

    query += ' RETURNING *';
    const result = await pool.query(query, params);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async delete(id, userId, role) {
    let query = 'DELETE FROM competitions WHERE id = $1';
    let params = [id];

    if (role !== 'admin') {
      query += ' AND "userId" = $2';
      params.push(userId);
    }

    await pool.query(query, params);
  }

  // 대회 참가 학생 관련 메서드
  static async getStudents(competitionId, userId, role) {
    let query = `
      SELECT s.* FROM students s
      INNER JOIN competition_students cs ON s.id = cs."studentId"
      WHERE cs."competitionId" = $1
    `;
    let params = [competitionId];

    if (role !== 'admin') {
      query += ' AND s."userId" = $2';
      params.push(userId);
    }

    query += ' ORDER BY s.name ASC, s.id ASC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async addStudent(competitionId, studentId, events = null) {
    // 먼저 이미 등록되어 있는지 확인
    const existing = await pool.query(
      'SELECT id FROM competition_students WHERE "competitionId" = $1 AND "studentId" = $2',
      [competitionId, studentId]
    );

    if (existing.rows.length > 0) {
      // 이미 존재하면 events 업데이트
      if (events) {
        const result = await pool.query(
          `UPDATE competition_students SET events = $1 WHERE "competitionId" = $2 AND "studentId" = $3 RETURNING *`,
          [JSON.stringify(events), competitionId, studentId]
        );
        return result.rows[0];
      }
      return existing.rows[0];
    }

    const createdAt = new Date().toISOString();
    const eventsJson = events ? JSON.stringify(events) : null;

    const result = await pool.query(
      `INSERT INTO competition_students ("competitionId", "studentId", events, "createdAt")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [competitionId, studentId, eventsJson, createdAt]
    );

    return result.rows[0];
  }

  static async updateStudentEvents(competitionId, studentId, events) {
    const eventsJson = events ? JSON.stringify(events) : null;
    const result = await pool.query(
      `UPDATE competition_students SET events = $1 WHERE "competitionId" = $2 AND "studentId" = $3 RETURNING *`,
      [eventsJson, competitionId, studentId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getStudentEvents(competitionId, studentId) {
    const result = await pool.query(
      'SELECT events FROM competition_students WHERE "competitionId" = $1 AND "studentId" = $2',
      [competitionId, studentId]
    );
    if (result.rows.length > 0 && result.rows[0].events) {
      return safeJsonParse(result.rows[0].events, []);
    }
    return [];
  }

  static async getStudentsWithEvents(competitionId, userId, role) {
    let query = `
      SELECT s.*, cs.events, cs.paid, cs."coachFeePaid", cs."photoFeePaid", cs."videoFeePaid", cs."costumeFeePaid",
             e.options AS "eventOptions", r."optionIds" AS "registrationOptionIds", r.status AS "registrationStatus"
      FROM students s
      INNER JOIN competition_students cs ON s.id = cs."studentId"
      LEFT JOIN events e ON e."competitionId" = cs."competitionId"
      LEFT JOIN event_registrations r ON r."eventId" = e.id AND r."studentId" = cs."studentId"
      WHERE cs."competitionId" = $1
    `;
    let params = [competitionId];

    if (role !== 'admin') {
      query += ' AND s."userId" = $2';
      params.push(userId);
    }

    query += ' ORDER BY s.name ASC, s.id ASC';
    const result = await pool.query(query, params);
    return result.rows.map(({ eventOptions, registrationOptionIds, registrationStatus, ...row }) => ({
      ...row,
      ...Object.fromEntries(PAYMENT_FIELDS.map((field) => [field, row[field] || false])),
      events: safeJsonParse(row.events, []),
      // 학부모가 신청할 때 고른 항목. 직접 등록한 학생은 신청이 없어 빈 배열이다.
      registrationOptions: resolveOptions(parseOptions(registrationOptionIds), parseOptions(eventOptions)),
      // 확정 후 취소해도 참가 학생에서 자동으로 빠지지 않는다(FR-56)
      registrationCancelled: registrationStatus === 'cancelled'
    }));
  }

  /** 넘어온 칸만 바꾼다 — 칸마다 따로 저장하므로 연달아 눌러도 서로의 값을 덮어쓰지 않는다 */
  static async updateStudentPaid(competitionId, studentId, changes) {
    const fields = Object.keys(pickPaymentChanges(changes));
    if (fields.length === 0) return null;

    const assignments = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE competition_students SET ${assignments}
       WHERE "competitionId" = $${fields.length + 1} AND "studentId" = $${fields.length + 2} RETURNING *`,
      [...fields.map((field) => changes[field]), competitionId, studentId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async removeStudent(competitionId, studentId) {
    await pool.query(
      'DELETE FROM competition_students WHERE "competitionId" = $1 AND "studentId" = $2',
      [competitionId, studentId]
    );
  }

  static async getStudentIds(competitionId) {
    const result = await pool.query(
      'SELECT "studentId" FROM competition_students WHERE "competitionId" = $1',
      [competitionId]
    );
    return result.rows.map(row => row.studentId);
  }
}

export default Competition;
