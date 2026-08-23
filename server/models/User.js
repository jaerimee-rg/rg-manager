import pool from '../database.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

class User {
  static async getAll() {
    const result = await pool.query('SELECT id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent" FROM users ORDER BY id');
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query('SELECT id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent" FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getByUsername(username) {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getByCredentials(username, password) {
    // 사용자 조회
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    // 비밀번호 검증
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  static async create(data) {
    const { username, password, role = 'user' } = data;
    const createdAt = new Date().toISOString();

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, password, role, "createdAt")
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, "createdAt"`,
      [username, hashedPassword, role, createdAt]
    );

    return result.rows[0];
  }

  static async update(id, data) {
    const { username, password, role } = data;

    // 비밀번호가 제공된 경우에만 비밀번호 업데이트
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const result = await pool.query(
        `UPDATE users
         SET username = $1, password = $2, role = $3
         WHERE id = $4
         RETURNING id, username, role, "createdAt"`,
        [username, hashedPassword, role, id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // 비밀번호 변경 없이 다른 정보만 업데이트
      const result = await pool.query(
        `UPDATE users
         SET username = $1, role = $2
         WHERE id = $3
         RETURNING id, username, role, "createdAt"`,
        [username, role, id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    }
  }

  static async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  static async getByKakaoId(kakaoId) {
    const result = await pool.query('SELECT * FROM users WHERE "kakaoId" = $1', [kakaoId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async createWithKakao(data) {
    const {
      kakaoId,
      username,
      email,
      role = 'user',
      accessToken = null,
      refreshToken = null,
      tokenExpiresAt = null
    } = data;
    const createdAt = new Date().toISOString();
    // 카카오 사용자는 비밀번호 없이 생성 (랜덤 해시 저장)
    const randomPassword = await bcrypt.hash(Math.random().toString(36), SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, password, role, "createdAt", "kakaoId", email,
       "kakaoAccessToken", "kakaoRefreshToken", "kakaoTokenExpiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [username, randomPassword, role, createdAt, kakaoId, email, accessToken, refreshToken, tokenExpiresAt]
    );

    return result.rows[0];
  }

  static async updateKakaoInfo(id, data) {
    const { email } = data;
    const result = await pool.query(
      `UPDATE users SET email = $1 WHERE id = $2
       RETURNING id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [email, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async updateKakaoTokens(id, data) {
    const { email, accessToken, refreshToken, tokenExpiresAt } = data;
    const result = await pool.query(
      `UPDATE users
       SET email = COALESCE($1, email),
           "kakaoAccessToken" = $2,
           "kakaoRefreshToken" = $3,
           "kakaoTokenExpiresAt" = $4
       WHERE id = $5
       RETURNING id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [email, accessToken, refreshToken, tokenExpiresAt, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async getKakaoTokens(id) {
    const result = await pool.query(
      `SELECT "kakaoAccessToken", "kakaoRefreshToken", "kakaoTokenExpiresAt", "kakaoMessageConsent"
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async updateMessageConsent(id, consent) {
    const result = await pool.query(
      `UPDATE users SET "kakaoMessageConsent" = $1 WHERE id = $2
       RETURNING id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [consent, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async updateUsername(id, username) {
    const result = await pool.query(
      `UPDATE users SET username = $1 WHERE id = $2
       RETURNING id, username, role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [username, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async transferData(fromUserId, toUserId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 학생 데이터 이전
      const studentsResult = await client.query(
        `UPDATE students SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      // 수업 데이터 이전
      const classesResult = await client.query(
        `UPDATE classes SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      // 출석 데이터 이전
      const attendanceResult = await client.query(
        `UPDATE attendance SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      // 대회 데이터 이전
      const competitionsResult = await client.query(
        `UPDATE competitions SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      // 이벤트·학부모도 함께 옮긴다.
      // 남겨두면 학부모가 보던 일정이 사라지고 소속 없는 계정이 된다.
      const eventsResult = await client.query(
        `UPDATE events SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      const parentsResult = await client.query(
        `UPDATE parent_accounts SET "teacherId" = $1 WHERE "teacherId" = $2`,
        [toUserId, fromUserId]
      );

      // 초대 링크는 선생님당 1개(UNIQUE)라 받는 쪽에 이미 있으면 옮기지 않고 지운다.
      await client.query(
        `DELETE FROM parent_invites
          WHERE "userId" = $1 AND EXISTS (SELECT 1 FROM parent_invites WHERE "userId" = $2)`,
        [fromUserId, toUserId]
      );
      await client.query(
        `UPDATE parent_invites SET "userId" = $1 WHERE "userId" = $2`,
        [toUserId, fromUserId]
      );

      await client.query('COMMIT');

      return {
        message: '데이터 이전이 완료되었습니다.',
        transferred: {
          students: studentsResult.rowCount,
          classes: classesResult.rowCount,
          attendance: attendanceResult.rowCount,
          competitions: competitionsResult.rowCount,
          events: eventsResult.rowCount,
          parents: parentsResult.rowCount
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default User;
