import pool from '../database.js';

/**
 * 앨범의 사진·영상 한 건. 바이트는 Drive 에 있고 여기에는 파일 id 와 메타만 둔다.
 * 갤러리 조회는 커서(takenAt, id) 로 페이지를 넘긴다.
 */
class EventMedia {
  /** 업로드 세션을 만들 때 먼저 만들어 두는 행 (status='uploading') */
  static async createPending(data, client = pool) {
    const now = new Date().toISOString();
    const {
      eventId, kind, originalName, driveName, mimeType, size = 0, takenAt,
      uploaderUserId, uploaderRole, uploaderStudentId = null, uploadSessionUri = null
    } = data;

    const result = await client.query(
      `INSERT INTO event_media
         ("eventId", kind, "originalName", "driveName", "mimeType", size, "takenAt",
          "uploaderUserId", "uploaderRole", "uploaderStudentId", "uploadSessionUri",
          status, "faceStatus", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'uploading','pending',$12,$12)
       RETURNING *`,
      [eventId, kind, originalName, driveName, mimeType, size, takenAt,
        uploaderUserId, uploaderRole, uploaderStudentId, uploadSessionUri, now]
    );
    return result.rows[0];
  }

  static async getById(id, client = pool) {
    const result = await client.query('SELECT * FROM event_media WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /** 업로드가 끝나 Drive 파일이 확인된 뒤 */
  static async markReady(id, { driveFileId, size, width, height, durationMs, takenAt }, client = pool) {
    const now = new Date().toISOString();
    const result = await client.query(
      `UPDATE event_media
          SET "driveFileId" = $2,
              size = COALESCE($3, size),
              width = COALESCE($4, width),
              height = COALESCE($5, height),
              "durationMs" = COALESCE($6, "durationMs"),
              "takenAt" = COALESCE($7, "takenAt"),
              status = 'ready',
              "uploadSessionUri" = NULL,
              "updatedAt" = $8
        WHERE id = $1
        RETURNING *`,
      [id, driveFileId, size ?? null, width ?? null, height ?? null, durationMs ?? null, takenAt ?? null, now]
    );
    return result.rows[0] || null;
  }

  static async setFaceStatus(id, { faceStatus, faceCount = 0, faceError = null }, client = pool) {
    const now = new Date().toISOString();
    const result = await client.query(
      `UPDATE event_media
          SET "faceStatus" = $2, "faceCount" = $3, "faceError" = $4, "faceAnalyzedAt" = $5, "updatedAt" = $5
        WHERE id = $1
        RETURNING *`,
      [id, faceStatus, faceCount, faceError, now]
    );
    return result.rows[0] || null;
  }

  static async setHidden(ids, isHidden, eventId) {
    if (!ids?.length) return 0;
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE event_media SET "isHidden" = $2, "updatedAt" = $3
        WHERE id = ANY($1::int[]) AND "eventId" = $4`,
      [ids, isHidden, now, eventId]
    );
    return result.rowCount;
  }

  static async markMissing(ids) {
    if (!ids?.length) return 0;
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE event_media SET status = 'missing', "updatedAt" = $2 WHERE id = ANY($1::int[])`,
      [ids, now]
    );
    return result.rowCount;
  }

  static async updateVideoMeta(id, { width, height, durationMs }) {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE event_media SET width = COALESCE($2, width), height = COALESCE($3, height),
              "durationMs" = COALESCE($4, "durationMs"), "updatedAt" = $5
        WHERE id = $1`,
      [id, width ?? null, height ?? null, durationMs ?? null, now]
    );
  }

  static async delete(id, client = pool) {
    const result = await client.query('DELETE FROM event_media WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }

  static async deleteMany(ids, eventId) {
    if (!ids?.length) return [];
    const result = await pool.query(
      'DELETE FROM event_media WHERE id = ANY($1::int[]) AND "eventId" = $2 RETURNING *',
      [ids, eventId]
    );
    return result.rows;
  }

  /**
   * 갤러리 목록. 태그는 한 번에 붙여 N+1 을 피한다.
   *
   * filter: all | photo | video | uploaded(내가 올린 것) | untagged | candidates | unanalyzed | hidden
   */
  static async list(eventId, {
    filter = 'all', studentIds = null, uploaderUserId = null,
    includeHidden = false, limit = 60, cursor = null
  } = {}) {
    const params = [eventId];
    const where = [`m."eventId" = $1`, `m.status = 'ready'`];

    if (!includeHidden) where.push('m."isHidden" = FALSE');
    if (filter === 'hidden') { where.push('m."isHidden" = TRUE'); }
    if (filter === 'photo') where.push(`m.kind = 'image'`);
    if (filter === 'video') where.push(`m.kind = 'video'`);
    if (filter === 'uploaded' && uploaderUserId) {
      params.push(uploaderUserId);
      where.push(`m."uploaderUserId" = $${params.length}`);
    }
    if (filter === 'teacher') where.push(`m."uploaderRole" = 'teacher'`);
    if (filter === 'parent') where.push(`m."uploaderRole" = 'parent'`);
    if (filter === 'unanalyzed') where.push(`m.kind = 'image' AND m."faceStatus" IN ('pending','failed','skipped')`);
    if (filter === 'untagged') {
      where.push(`NOT EXISTS (SELECT 1 FROM media_tags t WHERE t."mediaId" = m.id AND t.source <> 'candidate' AND t.source <> 'excluded')`);
    }
    if (filter === 'candidates') {
      where.push(`EXISTS (SELECT 1 FROM media_tags t WHERE t."mediaId" = m.id AND t.source = 'candidate')`);
    }
    // "우리 아이만" — 자녀 태그가 있는 것만
    if (studentIds?.length) {
      params.push(studentIds);
      where.push(`EXISTS (SELECT 1 FROM media_tags t WHERE t."mediaId" = m.id
                    AND t."studentId" = ANY($${params.length}::int[])
                    AND t.source IN ('face','manual','parent_confirmed'))`);
    }
    if (cursor?.takenAt && cursor?.id) {
      params.push(cursor.takenAt, cursor.id);
      where.push(`(m."takenAt", m.id) < ($${params.length - 1}, $${params.length})`);
    }

    params.push(Math.min(Number(limit) || 60, 200));

    const result = await pool.query(
      `SELECT m.*, COALESCE(NULLIF(u."displayName", ''), u.username) AS "uploaderName"
         FROM event_media m
         LEFT JOIN users u ON u.id = m."uploaderUserId"
        WHERE ${where.join(' AND ')}
        ORDER BY m."takenAt" DESC, m.id DESC
        LIMIT $${params.length}`,
      params
    );
    return result.rows;
  }

  /** 이벤트의 통계 한 번에 */
  static async stats(eventId) {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE kind = 'image' AND status = 'ready' AND NOT "isHidden")::int AS images,
         COUNT(*) FILTER (WHERE kind = 'video' AND status = 'ready' AND NOT "isHidden")::int AS videos,
         COUNT(*) FILTER (WHERE status = 'ready' AND "isHidden")::int AS hidden,
         COUNT(*) FILTER (WHERE status = 'ready' AND kind = 'image'
                            AND "faceStatus" IN ('pending','failed','skipped'))::int AS unanalyzed,
         COALESCE(SUM(size) FILTER (WHERE status = 'ready'), 0)::bigint AS "totalSize"
       FROM event_media WHERE "eventId" = $1`,
      [eventId]
    );
    const row = result.rows[0] || {};

    const tagged = await pool.query(
      `SELECT
         COUNT(DISTINCT m.id) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM media_tags t
                              WHERE t."mediaId" = m.id AND t.source IN ('face','manual','parent_confirmed'))
         )::int AS untagged,
         COUNT(DISTINCT m.id) FILTER (
           WHERE EXISTS (SELECT 1 FROM media_tags t WHERE t."mediaId" = m.id AND t.source = 'candidate')
         )::int AS candidates
       FROM event_media m
       WHERE m."eventId" = $1 AND m.status = 'ready' AND NOT m."isHidden"`,
      [eventId]
    );

    return {
      images: row.images || 0,
      videos: row.videos || 0,
      hidden: row.hidden || 0,
      unanalyzed: row.unanalyzed || 0,
      totalSize: Number(row.totalSize || 0),
      untagged: tagged.rows[0]?.untagged || 0,
      candidates: tagged.rows[0]?.candidates || 0
    };
  }

