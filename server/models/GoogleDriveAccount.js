import pool from '../database.js';

/**
 * 선생님 ↔ Google 계정. 토큰은 서버 밖으로 나가지 않는다.
 * 화면에 내려보낼 때는 반드시 presentable() 을 거친다.
 */
class GoogleDriveAccount {
  static async getByUserId(userId) {
    const result = await pool.query('SELECT * FROM google_drive_accounts WHERE "userId" = $1', [userId]);
    return result.rows[0] || null;
  }

  /** 연결(또는 재연결). 같은 선생님은 한 계정만 가진다. */
  static async upsert({ userId, googleSub, googleEmail, accessToken, refreshToken, tokenExpiresAt }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO google_drive_accounts
         ("userId", "googleSub", "googleEmail", "accessToken", "refreshToken", "tokenExpiresAt",
          status, "lastError", "connectedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'connected', NULL, $7, $7)
       ON CONFLICT ("userId") DO UPDATE
         SET "googleSub" = EXCLUDED."googleSub",
             "googleEmail" = EXCLUDED."googleEmail",
             "accessToken" = EXCLUDED."accessToken",
             -- 재동의에서 refresh token 을 안 줄 때가 있어 기존 값을 지키다.
             "refreshToken" = COALESCE(NULLIF(EXCLUDED."refreshToken", ''), google_drive_accounts."refreshToken"),
             "tokenExpiresAt" = EXCLUDED."tokenExpiresAt",
             status = 'connected',
             "lastError" = NULL,
             "updatedAt" = EXCLUDED."updatedAt"
       RETURNING *`,
      [userId, googleSub, googleEmail, accessToken, refreshToken || '', tokenExpiresAt, now]
    );
    return result.rows[0];
  }

  /** 토큰 갱신 결과 저장 */
  static async updateTokens(userId, { accessToken, tokenExpiresAt }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE google_drive_accounts
          SET "accessToken" = $2, "tokenExpiresAt" = $3, status = 'connected', "lastError" = NULL, "updatedAt" = $4
        WHERE "userId" = $1
        RETURNING *`,
      [userId, accessToken, tokenExpiresAt, now]
    );
    return result.rows[0] || null;
  }

  /** 권한 철회 등으로 더는 쓸 수 없는 상태 */
  static async markError(userId, message) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE google_drive_accounts
          SET status = 'error', "lastError" = $2, "updatedAt" = $3
        WHERE "userId" = $1
        RETURNING *`,
      [userId, String(message || '').slice(0, 300), now]
    );
    return result.rows[0] || null;
  }

  static async setRootFolder(userId, { rootFolderId, rootFolderName }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE google_drive_accounts
          SET "rootFolderId" = COALESCE($2, "rootFolderId"),
              "rootFolderName" = COALESCE($3, "rootFolderName"),
              "updatedAt" = $4
        WHERE "userId" = $1
        RETURNING *`,
      [userId, rootFolderId ?? null, rootFolderName ?? null, now]
    );
    return result.rows[0] || null;
  }

  static async delete(userId) {
    const result = await pool.query('DELETE FROM google_drive_accounts WHERE "userId" = $1 RETURNING id', [userId]);
    return result.rows.length > 0;
  }

  /** 화면에 내려보낼 수 있는 형태 — 토큰은 절대 포함하지 않는다. */
  static presentable(account) {
    if (!account) return { connected: false };
    return {
      connected: true,
      email: account.googleEmail,
      rootFolderName: account.rootFolderName,
      rootFolderId: account.rootFolderId || null,
      status: account.status,
      lastError: account.status === 'error' ? account.lastError : null,
      connectedAt: account.connectedAt
    };
  }
}

export default GoogleDriveAccount;
