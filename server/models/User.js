import pool from '../database.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

class User {
  static async getAll() {
    const result = await pool.query('SELECT id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent" FROM users ORDER BY id');
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query('SELECT id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent" FROM users WHERE id = $1', [id]);
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
       RETURNING id, username, "displayName", role, "createdAt"`,
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
         RETURNING id, username, "displayName", role, "createdAt"`,
        [username, hashedPassword, role, id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // 비밀번호 변경 없이 다른 정보만 업데이트
      const result = await pool.query(
        `UPDATE users
         SET username = $1, role = $2
         WHERE id = $3
         RETURNING id, username, "displayName", role, "createdAt"`,
        [username, role, id]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    }
  }

  static async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  /**
   * 카카오 계정 + 역할로 한 행을 찾는다 (docs/accounts-roles FR-311).
   * 같은 카카오 계정이 역할마다 행을 가질 수 있으므로 역할 없이는 결정할 수 없다 —
   * 옛 호출이 남아 있으면 조용히 엉뚱한 행을 쓰게 되므로 일부러 던진다.
   */
  static async getByKakaoId(kakaoId, role) {
    if (!role) throw new Error('getByKakaoId: role is required');
    const result = await pool.query('SELECT * FROM users WHERE "kakaoId" = $1 AND role = $2', [kakaoId, role]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** 이 카카오 계정이 가진 모든 계정 (로그인할 행 선택·역할 전환에 쓴다) */
  static async listByKakaoId(kakaoId) {
    if (!kakaoId) return [];
    const result = await pool.query(
      'SELECT id, username, "displayName", role, "createdAt" FROM users WHERE "kakaoId" = $1 ORDER BY id',
      [kakaoId]
    );
    return result.rows;
  }

  static async createWithKakao(data) {
    const {
      kakaoId,
      username,
      email,
      role = 'user',
      // 사람에게 보이는 이름 (선택). username 은 식별자라 자동 이름일 수 있다.
      displayName = null,
      accessToken = null,
      refreshToken = null,
      tokenExpiresAt = null
    } = data;
    const createdAt = new Date().toISOString();
    // 카카오 사용자는 비밀번호 없이 생성 (랜덤 해시 저장)
    const randomPassword = await bcrypt.hash(Math.random().toString(36), SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (username, password, role, "createdAt", "kakaoId", email,
       "kakaoAccessToken", "kakaoRefreshToken", "kakaoTokenExpiresAt", "displayName")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [username, randomPassword, role, createdAt, kakaoId, email, accessToken, refreshToken, tokenExpiresAt, displayName || null]
    );

    return result.rows[0];
  }

  static async updateKakaoInfo(id, data) {
    const { email } = data;
    const result = await pool.query(
      `UPDATE users SET email = $1 WHERE id = $2
       RETURNING id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
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
       RETURNING id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
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
       RETURNING id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [consent, id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 사람에게 보이는 이름 (설정 → 이름 변경). username 과 달리 UNIQUE 가 아니라서
   * 같은 사람의 관리자·선생님 행이 같은 이름을 가질 수 있다.
   */
  static async updateDisplayName(id, displayName) {
    const result = await pool.query(
      `UPDATE users SET "displayName" = $1 WHERE id = $2
       RETURNING id, username, "displayName", role, "createdAt", email, "kakaoId", "kakaoMessageConsent"`,
      [displayName, id]
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

      /* 학부모 ↔ 선생님 연결과 자녀의 소속 선생님도 함께 옮긴다 (FR-363).
         받는 선생님에게 이미 같은 학부모 연결이 있으면 UNIQUE 에 걸리므로 먼저 지운다. */
      await client.query(
        `DELETE FROM parent_teachers pt
          WHERE pt."teacherId" = $1
            AND EXISTS (SELECT 1 FROM parent_teachers x
                         WHERE x."parentUserId" = pt."parentUserId" AND x."teacherId" = $2)`,
        [fromUserId, toUserId]
      );
      await client.query(
        `UPDATE parent_teachers SET "teacherId" = $1 WHERE "teacherId" = $2`,
        [toUserId, fromUserId]
      );
      await client.query(
        `UPDATE parent_children SET "teacherId" = $1 WHERE "teacherId" = $2`,
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
