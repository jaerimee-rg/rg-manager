import pool from '../database.js';
import { parentAwareDisplayNameSql } from '../utils/usernames.js';
import { FACE_ANALYZER_VERSION } from '../utils/faceVector.js';

/**
 * 얼굴을 (다시) 찾아야 하는 사진 — 아직 못 찾았거나(pending·failed·skipped), 예전 방식으로 찾은 것.
 * "얼굴 없음(none)" 도 예전 방식이면 다시 본다: 작은 얼굴을 놓친 결과일 수 있다.
 * 재분석 목록 · 통계 · 필터가 모두 이 조건을 쓴다. prefix 는 테이블 별칭('m.'). 행 하나에 쓰는 같은 조건은
 * utils/faceVector.js needsFaceAnalysis — 둘을 함께 고친다.
 */
export const needsFaceAnalysisSql = (prefix = '') => (
  `${prefix}kind = 'image' AND (${prefix}"faceStatus" IN ('pending','failed','skipped')`
  + ` OR COALESCE(${prefix}"faceAnalyzerVersion", 1) < ${Number(FACE_ANALYZER_VERSION)})`
);

/** 대표 사진이 될 수 있는 사진·영상 — 숨기지 않았고, 다 올라갔고, Drive 파일이 있다(학부모에게 보이는 것) */
const COVERABLE_SQL = (prefix = '') => `${prefix}status = 'ready' AND NOT ${prefix}"isHidden" AND ${prefix}"driveFileId" IS NOT NULL`;

/**
 * 앨범 카드 미리보기 — 앨범마다 숨기지 않은 준비된 사진 4장. 선생님이 고른 대표 사진들(events."albumCoverMediaIds", 최대 4장)이
 * 고른 순서대로 맨 앞에 오고 isCover 가 참이다(사진도 영상도 된다 — 영상은 Drive 가 만든 한 장면). 숨겼거나 지웠거나 다른 앨범의
 * 사진이면 조건에서 빠지고 남은 자리는 최근 순으로 채운다 — 대표 사진은 학부모에게 보이는 사진일 때만 쓴다(선생님 카드와 학부모 카드가 같은 표지).
 * 대표가 아닌 사진은 array_position 이 NULL 이라 NULLS LAST 로 뒤에 선다.
 */
const previewRows = async (eventIds) => (await pool.query(
  `SELECT "eventId", "driveFileId", "isCover" FROM (
     SELECT m."eventId", m."driveFileId", (m.id = ANY(e."albumCoverMediaIds")) IS TRUE AS "isCover",
            ROW_NUMBER() OVER (
              PARTITION BY m."eventId"
              ORDER BY array_position(e."albumCoverMediaIds", m.id) ASC NULLS LAST, m."takenAt" DESC, m.id DESC
            ) AS rn
       FROM event_media m
       JOIN events e ON e.id = m."eventId"
      WHERE m."eventId" = ANY($1::int[]) AND ${COVERABLE_SQL('m.')}
   ) ranked WHERE rn <= 4
   ORDER BY "eventId", rn`,
  [eventIds]
)).rows;

