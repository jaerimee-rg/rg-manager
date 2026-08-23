import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// PostgreSQL 연결 설정
// DATABASE_URL 환경 변수 필수
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// 데이터베이스 초기화
const initDatabase = async () => {
  const client = await pool.connect();

  try {
    // Students 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        birthdate TEXT NOT NULL,
        "classIds" TEXT,
        "createdAt" TEXT NOT NULL
      )
    `);

    // Classes 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        duration TEXT NOT NULL,
        instructor TEXT,
        "displayOrder" INTEGER DEFAULT 0,
        "createdAt" TEXT NOT NULL
      )
    `);

    // students 테이블에 phone, parentPhone 컬럼 추가
    await client.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS phone TEXT
    `);

    await client.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS "parentPhone" TEXT
    `);

    // displayOrder 컬럼이 없는 경우 추가 (기존 테이블 마이그레이션)
    await client.query(`
      ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER DEFAULT 0
    `);

    // userId 컬럼 추가 (멀티테넌시)
    await client.query(`
      ALTER TABLE students
      ADD COLUMN IF NOT EXISTS "userId" INTEGER
    `);

    await client.query(`
      ALTER TABLE classes
      ADD COLUMN IF NOT EXISTS "userId" INTEGER
    `);

    await client.query(`
      ALTER TABLE attendance
      ADD COLUMN IF NOT EXISTS "userId" INTEGER
    `);

    // Attendance 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        "studentId" INTEGER NOT NULL,
        "classId" INTEGER,
        date TEXT NOT NULL,
        "checkedAt" TEXT NOT NULL,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY ("classId") REFERENCES classes(id) ON DELETE CASCADE
      )
    `);

    // attendance 테이블에 UNIQUE 제약 추가
    try {
      await client.query(`
        ALTER TABLE attendance
        ADD CONSTRAINT attendance_unique UNIQUE ("studentId", "classId", date)
      `);
    } catch (e) {
      // constraint가 이미 존재하면 무시
    }

    // Users 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        "createdAt" TEXT NOT NULL
      )
    `);

    // Logs 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        "createdAt" TEXT NOT NULL
      )
    `);

    // Competitions 테이블 (대회)
    await client.query(`
      CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        location TEXT NOT NULL,
        "userId" INTEGER,
        "createdAt" TEXT NOT NULL
      )
    `);

    // Competition Students 테이블 (대회 참가 학생)
    await client.query(`
      CREATE TABLE IF NOT EXISTS competition_students (
        id SERIAL PRIMARY KEY,
        "competitionId" INTEGER NOT NULL,
        "studentId" INTEGER NOT NULL,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("competitionId") REFERENCES competitions(id) ON DELETE CASCADE,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE CASCADE
      )
    `);

    // competition_students 테이블에 UNIQUE constraint 추가 (기존 테이블 마이그레이션)
    try {
      await client.query(`
        ALTER TABLE competition_students
        ADD CONSTRAINT competition_students_unique UNIQUE ("competitionId", "studentId")
      `);
    } catch (e) {
      // constraint가 이미 존재하면 무시
    }

    // competition_students 테이블에 events 컬럼 추가 (종목 정보)
    await client.query(`
      ALTER TABLE competition_students
      ADD COLUMN IF NOT EXISTS events TEXT
    `);

    // competition_students 테이블에 award 컬럼 추가 (수상 기록)
    await client.query(`
      ALTER TABLE competition_students
      ADD COLUMN IF NOT EXISTS award TEXT
    `);

    // competition_students 테이블에 paid 컬럼 추가 (참가비 납부 여부)
    await client.query(`
      ALTER TABLE competition_students
      ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE
    `);

    // competition_students 테이블에 coachFeePaid 컬럼 추가 (출강비 납부 여부)
    await client.query(`
      ALTER TABLE competition_students
      ADD COLUMN IF NOT EXISTS "coachFeePaid" BOOLEAN DEFAULT FALSE
    `);

    // users 테이블에 카카오 로그인 관련 컬럼 추가
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "kakaoId" TEXT UNIQUE
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email TEXT
    `);

    // 카카오 메시지 알림 관련 컬럼 추가
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "kakaoAccessToken" TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "kakaoRefreshToken" TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "kakaoTokenExpiresAt" TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "kakaoMessageConsent" BOOLEAN DEFAULT FALSE
    `);

    // 카카오 메시지 로그 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS kakao_message_logs (
        id SERIAL PRIMARY KEY,
        "senderId" INTEGER NOT NULL,
        "recipientId" INTEGER NOT NULL,
        "messageType" TEXT NOT NULL,
        "messageContent" TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        "errorMessage" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("senderId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("recipientId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // FAQ 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        "displayOrder" INTEGER DEFAULT 0,
        "isPublished" BOOLEAN DEFAULT TRUE,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_faqs_user ON faqs ("userId", "isPublished")');

    // 학부모 질문 채팅 채널 (사용자당 1개)
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_channels (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        "publicId" TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        greeting TEXT,
        "fallbackMessage" TEXT,
        "isActive" BOOLEAN DEFAULT TRUE,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_channels_user ON chat_channels ("userId")');

    // 사용자당 채널은 1개 (동시 요청으로 중복 생성되는 것을 막는다)
    try {
      await client.query(`
        ALTER TABLE chat_channels
        ADD CONSTRAINT chat_channels_user_unique UNIQUE ("userId")
      `);
    } catch (e) {
      // constraint가 이미 존재하면 무시
    }

    // 학부모 단위 대화 세션
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        "channelId" INTEGER NOT NULL,
        "visitorKey" TEXT NOT NULL,
        "visitorName" TEXT NOT NULL,
        "messageCount" INTEGER DEFAULT 0,
        "unansweredCount" INTEGER DEFAULT 0,
        "lastMessageAt" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("channelId") REFERENCES chat_channels(id) ON DELETE CASCADE
      )
    `);

    try {
      await client.query(`
        ALTER TABLE chat_sessions
        ADD CONSTRAINT chat_sessions_unique UNIQUE ("channelId", "visitorKey")
      `);
    } catch (e) {
      // constraint가 이미 존재하면 무시
    }

    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_channel ON chat_sessions ("channelId", "lastMessageAt" DESC)');

    // 채팅 메시지
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        "sessionId" INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        answered BOOLEAN,
        "matchedFaqIds" TEXT,
        status TEXT DEFAULT 'ok',
        "inputTokens" INTEGER,
        "outputTokens" INTEGER,
        "latencyMs" INTEGER,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("sessionId") REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages ("sessionId", "createdAt")');

    // AI 자동 답변 on/off 및 접수 안내 문구
    await client.query(`
      ALTER TABLE chat_channels
      ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE chat_channels
      ADD COLUMN IF NOT EXISTS "pendingMessage" TEXT
    `);

    // 관리자 답변 시각 (대화 목록 정렬·표시용)
    await client.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS "lastAdminReplyAt" TEXT
    `);

    // 관리자가 이 대화를 열어둔 시각 — 열려 있는 동안 AI 자동 답변을 멈춘다
    await client.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS "adminViewingAt" TEXT
    `);

    // 새 문의 카카오 알림을 보낸 시각 (연속 질문에 중복 발송하지 않기 위해)
    await client.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS "kakaoNotifiedAt" TEXT
    `);

    // 답을 찾지 못했을 때 학부모에게 보여줄 추천 FAQ
    await client.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS "suggestedFaqIds" TEXT
    `);

    // 관리자가 보낸 답변을 수정한 시각 (수정됨 표시용)
    await client.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS "editedAt" TEXT
    `);

    // 이 대화에서만 AI 자동 답변을 끄는 설정 (채널 전체 설정과 별개)
    await client.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN DEFAULT TRUE
    `);

    // 새 문의가 들어왔을 때 카카오 알림 사용 여부
    await client.query(`
      ALTER TABLE chat_channels
      ADD COLUMN IF NOT EXISTS "kakaoNotify" BOOLEAN DEFAULT TRUE
    `);

    // 카카오 알림을 이벤트 단위로 켜고 끄는 전역 설정 (관리자 전용)
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        "eventType" TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        "updatedAt" TEXT NOT NULL,
        "updatedBy" INTEGER,
        FOREIGN KEY ("updatedBy") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 알 수 없는 이벤트가 조용히 막히지 않도록 기본값(켜짐)으로 미리 채워둔다.
    await client.query(
      `INSERT INTO notification_settings ("eventType", enabled, "updatedAt")
       VALUES ('ATTENDANCE', TRUE, $1), ('FAQ_INQUIRY', TRUE, $1), ('CUSTOM', TRUE, $1)
       ON CONFLICT ("eventType") DO NOTHING`,
      [new Date().toISOString()]
    );

    // 앱 전역 설정 (관리자 전용). 현재는 FAQ 자동 답변에 쓸 AI 제공자를 담는다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        "updatedBy" INTEGER,
        FOREIGN KEY ("updatedBy") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 설정한 적이 없을 때 기존 동작(Gemini)이 그대로 유지되도록 기본값을 채워둔다.
    await client.query(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES ('ai_provider', $1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [process.env.AI_PROVIDER || 'gemini', new Date().toISOString()]
    );

    // 기본 관리자 계정 생성 (최초 1회만, 기존 계정이 없을 때)
    const adminCheck = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
      const hashedAdminPassword = await bcrypt.hash(adminPassword, SALT_ROUNDS);
      await client.query(
        `INSERT INTO users (username, password, role, "createdAt")
         VALUES ($1, $2, $3, $4)`,
        ['admin', hashedAdminPassword, 'admin', new Date().toISOString()]
      );
      console.log('기본 관리자 계정 생성 완료. 즉시 비밀번호를 변경하세요.');
    }

    console.log('데이터베이스 초기화 완료');
  } catch (error) {
    console.error('데이터베이스 초기화 실패:', error);
    throw error;
  } finally {
    client.release();
  }
};

// 초기화 실행
initDatabase().catch(console.error);

export default pool;
