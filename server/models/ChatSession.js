import pool from '../database.js';

class ChatSession {
  static async getByVisitorKey(channelId, visitorKey) {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE "channelId" = $1 AND "visitorKey" = $2',
      [channelId, visitorKey]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 대화명 입력 시 세션 생성 또는 대화명 갱신 (FR-33)
  static async upsert(channelId, visitorKey, visitorName) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO chat_sessions ("channelId", "visitorKey", "visitorName", "createdAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("channelId", "visitorKey")
       DO UPDATE SET "visitorName" = EXCLUDED."visitorName"
       RETURNING *`,
      [channelId, visitorKey, visitorName, now]
    );
    return result.rows[0];
  }

  static async recordMessages(sessionId, { unanswered }) {
    const result = await pool.query(
      `UPDATE chat_sessions
       SET "messageCount" = "messageCount" + 2,
           "unansweredCount" = "unansweredCount" + $1,
           "lastMessageAt" = $2
       WHERE id = $3
       RETURNING *`,
      [unanswered ? 1 : 0, new Date().toISOString(), sessionId]
    );
    return result.rows[0];
  }

  // 관리자가 직접 답변하면 해당 대화는 처리된 것으로 본다
  static async recordAdminReply(sessionId) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE chat_sessions
       SET "messageCount" = "messageCount" + 1,
           "unansweredCount" = 0,
           "lastMessageAt" = $1,
           "lastAdminReplyAt" = $1
       WHERE id = $2
       RETURNING *`,
      [now, sessionId]
    );
    return result.rows[0];
  }

  // 관리자가 대화창을 열고 있는 동안 주기적으로 갱신한다 (닫으면 active=false 로 비운다)
  static async setAdminViewing(sessionId, active) {
    const result = await pool.query(
      `UPDATE chat_sessions
       SET "adminViewingAt" = $1
       WHERE id = $2
       RETURNING *`,
      [active ? new Date().toISOString() : null, sessionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 이 대화에서만 AI 자동 답변을 끄고 켠다
  static async setAiEnabled(sessionId, enabled) {
    const result = await pool.query(
      `UPDATE chat_sessions
       SET "aiEnabled" = $1
       WHERE id = $2
       RETURNING *`,
      [enabled !== false, sessionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 메시지를 지운 뒤 집계를 다시 계산한다 (빼기 방식은 어긋나면 복구되지 않는다).
  // 미답변은 "마지막 관리자 답변 이후의 미답변 봇 메시지" — recordAdminReply 와 같은 기준이다.
  static async recount(sessionId) {
    const result = await pool.query(
      `UPDATE chat_sessions s
       SET "messageCount" = c.total,
           "unansweredCount" = c.unanswered,
           "lastMessageAt" = c."lastMessageAt"
       FROM (
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE role = 'bot'
               AND answered IS FALSE
               AND id > COALESCE((
                 SELECT MAX(id) FROM chat_messages
                  WHERE "sessionId" = $1 AND role = 'admin'
               ), 0)
           )::int AS unanswered,
           MAX("createdAt") AS "lastMessageAt"
         FROM chat_messages
         WHERE "sessionId" = $1
       ) c
       WHERE s.id = $1
       RETURNING s.*`,
      [sessionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 새 문의 카카오 알림을 보낸 시각 (쿨다운 판정용)
  static async recordKakaoNotified(sessionId) {
    const result = await pool.query(
      `UPDATE chat_sessions
       SET "kakaoNotifiedAt" = $1
       WHERE id = $2
       RETURNING *`,
      [new Date().toISOString(), sessionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 오늘 이 채널에 들어온 학부모 질문 수 (일일 한도 확인용)
  static async countTodayQuestions(channelId) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM chat_messages m
       JOIN chat_sessions s ON s.id = m."sessionId"
       WHERE s."channelId" = $1 AND m.role = 'parent' AND m."createdAt" >= $2`,
      [channelId, startOfDay.toISOString()]
    );
    return result.rows[0].count;
  }

  static async listByChannel(channelId, options = {}) {
    const { unansweredOnly, startDate, endDate, limit = 20, offset = 0 } = options;
    const params = [channelId];
    const where = ['s."channelId" = $1'];

    if (unansweredOnly) where.push('s."unansweredCount" > 0');
    if (startDate) {
      params.push(startDate);
      where.push(`s."lastMessageAt" >= $${params.length}`);
    }
    if (endDate) {
      params.push(`${endDate}T23:59:59.999Z`);
      where.push(`s."lastMessageAt" <= $${params.length}`);
    }

    const whereSql = where.join(' AND ');

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM chat_sessions s WHERE ${whereSql}`,
      params
    );

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT s.*,
              (SELECT content FROM chat_messages m
                WHERE m."sessionId" = s.id AND m.role = 'parent'
                ORDER BY m.id DESC LIMIT 1) AS "lastMessage"
       FROM chat_sessions s
       WHERE ${whereSql}
       ORDER BY s."lastMessageAt" DESC NULLS LAST, s.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return { total: totalResult.rows[0].count, sessions: result.rows };
  }

  // 세션 + 소유자(userId) 를 함께 조회해 권한 확인에 사용
  static async getWithOwner(sessionId) {
    const result = await pool.query(
      `SELECT s.*, c."userId" AS "ownerUserId"
       FROM chat_sessions s
       JOIN chat_channels c ON c.id = s."channelId"
       WHERE s.id = $1`,
      [sessionId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async delete(sessionId) {
    const result = await pool.query('DELETE FROM chat_sessions WHERE id = $1 RETURNING id', [sessionId]);
    return result.rows.length > 0;
  }
}

export default ChatSession;
