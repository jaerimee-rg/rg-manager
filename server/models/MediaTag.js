import pool from '../database.js';

/**
 * 미디어 ↔ 학생 태그. 미디어 × 학생 당 한 행이고, 출처에 우선순위가 있다.
 * 어떤 출처가 이기는지는 utils/faceMatch.js 가 정한다.
 */
class MediaTag {
  static async listByMedia(mediaId) {
    const result = await pool.query(
      'SELECT * FROM media_tags WHERE "mediaId" = $1 ORDER BY id',
      [mediaId]
    );
    return result.rows;
  }

  static async listByMediaIds(mediaIds) {
    if (!mediaIds?.length) return {};
    const result = await pool.query(
      'SELECT * FROM media_tags WHERE "mediaId" = ANY($1::int[]) ORDER BY id',
      [mediaIds]
    );
    const byMedia = {};
    for (const row of result.rows) {
      if (!byMedia[row.mediaId]) byMedia[row.mediaId] = [];
      byMedia[row.mediaId].push(row);
    }
    return byMedia;
  }

  /** 태그 하나를 넣거나 갱신한다. */
  static async upsert({ mediaId, studentId, source, distance = null, faceId = null, createdByUserId = null }, client = pool) {
    const now = new Date().toISOString();
    const result = await client.query(
      `INSERT INTO media_tags ("mediaId", "studentId", source, distance, "faceId", "createdByUserId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT ("mediaId", "studentId") DO UPDATE
         SET source = EXCLUDED.source,
             distance = EXCLUDED.distance,
             "faceId" = EXCLUDED."faceId",
             "createdByUserId" = COALESCE(EXCLUDED."createdByUserId", media_tags."createdByUserId"),
             "updatedAt" = EXCLUDED."updatedAt"
       RETURNING *`,
      [mediaId, studentId, source, distance, faceId, createdByUserId, now]
    );
    return result.rows[0];
  }

  static async removeStudents(mediaId, studentIds, client = pool) {
    if (!studentIds?.length) return 0;
    const result = await client.query(
      'DELETE FROM media_tags WHERE "mediaId" = $1 AND "studentId" = ANY($2::int[])',
      [mediaId, studentIds]
    );
    return result.rowCount;
  }

  /**
   * 기준 얼굴이 사라진 학생의 자동 태그를 지운다 (FR-263).
   * 사람이 정한 태그(manual/parent_confirmed/excluded)는 남긴다.
   */
  static async removeAutoTagsForStudent(studentId) {
    const result = await pool.query(
      `DELETE FROM media_tags WHERE "studentId" = $1 AND source IN ('face','candidate')`,
      [studentId]
    );
    return result.rowCount;
  }

  /** 이벤트 안에서 한 학생의 태그를 모두 (재매칭 계획을 세울 때) */
  static async listByEventAndStudents(eventId, studentIds) {
    if (!studentIds?.length) return [];
    const result = await pool.query(
      `SELECT t.* FROM media_tags t
         JOIN event_media m ON m.id = t."mediaId"
        WHERE m."eventId" = $1 AND t."studentId" = ANY($2::int[])`,
      [eventId, studentIds]
    );
    return result.rows;
  }

  /** 선생님 전체 앨범에서 한 학생의 태그 */
  static async listByTeacherAndStudent(teacherUserId, studentId) {
    const result = await pool.query(
      `SELECT t.* FROM media_tags t
         JOIN event_media m ON m.id = t."mediaId"
         JOIN events e ON e.id = m."eventId"
        WHERE e."userId" = $1 AND t."studentId" = $2`,
      [teacherUserId, studentId]
    );
    return result.rows;
  }
}

export default MediaTag;
