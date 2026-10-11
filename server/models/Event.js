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
    // 사진 전용 폴더(type='folder')는 이벤트가 아니다 — 이벤트 관리 목록에 넣지 않는다 (photo-menu FR-517)
    where.push(`e.type <> 'folder'`);

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
          AND e.type <> 'folder'
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
          AND e.type <> 'folder'
          AND COALESCE(e."endDate", e.date) < $2
        ORDER BY e.date DESC, e."startTime" DESC NULLS LAST, e.id DESC`,
      [ids, today]
    );
    return result.rows.map(hydrate);
  }

  /**
   * 학부모용 단건 조회 (공개된 것만, **연결된 선생님** 것만).
   * 사진 전용 폴더(type='folder')는 이벤트 상세·신청에서는 없는 것으로 친다. 앨범 화면만
   * includeFolders 로 읽는다 (photo-menu FR-517).
   */
  static async getPublishedForParent(id, teacherIds, { includeFolders = false } = {}) {
    const ids = toIdArray(teacherIds);
    if (!ids.length) return null;

    const result = await pool.query(
      `SELECT e.*, ${displayNameSql('u')} AS "teacherName"
         FROM events e
         JOIN users u ON u.id = e."userId"
        WHERE e.id = $1 AND e."userId" = ANY($2) AND e."isPublished" IS NOT FALSE
          ${includeFolders ? '' : `AND e.type <> 'folder'`}`,
      [id, ids]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  // ───────── 앨범 (docs/photo-sharing) ─────────

  /** 앨범 폴더를 붙이거나 이름·상태를 고친다. 앨범 컬럼만 건드린다. */
  static async updateAlbum(id, fields) {
    const allowed = [
      'driveFolderId', 'driveFolderName', 'driveAccountId', 'albumUploadOpen', 'albumStatus', 'albumCheckedAt', 'albumCreatedAt',
      'albumPublished', 'albumAudience', 'albumPublishedAt', 'albumCoverMediaIds'
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
   * 이벤트 앨범을 지운다 — **이벤트는 그대로 두고** 앨범만 비운다 (사진 메뉴 [폴더 삭제], photo-menu FR-519).
   * 사진 기록을 지우면 얼굴·태그도 CASCADE 로 사라지고, 앨범 컬럼은 앨범을 만들기 전으로 돌아간다(비공개 · 참가 확정 범위 ·
   * 업로드 받기 ON). 신청·참가 학생·대회 행은 건드리지 않는다. **Drive 는 건드리지 않는다** — 폴더와 원본은 Drive 에 남는다.
   * 사진 전용 폴더(type='folder')는 행째 지우므로(delete) 여기서 다루지 않는다.
   * → { event, mediaCount } | null(그런 이벤트 없음)
   */
  static async removeAlbum(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE events SET "driveFolderId" = NULL, "driveFolderName" = NULL, "driveAccountId" = NULL,
                "albumStatus" = 'none', "albumCreatedAt" = NULL, "albumCheckedAt" = NULL,
                "albumPublished" = FALSE, "albumPublishedAt" = NULL, "albumAudience" = 'participants',
                "albumUploadOpen" = TRUE, "albumCoverMediaIds" = NULL, "albumMatchRules" = NULL, "updatedAt" = $2
          WHERE id = $1 AND type <> 'folder'
          RETURNING *`,
        [id, new Date().toISOString()]
      );
      if (!updated.rows.length) {
        await client.query('ROLLBACK');
        return null;
      }
      const media = await client.query('DELETE FROM event_media WHERE "eventId" = $1', [id]);
      await client.query('COMMIT');
      return { event: hydrate(updated.rows[0]), mediaCount: media.rowCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 이 앨범의 자동 태그를 어떤 규칙으로 계산했는지 적는다 (albumService.ensureAlbumMatched).
   * 조회 요청에서 부르므로 updatedAt 은 건드리지 않는다 — 앨범을 열었다고 이벤트가 "수정" 된 것은 아니다.
   */
  static async setAlbumMatchRules(id, signature) {
    await pool.query('UPDATE events SET "albumMatchRules" = $2 WHERE id = $1', [id, signature]);
  }

  /**
   * 그 선생님의 모든 앨범을 "다시 매칭해야 함" 으로 돌린다 — 기준 얼굴이 등록·삭제되면 부른다.
   * 한 얼굴은 가장 가까운 아이에게만 붙으므로, 한 아이의 기준 얼굴이 바뀌면 다른 아이의 태그도 달라질 수 있다.
   */
  static async invalidateAlbumMatches(teacherUserId) {
    const result = await pool.query(
      'UPDATE events SET "albumMatchRules" = NULL WHERE "userId" = $1 AND "albumMatchRules" IS NOT NULL',
      [teacherUserId]
    );
    return result.rowCount;
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
   * 선생님 사진 메뉴(docs/photo-menu 5.1): 내 대회·스페셜·사진 폴더 전부를 최근 순으로.
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
   * 사진 메뉴의 "새 폴더 만들기"(docs/photo-menu FR-517): 이벤트 없이 이름과 날짜만으로 **사진 전용 폴더**를 만든다.
   * 앨범 기능을 그대로 쓰려고 events 행(type='folder')으로 두지만 이벤트가 아니다 — 이벤트 관리·학부모 일정·
   * 이벤트 상세·신청에는 나오지 않는다(getAll · listUpcoming/PastForParent · getPublishedForParent 가 뺀다).
   * isPublished=TRUE 는 앨범 접근 검사(이벤트 비공개면 앨범도 안 보임)를 통과하기 위해서다. 신청은 없고,
   * 신청한 학생이 없으니 앨범 공개 범위는 모든 학부모다. 앨범은 비공개로 시작하고, Drive 폴더는 첫 업로드 때
   * 만든다(albumService.ensureAlbum).
   */
  static async createForPhotos({ userId, title, date }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO events
         ("userId", type, title, date, options, "requireOption", "isPublished", "registrationOpen",
          "albumAudience", "createdAt", "updatedAt")
       VALUES ($1, 'folder', $2, $3, '[]', FALSE, TRUE, FALSE, 'all', $4, $4)
       RETURNING *`,
      [userId, title, date, now]
    );
    return hydrate(result.rows[0]);
  }

  /**
   * 사진 전용 폴더의 이름·날짜를 고친다 (docs/photo-menu FR-519). **type='folder' 행만** 건드린다 —
   * 이벤트 앨범은 updateAlbumEvent 가 대회 행 동기화까지 함께 맡는다.
   */
  static async updateFolder(id, { title, date }) {
    const result = await pool.query(
      `UPDATE events SET title = $1, date = $2, "updatedAt" = $3
        WHERE id = $4 AND type = 'folder'
        RETURNING *`,
      [title, date, new Date().toISOString(), id]
    );
    return result.rows.length > 0 ? hydrate(result.rows[0]) : null;
  }

  /**
   * 이벤트 앨범(대회·스페셜)의 이름·날짜를 사진 메뉴에서 고친다 (photo-menu FR-519, 2026-10-11 — 모든 폴더를 고칠 수 있어야 한다).
   * 앨범 폴더 이름은 이벤트 제목·날짜에서 나오므로 **이벤트의 제목·날짜를 고친다** — 이벤트 관리·학부모 일정에도 바뀐 이름으로 보인다.
   * 대회형은 이벤트 폼처럼 대회 행(competitions)의 이름·날짜도 한 트랜잭션에서 맞춘다. 장소·옵션·신청은 건드리지 않는다.
   * 사진 전용 폴더는 updateFolder 가, 휴관일은 앨범이 없어 여기서 다루지 않는다.
   * → 고친 이벤트 | null(그런 이벤트 없음)
   */
  static async updateAlbumEvent(id, { title, date, endDate = null }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE events SET title = $1, date = $2, "endDate" = $3, "updatedAt" = $4
          WHERE id = $5 AND type IN ('competition', 'special')
          RETURNING *`,
        [title, date, endDate, new Date().toISOString(), id]
      );
      if (!updated.rows.length) {
        await client.query('ROLLBACK');
        return null;
      }
      const event = updated.rows[0];
      if (event.competitionId) {
        await client.query('UPDATE competitions SET name = $1, date = $2 WHERE id = $3', [title, date, event.competitionId]);
      }
      await client.query('COMMIT');
      return hydrate(event);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
