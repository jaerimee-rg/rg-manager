import pool from '../database.js';
import { decodeDescriptor } from '../utils/faceVector.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

const hydrate = (row) => (row ? { ...row, box: safeJsonParse(row.box, {}) } : row);

/**
 * 사진에서 찾은 얼굴. 이미지는 저장하지 않고 특징값과 위치만 남긴다 (FR-255).
 */
class MediaFace {
  /** 한 사진의 얼굴을 통째로 갈아끼운다 (재분석하면 이전 결과는 버린다). */
  static async replaceForMedia(mediaId, faces, client = pool) {
    await client.query('DELETE FROM media_faces WHERE "mediaId" = $1', [mediaId]);
    if (!faces?.length) return [];

    const now = new Date().toISOString();
    const values = [];
    const params = [];
    faces.forEach((face, i) => {
      const base = i * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(mediaId, JSON.stringify(face.box || {}), face.score ?? 0, face.descriptor, now);
    });

    const result = await client.query(
      `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt")
       VALUES ${values.join(', ')} RETURNING *`,
      params
    );
    return result.rows.map(hydrate);
  }

  static async listByMedia(mediaId) {
    const result = await pool.query('SELECT * FROM media_faces WHERE "mediaId" = $1 ORDER BY id', [mediaId]);
    return result.rows.map(hydrate);
  }

  /** 매칭용 — 벡터를 Float32Array 로 풀어서 준다. */
  static async listVectorsByMedia(mediaId, client = pool) {
    const result = await client.query('SELECT id, descriptor FROM media_faces WHERE "mediaId" = $1', [mediaId]);
    return result.rows
      .map((row) => ({ id: row.id, descriptor: decodeDescriptor(row.descriptor) }))
      .filter((row) => row.descriptor);
  }

  /**
   * 선생님의 모든 앨범에서 얼굴 벡터를 모은다 (자녀 얼굴을 새로 등록했을 때).
   * 미디어 id 별로 묶어서 준다.
   */
  static async listVectorsByTeacher(teacherUserId, { eventId = null } = {}) {
    const params = [teacherUserId];
    let clause = 'e."userId" = $1';
    if (eventId) {
      params.push(eventId);
      clause += ` AND e.id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT f.id, f.descriptor, f."mediaId"
         FROM media_faces f
         JOIN event_media m ON m.id = f."mediaId" AND m.status = 'ready'
         JOIN events e ON e.id = m."eventId"
        WHERE ${clause}`,
      params
    );

    const byMedia = new Map();
    for (const row of result.rows) {
      const descriptor = decodeDescriptor(row.descriptor);
      if (!descriptor) continue;
      if (!byMedia.has(row.mediaId)) byMedia.set(row.mediaId, []);
      byMedia.get(row.mediaId).push({ id: row.id, descriptor });
    }
    return byMedia;
  }

  /** 사진마다 몇 개의 얼굴이 있는지 (선생님 화면 배지) */
  static async countsByMedia(mediaIds) {
    if (!mediaIds?.length) return {};
    const result = await pool.query(
      `SELECT "mediaId", COUNT(*)::int AS count FROM media_faces
        WHERE "mediaId" = ANY($1::int[]) GROUP BY "mediaId"`,
      [mediaIds]
    );
    return Object.fromEntries(result.rows.map((row) => [row.mediaId, row.count]));
  }

  static async listByMediaIds(mediaIds) {
    if (!mediaIds?.length) return {};
    const result = await pool.query(
      'SELECT id, "mediaId", box, score FROM media_faces WHERE "mediaId" = ANY($1::int[]) ORDER BY id',
      [mediaIds]
    );
    const byMedia = {};
    for (const row of result.rows) {
      if (!byMedia[row.mediaId]) byMedia[row.mediaId] = [];
      byMedia[row.mediaId].push({ id: row.id, box: safeJsonParse(row.box, {}), score: row.score });
    }
    return byMedia;
  }
}

export default MediaFace;
