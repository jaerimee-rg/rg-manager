import pool from '../database.js';
import { parseOptions } from '../services/eventService.js';

const hydrate = (row) => (row ? { ...row, options: parseOptions(row.options) } : row);

class Event {
  static async getAll(userId, role, { type, includePast, today } = {}) {
    const params = [];
    const where = [];

    // 관리자는 userId 를 넘기지 않으면 전체를 본다 (기존 컨트롤러 패턴과 동일)
    if (userId != null) {
      params.push(userId);
      where.push(`e."userId" = $${params.length}`);
    }
    if (type) {
      params.push(type);
      where.push(`e.type = $${params.length}`);
    }
    if (!includePast && today) {
      params.push(today);
      where.push(`COALESCE(e."endDate", e.date) >= $${params.length}`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT e.*,
              (SELECT COUNT(*)::int FROM event_registrations r
                WHERE r."eventId" = e.id AND r.status <> 'cancelled') AS "registrationCount",
              (SELECT COUNT(*)::int FROM competition_students cs
                WHERE cs."competitionId" = e."competitionId") AS "participantCount"
       FROM events e
       ${clause}
       ORDER BY e.date ASC, e.id ASC`,
      params
    );
    return result.rows.map(hydrate);
  }

  static async getById(id, userId, role) {
    const params = [id];
    let query = 'SELECT * FROM events WHERE id = $1';

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $2`;
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async getByCompetitionId(competitionId) {
    const result = await pool.query('SELECT * FROM events WHERE "competitionId" = $1', [competitionId]);
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async create(data, client = pool) {
    const now = new Date().toISOString();
    const {
      userId, type, title, date, endDate = null, startTime = null, location = null,
      description = null, options = [], requireOption = false, isPublished = true,
      registrationOpen = true, registrationDeadline = null, competitionId = null
    } = data;

    const result = await client.query(
      `INSERT INTO events
         ("userId", type, title, date, "endDate", "startTime", location, description, options,
          "requireOption", "isPublished", "registrationOpen", "registrationDeadline",
          "competitionId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
       RETURNING *`,
      [userId, type, title, date, endDate, startTime, location, description, JSON.stringify(options),
       requireOption, isPublished, registrationOpen, registrationDeadline, competitionId, now]
    );
    return hydrate(result.rows[0]);
  }

  static async update(id, data, userId, role, client = pool) {
    const now = new Date().toISOString();
    const {
      title, date, endDate = null, startTime = null, location = null, description = null,
      options = [], requireOption = false, isPublished = true, registrationOpen = true,
      registrationDeadline = null
    } = data;

    const params = [title, date, endDate, startTime, location, description, JSON.stringify(options),
      requireOption, isPublished, registrationOpen, registrationDeadline, now, id];

    let query = `UPDATE events
       SET title = $1, date = $2, "endDate" = $3, "startTime" = $4, location = $5,
           description = $6, options = $7, "requireOption" = $8, "isPublished" = $9,
           "registrationOpen" = $10, "registrationDeadline" = $11, "updatedAt" = $12
       WHERE id = $13`;

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $14`;
    }

    const result = await client.query(`${query} RETURNING *`, params);
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  static async delete(id, userId, role) {
    const params = [id];
    let query = 'DELETE FROM events WHERE id = $1';

    if (role !== 'admin') {
      params.push(userId);
      query += ' AND "userId" = $2';
    }

    const result = await pool.query(`${query} RETURNING *`, params);
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  /**
   * 학부모 일정: 오늘(KST)부터 그 해 12월 31일까지의 공개 이벤트.
   * 시작일이 지났어도 종료일이 남은 기간 이벤트(진행 중)는 포함한다.
   */
  static async listUpcomingForParent(teacherId, today, endOfYear) {
    const result = await pool.query(
      `SELECT * FROM events
       WHERE "userId" = $1
         AND "isPublished" IS NOT FALSE
         AND COALESCE("endDate", date) >= $2
         AND date <= $3
       ORDER BY date ASC, "startTime" ASC NULLS FIRST, id ASC`,
      [teacherId, today, endOfYear]
    );
    return result.rows.map(hydrate);
  }

  // 학부모용 단건 조회 (공개된 것만, 소속 선생님 것만)
  static async getPublishedForParent(id, teacherId) {
    const result = await pool.query(
      `SELECT * FROM events WHERE id = $1 AND "userId" = $2 AND "isPublished" IS NOT FALSE`,
      [id, teacherId]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  // ───────── 앨범 (docs/photo-sharing) ─────────

  /** 앨범 폴더를 붙이거나 이름·상태를 고친다. 앨범 컬럼만 건드린다. */
  static async updateAlbum(id, fields) {
    const allowed = ['driveFolderId', 'driveFolderName', 'driveAccountId', 'albumUploadOpen', 'albumStatus', 'albumCheckedAt', 'albumCreatedAt'];
    const sets = [];
    const params = [id];

    for (const key of allowed) {
      if (fields[key] === undefined) continue;
      params.push(fields[key]);
      sets.push(`"${key}" = $${params.length}`);
    }
    if (!sets.length) return null;

    params.push(new Date().toISOString());
    sets.push(`"updatedAt" = $${params.length}`);

    const result = await pool.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  /**
   * 학부모 사진 탭: 앨범 폴더가 있는 공개 이벤트를 최근 순으로.
   * 확정 여부는 컨트롤러가 걸러낸다 (신청·참가 학생을 함께 봐야 하기 때문).
   */
  static async listWithAlbumsForParent(teacherId) {
    const result = await pool.query(
      `SELECT * FROM events
        WHERE "userId" = $1
          AND "isPublished" IS NOT FALSE
          AND "driveFolderId" IS NOT NULL
          AND type <> 'closure'
        ORDER BY date DESC, id DESC`,
      [teacherId]
    );
    return result.rows.map(hydrate);
  }

  /** 선생님이 Google 계정을 바꾸면 이전 연결로 만든 앨범을 표시해 둘 수 있게 */
  static async listByDriveAccount(driveAccountId) {
    const result = await pool.query('SELECT * FROM events WHERE "driveAccountId" = $1', [driveAccountId]);
    return result.rows.map(hydrate);
  }
}

export default Event;
