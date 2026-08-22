import pool from '../database.js';
import { generatePublicId } from '../utils/publicId.js';

export const DEFAULT_GREETING =
  '안녕하세요! 궁금한 점을 남겨주시면 등록된 FAQ를 바탕으로 안내해 드립니다.';
export const DEFAULT_FALLBACK =
  '죄송합니다. 등록된 FAQ에서 관련 내용을 찾지 못했습니다. 자세한 내용은 담당 선생님께 문의해 주세요.';

class ChatChannel {
  static async getByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM chat_channels WHERE "userId" = $1 ORDER BY id ASC LIMIT 1',
      [userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getByPublicId(publicId) {
    const result = await pool.query('SELECT * FROM chat_channels WHERE "publicId" = $1', [publicId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM chat_channels WHERE id = $1', [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async create(userId, name) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO chat_channels ("userId", "publicId", name, greeting, "fallbackMessage", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6)
       RETURNING *`,
      [userId, generatePublicId(), name, DEFAULT_GREETING, DEFAULT_FALLBACK, now]
    );
    return result.rows[0];
  }

  // 채널이 없으면 만들어서 돌려준다 (FR-20)
  static async getOrCreate(userId, username) {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;
    return this.create(userId, `${username || '리듬체조'} 문의`);
  }

  static async update(userId, data) {
    const { name, greeting, fallbackMessage, isActive } = data;
    const result = await pool.query(
      `UPDATE chat_channels
       SET name = $1, greeting = $2, "fallbackMessage" = $3, "isActive" = $4, "updatedAt" = $5
       WHERE "userId" = $6
       RETURNING *`,
      [name, greeting, fallbackMessage, isActive !== false, new Date().toISOString(), userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export default ChatChannel;
