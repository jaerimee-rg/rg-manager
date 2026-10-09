import pool from '../database.js';

/**
 * 얼굴 목록에서 "이 얼굴 아님" 으로 뺀 사진 — 같은 사람으로 묶지 말아야 할 얼굴 쌍.
 * faceId = 뺀 사진의 얼굴, otherFaceId = 그때 그 사람으로 묶여 있던 얼굴. 묶는 쪽(utils/facePeople.js)은 방향 없이 쓴다.
 * 등록된 아이의 사진은 여기가 아니라 media_tags 'excluded' 로 뺀다(services/albumPeople.js).
 */
class FaceExclusion {
  /**
   * 이 앨범들의 얼굴에 걸린 쌍 — 뺀 얼굴(faceId)이 이 앨범들에 있는 것. 얼굴 목록을 묶을 때마다 읽는다.
   * 표가 아직 없으면(운영에 DDL 을 넣기 전 배포) 빈 목록 — 얼굴 목록이 통째로 깨지지 않게.
   */
  static async listForAlbums(eventIds) {
    if (!eventIds?.length) return [];
    try {
      const result = await pool.query(
        `SELECT x."faceId", x."otherFaceId"
           FROM face_exclusions x
           JOIN media_faces f ON f.id = x."faceId"
           JOIN event_media m ON m.id = f."mediaId"
          WHERE m."eventId" = ANY($1::int[])`,
        [eventIds]
      );
      return result.rows;
    } catch (error) {
      if (error?.code === '42P01') {
        console.error('face_exclusions 표가 없습니다 — 뺀 사진 없이 묶습니다:', error.message);
        return [];
      }
      throw error;
    }
  }

  /** 쌍을 넣는다 — 이미 있는 쌍은 그대로. pairs: [{ faceId, otherFaceId }] → 새로 넣은 수 */
  static async addPairs(pairs, createdByUserId = null, client = pool) {
    if (!pairs?.length) return 0;
    const now = new Date().toISOString();
    const result = await client.query(
      `INSERT INTO face_exclusions ("faceId", "otherFaceId", "createdByUserId", "createdAt")
       SELECT p."faceId", p."otherFaceId", $2, $3
         FROM jsonb_to_recordset($1::jsonb) AS p("faceId" int, "otherFaceId" int)
       ON CONFLICT ("faceId", "otherFaceId") DO NOTHING`,
      [JSON.stringify(pairs), createdByUserId, now]
    );
    return result.rowCount;
  }

  /** 뺀 얼굴들(faceIds)과 그 사람의 얼굴들(otherFaceIds) 사이의 쌍을 지운다 — [다시 넣기]. → 지운 수 */
  static async removePairs(faceIds, otherFaceIds, client = pool) {
    if (!faceIds?.length || !otherFaceIds?.length) return 0;
    const result = await client.query(
      `DELETE FROM face_exclusions WHERE "faceId" = ANY($1::int[]) AND "otherFaceId" = ANY($2::int[])`,
      [faceIds, otherFaceIds]
    );
    return result.rowCount;
  }
}

export default FaceExclusion;
