import pool from '../database.js';

// FAQ 답변에 붙일 파일. 실제 바이트는 Supabase Storage 에 있고 여기에는 위치만 담는다.
class FaqFile {
  static async listByUserId(userId) {
    const result = await pool.query(
      `SELECT * FROM faq_files WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
      [userId]
    );
    return result.rows;
  }

  // 관리자 화면용. filterUserId 가 없으면 전체를 본다.
  static async listAll(filterUserId = null) {
    if (filterUserId) return FaqFile.listByUserId(filterUserId);

    const result = await pool.query(`SELECT * FROM faq_files ORDER BY "createdAt" DESC`);
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM faq_files WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async create({ userId, filename, storagePath, mimeType, kind, size, url }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO faq_files
         ("userId", filename, "storagePath", "mimeType", kind, size, url, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, filename, storagePath, mimeType, kind, size, url, now]
    );
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query('DELETE FROM faq_files WHERE id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}

export default FaqFile;