  /** 여러 이벤트의 개수·미리보기를 한 번에 (학부모 앨범 목록) */
  static async summaries(eventIds, { studentIds = [] } = {}) {
    if (!eventIds?.length) return {};

    const counts = await pool.query(
      `SELECT "eventId",
              COUNT(*) FILTER (WHERE kind = 'image')::int AS images,
              COUNT(*) FILTER (WHERE kind = 'video')::int AS videos
         FROM event_media
        WHERE "eventId" = ANY($1::int[]) AND status = 'ready' AND NOT "isHidden"
        GROUP BY "eventId"`,
      [eventIds]
    );

    const mine = studentIds.length
      ? await pool.query(
        `SELECT m."eventId", COUNT(DISTINCT m.id)::int AS mine
           FROM event_media m
           JOIN media_tags t ON t."mediaId" = m.id
          WHERE m."eventId" = ANY($1::int[]) AND m.status = 'ready' AND NOT m."isHidden"
            AND t."studentId" = ANY($2::int[]) AND t.source IN ('face','manual','parent_confirmed')
          GROUP BY m."eventId"`,
        [eventIds, studentIds]
      )
      : { rows: [] };

    // 앨범 카드에 보여줄 썸네일 4장
    const previews = await pool.query(
      `SELECT "eventId", "driveFileId" FROM (
         SELECT "eventId", "driveFileId",
                ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "takenAt" DESC, id DESC) AS rn
           FROM event_media
          WHERE "eventId" = ANY($1::int[]) AND status = 'ready' AND NOT "isHidden" AND "driveFileId" IS NOT NULL
       ) ranked WHERE rn <= 4`,
      [eventIds]
    );

    const out = {};
    for (const id of eventIds) out[id] = { images: 0, videos: 0, mine: 0, previews: [] };
    for (const row of counts.rows) Object.assign(out[row.eventId], { images: row.images, videos: row.videos });
    for (const row of mine.rows) out[row.eventId].mine = row.mine;
    for (const row of previews.rows) out[row.eventId].previews.push(row.driveFileId);
    return out;
  }

  /** 재분석 대상 (사진 중 분석되지 않은 것) */
  static async listUnanalyzed(eventId, limit = 5) {
    const result = await pool.query(
      `SELECT * FROM event_media
        WHERE "eventId" = $1 AND status = 'ready' AND kind = 'image'
          AND "faceStatus" IN ('pending','failed','skipped')
        ORDER BY id ASC LIMIT $2`,
      [eventId, limit]
    );
    return result.rows;
  }

  /** 24시간 넘게 업로드 중인 행 정리 (FR-235) */
  static async cleanupStale(eventId) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await pool.query(
      `DELETE FROM event_media WHERE "eventId" = $1 AND status = 'uploading' AND "createdAt" < $2 RETURNING id`,
      [eventId, cutoff]
    );
    return result.rows.length;
  }

  static async listReadyIds(eventId) {
    const result = await pool.query(
      `SELECT id, "driveFileId", kind, "durationMs" FROM event_media
        WHERE "eventId" = $1 AND status = 'ready' AND "driveFileId" IS NOT NULL ORDER BY id`,
      [eventId]
    );
    return result.rows;
  }
}

export default EventMedia;
