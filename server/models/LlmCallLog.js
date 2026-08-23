import pool from '../database.js';

// 프롬프트 원문은 FAQ 전체가 들어가 길다. 목록 조회에서는 빼고, 상세에서만 읽는다.
const LIST_COLUMNS = `
  l.id, l."createdAt", l."userId", l."visitorName", l."promptId", l.provider, l.model,
  l.status, l.answered, l."inputTokens", l."outputTokens", l."latencyMs", l."sessionId",
  u.username AS "instructorName"
`;

class LlmCallLog {
  static async create(entry) {
    const {
      userId = null,
      sessionId = null,
      visitorName = null,
      promptId = null,
      provider = null,
      model = null,
      status = null,
      answered = null,
      inputTokens = null,
      outputTokens = null,
      latencyMs = null,
      systemPrompt = null,
      userPrompt = null,
      response = null,
      errorMessage = null
    } = entry;

    const result = await pool.query(
      `INSERT INTO llm_call_logs
         ("userId", "sessionId", "visitorName", "promptId", provider, model, status, answered,
          "inputTokens", "outputTokens", "latencyMs", "systemPrompt", "userPrompt", response,
          "errorMessage", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        userId, sessionId, visitorName, promptId, provider, model, status, answered,
        inputTokens, outputTokens, latencyMs, systemPrompt, userPrompt, response,
        errorMessage, new Date().toISOString()
      ]
    );
    return result.rows[0];
  }

  static async list({ limit = 50, offset = 0, userId = null, status = null } = {}) {
    const where = [];
    const params = [];

    if (userId) {
      params.push(userId);
      where.push(`l."userId" = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`l.status = $${params.length}`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT ${LIST_COLUMNS}
       FROM llm_call_logs l
       LEFT JOIN users u ON u.id = l."userId"
       ${clause}
       ORDER BY l."createdAt" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return result.rows;
  }

  static async count({ userId = null, status = null } = {}) {
    const where = [];
    const params = [];

    if (userId) {
      params.push(userId);
      where.push(`"userId" = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(`SELECT COUNT(*) AS c FROM llm_call_logs ${clause}`, params);
    return parseInt(result.rows[0].c, 10);
  }

  // 상세는 프롬프트 원문까지 함께 준다.
  static async getById(id) {
    const result = await pool.query(
      `SELECT l.*, u.username AS "instructorName"
       FROM llm_call_logs l
       LEFT JOIN users u ON u.id = l."userId"
       WHERE l.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
}

export default LlmCallLog;
