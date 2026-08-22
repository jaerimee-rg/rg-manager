import pool from '../database.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

class ChatMessage {
  static async create(sessionId, data) {
    const {
      role,
      content,
      answered = null,
      matchedFaqIds = null,
      status = 'ok',
      inputTokens = null,
      outputTokens = null,
      latencyMs = null
    } = data;

    const result = await pool.query(
      `INSERT INTO chat_messages
         ("sessionId", role, content, answered, "matchedFaqIds", status, "inputTokens", "outputTokens", "latencyMs", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        sessionId,
        role,
        content,
        answered,
        matchedFaqIds ? JSON.stringify(matchedFaqIds) : null,
        status,
        inputTokens,
        outputTokens,
        latencyMs,
        new Date().toISOString()
      ]
    );
    return result.rows[0];
  }

  static async listBySession(sessionId, limit = 100) {
    const result = await pool.query(
      `SELECT * FROM (
         SELECT * FROM chat_messages WHERE "sessionId" = $1 ORDER BY id DESC LIMIT $2
       ) t ORDER BY t.id ASC`,
      [sessionId, limit]
    );
    return result.rows.map((m) => ({ ...m, matchedFaqIds: safeJsonParse(m.matchedFaqIds, []) }));
  }

  // AI 에 넘길 최근 대화 맥락 (기본 6턴)
  static async recentHistory(sessionId, limit = 6) {
    const result = await pool.query(
      `SELECT role, content FROM (
         SELECT role, content, id FROM chat_messages WHERE "sessionId" = $1 ORDER BY id DESC LIMIT $2
       ) t ORDER BY t.id ASC`,
      [sessionId, limit]
    );
    return result.rows;
  }
}

export default ChatMessage;
