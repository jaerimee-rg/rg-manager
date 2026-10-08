import pool from '../database.js';
import { displayNameSql } from '../utils/usernames.js';
import { parseOptions } from '../services/eventService.js';

const hydrate = (row) => (row ? { ...row, options: parseOptions(row.options) } : row);

/**
 * 학부모용 조회는 **연결된 선생님 전부**를 스코프로 받는다
 * (docs/accounts-roles FR-357). 하나만 넘겨도 동작하도록 감싸 준다.
 */
const toIdArray = (value) =>
  (Array.isArray(value) ? value : [value]).filter((id) => id !== null && id !== undefined);

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
      registrationOpen = true, registrationDeadline = null, competitionId = null,
      address = null, latitude = null, longitude = null
    } = data;

    const result = await client.query(
      `INSERT INTO events
         ("userId", type, title, date, "endDate", "startTime", location, description, options,
          "requireOption", "isPublished", "registrationOpen", "registrationDeadline",
          "competitionId", "createdAt", "updatedAt", address, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$18)
       RETURNING *`,
      [userId, type, title, date, endDate, startTime, location, description, JSON.stringify(options),
       requireOption, isPublished, registrationOpen, registrationDeadline, competitionId, now,
       address, latitude, longitude]
    );
    return hydrate(result.rows[0]);
  }

  static async update(id, data, userId, role, client = pool) {
    const now = new Date().toISOString();
    const {
      title, date, endDate = null, startTime = null, location = null, description = null,
      options = [], requireOption = false, isPublished = true, registrationOpen = true,
      registrationDeadline = null, address = null, latitude = null, longitude = null
    } = data;

    const params = [title, date, endDate, startTime, location, description, JSON.stringify(options),
      requireOption, isPublished, registrationOpen, registrationDeadline, now,
      address, latitude, longitude, id];

    let query = `UPDATE events
       SET title = $1, date = $2, "endDate" = $3, "startTime" = $4, location = $5,
           description = $6, options = $7, "requireOption" = $8, "isPublished" = $9,
           "registrationOpen" = $10, "registrationDeadline" = $11, "updatedAt" = $12,
           address = $13, latitude = $14, longitude = $15
       WHERE id = $16`;

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $17`;
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
  static async listUpcomingForParent(teacherIds, today, endOfYear) {
    const ids = toIdArray(teacherIds);
    if (!ids.length) return [];

    // 신청 인원은 선생님 목록(getAll)과 같은 셈법 — 취소는 빼고 센다
    const result = await pool.query(
      `SELECT e.*, ${displayNameSql('u')} AS "teacherName",
              (SELECT COUNT(*)::int FROM event_registrations r
                WHERE r."eventId" = e.id AND r.status <> 'cancelled') AS "registrationCount"
         FROM events e
         JOIN users u ON u.id = e."userId"
        WHERE e."userId" = ANY($1)
          AND e."isPublished" IS NOT FALSE
          AND COALESCE(e."endDate", e.date) >= $2
          AND e.date <= $3
        ORDER BY e.date ASC, e."startTime" ASC NULLS FIRST, e.id ASC`,
      [ids, today, endOfYear]
    );
    return result.rows.map(hydrate);
  }

  /**
   * 학부모 일정의 "지난 일정 보기": 끝난 공개 이벤트를 최근 것부터.
   * 종료일 조건이 listUpcomingForParent 의 반대라 진행 중인 기간 이벤트는 여기에 없다.
   * 연도 제한은 두지 않는다 — 작년 대회도 찾아볼 수 있어야 한다.
   */
  static async listPastForParent(teacherIds, today) {
    const ids = toIdArray(teacherIds);
    if (!ids.length) return [];

    const result = await pool.query(
      `SELECT e.*, ${displayNameSql('u')} AS "teacherName",
              (SELECT COUNT(*)::int FROM event_registrations r
                WHERE r."eventId" = e.id AND r.status <> 'cancelled') AS "registrationCount"
         FROM events e
         JOIN users u ON u.id = e."userId"
        WHERE e."userId" = ANY($1)
          AND e."isPublished" IS NOT FALSE
          AND COALESCE(e."endDate", e.date) < $2
        ORDER BY e.date DESC, e."startTime" DESC NULLS LAST, e.id DESC`,
      [ids, today]
    );
    return result.rows.map(hydrate);
  }

  // 학부모용 단건 조회 (공개된 것만, **연결된 선생님** 것만)
  static async getPublishedForParent(id, teacherIds) {
    const ids = toIdArray(teacherIds);
    if (!ids.length) return null;

    const result = await pool.query(
      `SELECT e.*, ${displayNameSql('u')} AS "teacherName"
         FROM events e
         JOIN users u ON u.id = e."userId"
        WHERE e.id = $1 AND e."userId" = ANY($2) AND e."isPublished" IS NOT FALSE`,
      [id, ids]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  // ───────── 앨범 (docs/photo-sharing) ─────────

  /** 앨범 폴더를 붙이거나 이름·상태를 고친다. 앨범 컬럼만 건드린다. */
  static async updateAlbum(id, fields) {
    const allowed = [
      'driveFolderId', 'driveFolderName', 'driveAccountId', 'albumUploadOpen', 'albumStatus', 'albumCheckedAt', 'albumCreatedAt',
      'albumPublished', 'albumAudience', 'albumPublishedAt'
    ];
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
   * 학부모 사진 탭: 앨범 폴더가 있고 **선생님이 앨범을 공개한** 공개 이벤트를 최근 순으로.
   * 공개 범위(참가 확정 / 전체)는 컨트롤러가 걸러낸다 (신청·참가 학생을 함께 봐야 하기 때문).
   */
  static async listWithAlbumsForParent(teacherIds) {
    const ids = toIdArray(teacherIds);
    if (!ids.length) return [];

    const result = await pool.query(
      `SELECT e.*, ${displayNameSql('u')} AS "teacherName"
         FROM events e
         JOIN users u ON u.id = e."userId"
        WHERE e."userId" = ANY($1)
          AND e."isPublished" IS NOT FALSE
          AND e."driveFolderId" IS NOT NULL
          AND e."albumPublished" IS TRUE
          AND e.type <> 'closure'
        ORDER BY e.date DESC, e.id DESC`,
      [ids]
    );
    return result.rows.map(hydrate);
  }

  /**
   * 선생님 사진 메뉴(docs/photo-menu 5.1): 내 대회·스페셜 전부를 최근 순으로.
   * 앨범이 있는 것은 앨범 카드가 되고, 전부가 [사진 올리기]의 "어느 이벤트 사진인가요?" 목록이 된다.
   * 사진 메뉴는 선생님 화면이라 역할과 상관없이 **자기 이벤트만** 본다.
   */
  static async listForPhotos(userId) {
    const result = await pool.query(
      `SELECT * FROM events
        WHERE "userId" = $1 AND type <> 'closure'
        ORDER BY date DESC, id DESC`,
      [userId]
    );
    return result.rows.map(hydrate);
  }

  /**
   * 공개하면 몇 명이 보게 되는지 (공개 패널 문구 · 0명 경고, photo-menu FR-521~522).
   * participants = 이 이벤트에 확정됐거나 참가 학생으로 들어간 학생과 연결된 학부모 계정 수
   * all          = 이 선생님과 연결된 학부모 계정 수
   */
  static async countAlbumViewers(event) {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT pc."parentUserId")::int
            FROM parent_children pc
           WHERE pc.status = 'linked'
             AND pc."studentId" IN (
               SELECT r."studentId" FROM event_registrations r
                WHERE r."eventId" = $1 AND r.status = 'confirmed'
               UNION
               SELECT cs."studentId" FROM competition_students cs
                WHERE $2::int IS NOT NULL AND cs."competitionId" = $2::int
             )) AS participants,
         (SELECT COUNT(DISTINCT pt."parentUserId")::int
            FROM parent_teachers pt
           WHERE pt."teacherId" = $3) AS "all"`,
      [event.id, event.competitionId || null, event.userId]
    );
    const row = result.rows[0] || {};
    return { participants: row.participants || 0, all: row.all || 0 };
  }

  /** 선생님이 Google 계정을 바꾸면 이전 연결로 만든 앨범을 표시해 둘 수 있게 */
  static async listByDriveAccount(driveAccountId) {
    const result = await pool.query('SELECT * FROM events WHERE "driveAccountId" = $1', [driveAccountId]);
    return result.rows.map(hydrate);
  }
}

export default Event;
