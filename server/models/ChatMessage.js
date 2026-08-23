import pool from '../database.js';
import { safeJsonParse } from '../utils/safeJsonParse.js';

class ChatMessage {
  static async create(sessionId, data) {
    const {
      role,
      content,
      answered = null,
      matchedFaqIds = null,
      suggestedFaqIds = null,
      status = 'ok',
      inputTokens = null,
      outputTokens = null,
      latencyMs = null
    } = data;

    const result = await pool.query(
      `INSERT INTO chat_messages
         ("sessionId", role, content, answered, "matchedFaqIds", "suggestedFaqIds", status, "inputTokens", "outputTokens", "latencyMs", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        sessionId,
        role,
        content,
        answered,
        matchedFaqIds ? JSON.stringify(matchedFaqIds) : null,
        suggestedFaqIds ? JSON.stringify(suggestedFaqIds) : null,
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
    return result.rows.map((m) => ({
      ...m,
      matchedFaqIds: safeJsonParse(m.matchedFaqIds, []),
      suggestedFaqIds: safeJsonParse(m.suggestedFaqIds, [])
    }));
  }

  // 메시지 + 대화 소유자를 함께 조회해 삭제 권한 확인에 쓴다
  static async getWithOwner(messageId) {
    const result = await pool.query(
      `SELECT m.*, s."channelId", c."userId" AS "ownerUserId"
       FROM chat_messages m
       JOIN chat_sessions s ON s.id = m."sessionId"
       JOIN chat_channels c ON c.id = s."channelId"
       WHERE m.id = $1`,
      [messageId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // markAnswered: AI 답변을 사람이 고쳤다면 그 대화는 처리된 것으로 본다.
  static async updateContent(messageId, content, { markAnswered = false } = {}) {
    const result = await pool.query(
      `UPDATE chat_messages
       SET content = $1,
           "editedAt" = $2,
           answered = CASE WHEN $3 THEN TRUE ELSE answered END
       WHERE id = $4
       RETURNING *`,
      [content, new Date().toISOString(), markAnswered, messageId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async delete(messageId) {
    const result = await pool.query('DELETE FROM chat_messages WHERE id = $1 RETURNING id', [
      messageId
    ]);
    return result.rows.length > 0;
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
