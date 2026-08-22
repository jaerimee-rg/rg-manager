import pool from '../database.js';

class Faq {
  // 관리자 본인 FAQ 전체 (공개/비공개 포함). admin 은 filterUserId 로 특정 사용자 조회 가능
  static async getAll(userId, role, options = {}) {
    const { q } = options;
    const params = [];
    let query = 'SELECT * FROM faqs';
    const where = [];

    if (role !== 'admin') {
      params.push(userId);
      where.push(`"userId" = $${params.length}`);
    } else if (options.filterUserId) {
      params.push(options.filterUserId);
      where.push(`"userId" = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(question ILIKE $${params.length} OR answer ILIKE $${params.length})`);
    }

    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY "displayOrder" ASC, id ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  // AI 답변 근거로 쓰이는 공개 FAQ만
  static async getPublishedByUserId(userId) {
    const result = await pool.query(
      'SELECT id, question, answer, "displayOrder" FROM faqs WHERE "userId" = $1 AND "isPublished" = TRUE ORDER BY "displayOrder" ASC, id ASC',
      [userId]
    );
    return result.rows;
  }

  static async countPublished(userId) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM faqs WHERE "userId" = $1 AND "isPublished" = TRUE',
      [userId]
    );
    return result.rows[0].count;
  }

  static async getById(id, userId, role) {
    let query = 'SELECT * FROM faqs WHERE id = $1';
    const params = [id];

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async create(data, userId) {
    const { question, answer, isPublished = true } = data;
    const now = new Date().toISOString();

    const orderResult = await pool.query(
      'SELECT COALESCE(MAX("displayOrder"), -1) + 1 AS next FROM faqs WHERE "userId" = $1',
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO faqs ("userId", question, answer, "displayOrder", "isPublished", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING *`,
      [userId, question, answer, orderResult.rows[0].next, isPublished !== false, now]
    );

    return result.rows[0];
  }

  static async update(id, data, userId, role) {
    const { question, answer, isPublished } = data;
    const params = [question, answer, isPublished !== false, new Date().toISOString(), id];
    let query = `UPDATE faqs
       SET question = $1, answer = $2, "isPublished" = $3, "updatedAt" = $4
       WHERE id = $5`;

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $${params.length}`;
    }

    query += ' RETURNING *';
    const result = await pool.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async delete(id, userId, role) {
    let query = 'DELETE FROM faqs WHERE id = $1';
    const params = [id];

    if (role !== 'admin') {
      params.push(userId);
      query += ` AND "userId" = $${params.length}`;
    }

    query += ' RETURNING id';
    const result = await pool.query(query, params);
    return result.rows.length > 0;
  }
}

export default Faq;
