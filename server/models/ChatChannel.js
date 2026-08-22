import pool from '../database.js';
import { generatePublicId } from '../utils/publicId.js';

export const DEFAULT_GREETING =
  '안녕하세요! 궁금한 점을 남겨주시면 등록된 FAQ를 바탕으로 안내해 드립니다.';
export const DEFAULT_FALLBACK =
  '죄송합니다. 등록된 FAQ에서 관련 내용을 찾지 못했습니다. 자세한 내용은 담당 선생님께 문의해 주세요.';
export const DEFAULT_PENDING =
  '문의가 접수되었습니다. 선생님이 확인 후 답변드릴게요.';

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
    // 동시 요청이 각각 채널을 만들지 않도록 사용자당 1개로 고정한다
    const result = await pool.query(
      `INSERT INTO chat_channels
         ("userId", "publicId", name, greeting, "fallbackMessage", "pendingMessage", "isActive", "aiEnabled", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7, $7)
       ON CONFLICT ("userId") DO NOTHING
       RETURNING *`,
      [userId, generatePublicId(), name, DEFAULT_GREETING, DEFAULT_FALLBACK, DEFAULT_PENDING, now]
    );

    // 이미 다른 요청이 만들었다면 그 채널을 돌려준다
    return result.rows.length > 0 ? result.rows[0] : this.getByUserId(userId);
  }

  // 채널이 없으면 만들어서 돌려준다 (FR-20)
  static async getOrCreate(userId, username) {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;
    return this.create(userId, `${username || '리듬체조'} 문의`);
  }

  static async update(userId, data) {
    const { name, greeting, fallbackMessage, pendingMessage, isActive, aiEnabled } = data;
    const result = await pool.query(
      `UPDATE chat_channels
       SET name = $1, greeting = $2, "fallbackMessage" = $3, "pendingMessage" = $4,
           "isActive" = $5, "aiEnabled" = $6, "updatedAt" = $7
       WHERE "userId" = $8
       RETURNING *`,
      [
        name,
        greeting,
        fallbackMessage,
        pendingMessage,
        isActive !== false,
        aiEnabled !== false,
        new Date().toISOString(),
        userId
      ]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

export default ChatChannel;
