import pool from '../database.js';

class KakaoMessageLog {
  static async create(data) {
    const { senderId, recipientId, messageType, messageContent, success, errorMessage } = data;
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO kakao_message_logs ("senderId", "recipientId", "messageType", "messageContent", success, "errorMessage", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [senderId, recipientId, messageType, messageContent, success, errorMessage || null, createdAt]
    );

    return result.rows[0];
  }

  static async getAll(limit = 100, offset = 0, messageType = null) {
    const params = [limit, offset];
    let where = '';

    if (messageType) {
      params.push(messageType);
      where = `WHERE kml."messageType" = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
        kml.*,
        sender.username as "senderName",
        recipient.username as "recipientName",
        recipient.email as "recipientEmail"
       FROM kakao_message_logs kml
       LEFT JOIN users sender ON kml."senderId" = sender.id
       LEFT JOIN users recipient ON kml."recipientId" = recipient.id
       ${where}
       ORDER BY kml."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    return result.rows;
  }

  static async getCount(messageType = null) {
    const result = messageType
      ? await pool.query('SELECT COUNT(*) FROM kakao_message_logs WHERE "messageType" = $1', [
          messageType
        ])
      : await pool.query('SELECT COUNT(*) FROM kakao_message_logs');
    return parseInt(result.rows[0].count);
  }

  static async getByRecipientId(recipientId) {
    const result = await pool.query(
      `SELECT * FROM kakao_message_logs WHERE "recipientId" = $1 ORDER BY "createdAt" DESC`,
      [recipientId]
    );
    return result.rows;
  }
}

export default KakaoMessageLog;
