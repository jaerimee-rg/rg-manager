import pool from '../database.js';
import { displayNameSql, parentAwareDisplayNameSql } from '../utils/usernames.js';

/**
 * 학부모가 앨범·사진을 본 기록 (album_views) — 선생님 화면의 본 횟수(사진 목록 카드 · 사진 칸 · 뷰어)와 관리자 사진 보기 로그.
 *
 * 같은 사람이 같은 것을 잠깐 사이에 여러 번 열어도 한 번으로 친다 — 앨범 열기는 30분, 사진은 10분.
 * 옆으로 넘겨 보다 되돌아온 것까지 세면 "몇 번 봤는지" 가 부풀고 관리자 로그가 읽히지 않는다.
 */
export const VIEW_DEDUPE_MS = { album: 30 * 60 * 1000, media: 10 * 60 * 1000 };

class AlbumView {
  /** 본 기록 하나 — 같은 사람·같은 대상이 창(VIEW_DEDUPE_MS) 안에 이미 있으면 남기지 않는다. → 남겼으면 true */
  static async record({ eventId, mediaId = null, userId, kind, now = new Date() }) {
    const since = new Date(now.getTime() - VIEW_DEDUPE_MS[kind]).toISOString();
    const result = await pool.query(
      `INSERT INTO album_views ("eventId", "mediaId", "userId", kind, "createdAt")
       SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (
          SELECT 1 FROM album_views
           WHERE "userId" = $3 AND "eventId" = $1 AND kind = $4
             AND "mediaId" IS NOT DISTINCT FROM $2 AND "createdAt" >= $6
        )
       RETURNING id`,
      [eventId, mediaId, userId, kind, now.toISOString(), since]
    );
    return result.rows.length > 0;
  }

  /**
   * 사진 목록 카드 오른쪽 아래의 본 횟수 — 앨범(폴더)마다 학부모가 연 횟수 · 사진을 크게 본 횟수
   * → { [eventId]: { albumOpens, mediaViews } } (기록 없는 앨범은 빠진다)
   */
  static async countsByEvent(eventIds) {
    if (!eventIds?.length) return {};
    const result = await pool.query(
      `SELECT "eventId",
              COUNT(*) FILTER (WHERE kind = 'album')::int AS "albumOpens",
              COUNT(*) FILTER (WHERE kind = 'media')::int AS "mediaViews"
         FROM album_views WHERE "eventId" = ANY($1::int[]) GROUP BY "eventId"`,
      [eventIds]
    );
    return Object.fromEntries(result.rows.map((row) => [
      row.eventId,
      { albumOpens: row.albumOpens || 0, mediaViews: row.mediaViews || 0 }
    ]));
  }

  /** 사진마다 크게 본 횟수 → { [mediaId]: n } (선생님 사진 칸 오른쪽 아래 · 뷰어) */
  static async viewsByMedia(mediaIds) {
    const ids = (mediaIds || []).map(Number).filter(Boolean);
    if (!ids.length) return {};
    const result = await pool.query(
      `SELECT "mediaId", COUNT(*)::int AS views
         FROM album_views WHERE kind = 'media' AND "mediaId" = ANY($1::int[]) GROUP BY "mediaId"`,
      [ids]
    );
    return Object.fromEntries(result.rows.map((row) => [row.mediaId, row.views]));
  }

  /**
   * 관리자 사진 보기 로그 — 최근 것부터. 누가(학부모명) · 어느 선생님의 어느 앨범 · 어떤 사진(지웠으면 null).
   * kind 로 거를 수 있다('album' | 'media').
   */
  static async adminLog({ limit = 50, offset = 0, kind = null } = {}) {
    const params = [limit, offset];
    let where = '';
    if (kind) {
      params.push(kind);
      where = `WHERE v.kind = $${params.length}`;
    }
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT v.id, v.kind, v."createdAt", v."eventId", v."mediaId",
                ${parentAwareDisplayNameSql('u', 'pa')} AS "viewerName",
                e.title AS "eventTitle", e.date AS "eventDate",
                ${displayNameSql('t')} AS "teacherName",
                m."driveFileId", m."originalName", m.kind AS "mediaKind"
           FROM album_views v
           JOIN users u ON u.id = v."userId"
           LEFT JOIN parent_accounts pa ON pa."userId" = u.id
           JOIN events e ON e.id = v."eventId"
           LEFT JOIN users t ON t.id = e."userId"
           LEFT JOIN event_media m ON m.id = v."mediaId"
           ${where}
          ORDER BY v."createdAt" DESC, v.id DESC
          LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM album_views v ${kind ? 'WHERE v.kind = $1' : ''}`, kind ? [kind] : [])
    ]);
    return { rows: rows.rows, total: total.rows[0]?.n || 0 };
  }
}

export default AlbumView;
