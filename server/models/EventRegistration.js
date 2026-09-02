import pool from '../database.js';

const hydrate = (row) => {
  if (!row) return row;
  let optionIds = [];
  try {
    const parsed = JSON.parse(row.optionIds || '[]');
    if (Array.isArray(parsed)) optionIds = parsed;
  } catch {
    optionIds = [];
  }
  return { ...row, optionIds };
};

class EventRegistration {
  /**
   * 신청 또는 옵션 변경. 자녀당 이벤트 1행이라 UNIQUE 충돌 시 갱신한다.
   * 취소했던 행은 다시 registered 로 되살린다(FR-55).
   */
  static async upsertRegistered({ eventId, studentId, parentUserId, optionIds, createdBy = 'parent' }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO event_registrations
         ("eventId", "studentId", "parentUserId", "optionIds", status, "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'registered', $5, $6, $6)
       ON CONFLICT ("eventId", "studentId") DO UPDATE
         SET "optionIds" = EXCLUDED."optionIds",
             -- 확정된 신청의 옵션만 바꾸는 경우 확정 상태를 유지한다
             status = CASE WHEN event_registrations.status = 'confirmed' THEN 'confirmed' ELSE 'registered' END,
             "cancelledAt" = NULL,
             "parentUserId" = COALESCE(EXCLUDED."parentUserId", event_registrations."parentUserId"),
             "updatedAt" = EXCLUDED."updatedAt"
       RETURNING *`,
      [eventId, studentId, parentUserId, JSON.stringify(optionIds || []), createdBy, now]
    );
    return hydrate(result.rows[0]);
  }

  static async cancel(eventId, studentId) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE event_registrations
       SET status = 'cancelled',
           "cancelledAt" = $1,
           "cancelledAfterConfirm" = (status = 'confirmed'),
           "updatedAt" = $1
       WHERE "eventId" = $2 AND "studentId" = $3
       RETURNING *`,
      [now, eventId, studentId]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async confirm(id) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE event_registrations
       SET status = 'confirmed', "confirmedAt" = $1, "cancelledAt" = NULL, "updatedAt" = $1
       WHERE id = $2 AND status <> 'cancelled'
       RETURNING *`,
      [now, id]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM event_registrations WHERE id = $1', [id]);
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async listByEvent(eventId) {
    const result = await pool.query(
      `SELECT r.*, s.name AS "studentName", s.birthdate AS "studentBirthdate",
              u.username AS "parentName"
       FROM event_registrations r
       JOIN students s ON s.id = r."studentId"
       LEFT JOIN users u ON u.id = r."parentUserId"
       WHERE r."eventId" = $1
       ORDER BY s.name ASC, r.id ASC`,
      [eventId]
    );
    return result.rows.map(hydrate);
  }

  /** 학부모 일정 화면: 내 자녀들의 신청 상태를 이벤트별로 */
  static async listForStudents(eventIds, studentIds) {
    if (!eventIds?.length || !studentIds?.length) return [];
    const result = await pool.query(
      `SELECT * FROM event_registrations
       WHERE "eventId" = ANY($1::int[]) AND "studentId" = ANY($2::int[])`,
      [eventIds, studentIds]
    );
    return result.rows.map(hydrate);
  }

  static async getByEventAndStudent(eventId, studentId) {
    const result = await pool.query(
      'SELECT * FROM event_registrations WHERE "eventId" = $1 AND "studentId" = $2',
      [eventId, studentId]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  /** 확정된 신청이 참가 학생에서 빠지면 다시 '신청' 상태로 되돌린다 */
  static async revertConfirmation(competitionId, studentId) {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE event_registrations r
       SET status = 'registered', "confirmedAt" = NULL, "updatedAt" = $1
       FROM events e
       WHERE e.id = r."eventId" AND e."competitionId" = $2
         AND r."studentId" = $3 AND r.status = 'confirmed'`,
      [now, competitionId, studentId]
    );
  }
}

export default EventRegistration;