/** previewRows 를 요약(out[eventId])의 previews · covers(고른 순서) 에 싣는다 */
const addPreviews = (out, rows) => {
  for (const row of rows) {
    const summary = out[row.eventId];
    if (!summary) continue;
    summary.previews.push(row.driveFileId);
    if (row.isCover) summary.covers.push(row.driveFileId);
  }
};

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

  /**
   * 저장된 대표 사진 중 지금도 쓸 수 있는 것만, 저장된 순서 그대로 — 숨겼거나 지웠거나 다른 앨범의 것은 빠진다.
   * → [{ id, kind, driveFileId }]. 선생님 앨범 화면의 대표 사진 칸(썸네일·순서)이 이것을 쓴다.
   */
  static async coverRows(eventId, ids) {
    const wanted = (Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!wanted.length) return [];
    const result = await pool.query(
      `SELECT id, kind, "driveFileId" FROM event_media WHERE "eventId" = $1 AND id = ANY($2::int[]) AND ${COVERABLE_SQL()}`,
      [eventId, wanted]
    );
    const byId = new Map(result.rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }]));
    return wanted.filter((id, index) => byId.has(id) && wanted.indexOf(id) === index).map((id) => byId.get(id));
  }

  /** coverRows 의 id 만 — 대표 사진 고치기(albumController)가 이 목록을 "지금 대표 사진" 으로 본다 */
  static async coverableIds(eventId, ids) {
    return (await EventMedia.coverRows(eventId, ids)).map((row) => row.id);
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

  static async setFaceStatus(id, { faceStatus, faceCount = 0, faceError = null, analyzerVersion = null }, client = pool) {
    const now = new Date().toISOString();
    const result = await client.query(
      `UPDATE event_media
          SET "faceStatus" = $2, "faceCount" = $3, "faceError" = $4, "faceAnalyzedAt" = $5, "updatedAt" = $5,
              "faceAnalyzerVersion" = $6
        WHERE id = $1
        RETURNING *`,
      [id, faceStatus, faceCount, faceError, now, analyzerVersion]
    );
    return result.rows[0] || null;
  }

  /**
   * 얼굴을 지운 뒤 사진마다 얼굴 수를 다시 센다. 남은 얼굴이 없으면 'none'(얼굴 없음) —
   * 분석 버전("faceAnalyzerVersion")은 그대로 둬서 다시 분석할 목록(needsFaceAnalysisSql)에 들어가지 않게 한다.
   */
  static async refreshFaceCounts(ids, client = pool) {
    if (!ids?.length) return 0;
    const now = new Date().toISOString();
    const result = await client.query(
      `UPDATE event_media m
          SET "faceCount" = c.n,
              "faceStatus" = CASE WHEN c.n = 0 THEN 'none' ELSE m."faceStatus" END,
              "updatedAt" = $2
         FROM (SELECT x.id, COUNT(f.id)::int AS n
                 FROM event_media x
                 LEFT JOIN media_faces f ON f."mediaId" = x.id
                WHERE x.id = ANY($1::int[])
                GROUP BY x.id) c
        WHERE m.id = c.id`,
      [ids, now]
    );
    return result.rowCount;
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

  /** 설명을 바꾼다(null 이면 지운다). 이 이벤트의 사진이 아니면 null */
  static async setCaption(id, caption, eventId) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE event_media SET caption = $2, "updatedAt" = $3
        WHERE id = $1 AND "eventId" = $4
        RETURNING id, caption`,
      [id, caption, now, eventId]
    );
    return result.rows[0] || null;
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
   * mediaIds: 이 사진들만 — 얼굴 목록에서 한 사람을 골랐을 때(services/albumPeople.js 가 묶은 그 사람의 사진)
   */
  static async list(eventId, {
    filter = 'all', studentIds = null, uploaderUserId = null, mediaIds = null,
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
    if (filter === 'unanalyzed') where.push(needsFaceAnalysisSql('m.'));
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
    if (mediaIds) {
      params.push(mediaIds);
      where.push(`m.id = ANY($${params.length}::int[])`);
    }
    if (cursor?.takenAt && cursor?.id) {
      params.push(cursor.takenAt, cursor.id);
      where.push(`(m."takenAt", m.id) < ($${params.length - 1}, $${params.length})`);
    }

    params.push(Math.min(Number(limit) || 60, 200));

    const result = await pool.query(
      // 올린 사람 이름: 학부모면 본인이 정한 학부모명("예림엄마")이 먼저다 — username 은 카카오 식별자다
      `SELECT m.*, ${parentAwareDisplayNameSql('u', 'pa')} AS "uploaderName"
         FROM event_media m
         LEFT JOIN users u ON u.id = m."uploaderUserId"
         LEFT JOIN parent_accounts pa ON pa."userId" = m."uploaderUserId"
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
         COUNT(*) FILTER (WHERE status = 'ready' AND "uploaderRole" = 'parent')::int AS "fromParents",
         COUNT(*) FILTER (WHERE status = 'ready' AND "uploaderRole" = 'teacher')::int AS "fromTeacher",
         COUNT(*) FILTER (WHERE status = 'ready' AND ${needsFaceAnalysisSql()})::int AS unanalyzed,
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
      fromParents: row.fromParents || 0,
      fromTeacher: row.fromTeacher || 0,
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

    // 앨범 카드에 보여줄 썸네일 4장 — 대표 사진이 있으면 맨 앞
    const previews = await previewRows(eventIds);

    const out = {};
    for (const id of eventIds) out[id] = { images: 0, videos: 0, mine: 0, previews: [], covers: [] };
    for (const row of counts.rows) Object.assign(out[row.eventId], { images: row.images, videos: row.videos });
    for (const row of mine.rows) out[row.eventId].mine = row.mine;
    addPreviews(out, previews);
    return out;
  }

  /**
   * 선생님 사진 목록의 카드 요약 (docs/photo-menu 5.1).
   * 학부모용 summaries 와 달리 숨긴 수·학부모가 올린 수를 함께 센다. 썸네일은 숨기지 않은 것 4장(대표 사진이 맨 앞),
   * covers 는 쓸 수 있는 대표 사진들의 Drive 파일 id(고른 순서, 없으면 빈 목록).
   */
  static async summariesForTeacher(eventIds) {
    if (!eventIds?.length) return {};

    const counts = await pool.query(
      `SELECT "eventId",
              COUNT(*) FILTER (WHERE kind = 'image' AND NOT "isHidden")::int AS images,
              COUNT(*) FILTER (WHERE kind = 'video' AND NOT "isHidden")::int AS videos,
              COUNT(*) FILTER (WHERE "isHidden")::int AS hidden,
              COUNT(*) FILTER (WHERE "uploaderRole" = 'parent')::int AS "fromParents"
         FROM event_media
        WHERE "eventId" = ANY($1::int[]) AND status = 'ready'
        GROUP BY "eventId"`,
      [eventIds]
    );

    const previews = await previewRows(eventIds);

    const out = {};
    for (const id of eventIds) out[id] = { images: 0, videos: 0, hidden: 0, fromParents: 0, previews: [], covers: [] };
    for (const row of counts.rows) {
      Object.assign(out[row.eventId], { images: row.images, videos: row.videos, hidden: row.hidden, fromParents: row.fromParents });
    }
    addPreviews(out, previews);
    return out;
  }

  /**
   * 재분석 대상 (needsFaceAnalysisSql). afterId 보다 큰 id 만 — 브라우저는 받은 마지막 id 를 넘겨
   * 한 바퀴를 돈다. 실패한 사진은 대상에 그대로 남으므로 커서가 없으면 같은 사진을 끝없이 다시 받는다.
   */
  static async listUnanalyzed(eventId, limit = 5, afterId = 0) {
    const result = await pool.query(
      `SELECT * FROM event_media
        WHERE "eventId" = $1 AND status = 'ready' AND ${needsFaceAnalysisSql()}
          AND id > $3
        ORDER BY id ASC LIMIT $2`,
      [eventId, limit, afterId]
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

  /**
   * 앨범에 올라가 있는 파일의 원래 이름·크기 — 크기가 sizes 중 하나인 것만(같은 파일 건너뛰기용).
   * 숨긴 사진도 폴더에는 있으니 넣고, Drive 에서 사라진(missing)·올리다 만(uploading) 것은 뺀다.
   * size 는 BIGINT 라 문자열로 온다.
   */
  static async listReadyNamesBySize(eventId, sizes) {
    const wanted = [...new Set((sizes || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    if (!wanted.length) return [];
    const result = await pool.query(
      `SELECT "originalName", size FROM event_media
        WHERE "eventId" = $1 AND status = 'ready' AND size = ANY($2::bigint[])`,
      [eventId, wanted]
    );
    return result.rows;
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
