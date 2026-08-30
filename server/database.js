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

    // userId 컬럼 추가 (멀티테넌시).
    // 반드시 CREATE TABLE 뒤에 와야 한다 — 빈 DB 에서는 앞서 실행하면 초기화가 멈춘다.
    await client.query(`
      ALTER TABLE attendance
      ADD COLUMN IF NOT EXISTS "userId" INTEGER
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

    /* 한 카카오 계정이 역할마다 계정을 하나씩 가질 수 있게 한다
       (docs/accounts-roles FR-310). 순서가 중요하다 — 복합 인덱스를 먼저 만들어
       단일 UNIQUE 를 지우는 사이에도 중복이 끼어들지 못하게 한다.
       부분 인덱스라 비밀번호 전용 계정(kakaoId NULL)에는 영향이 없다. */
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_role
      ON users ("kakaoId", role)
      WHERE "kakaoId" IS NOT NULL
    `);

    await client.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_kakaoId_key"');

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

    // 이 대화에 마지막으로 카카오 알림을 보낸 시각 (발송 여부 추적용)
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

    // FAQ 답변에 붙이는 파일. 바이트는 Supabase Storage 에 있고 여기엔 위치만 담는다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS faq_files (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        filename TEXT NOT NULL,
        "storagePath" TEXT NOT NULL UNIQUE,
        "mimeType" TEXT NOT NULL,
        kind TEXT NOT NULL,
        size INTEGER NOT NULL,
        url TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_faq_files_user ON faq_files ("userId", "createdAt" DESC)'
    );

    // AI 호출 이력. 어떤 프롬프트로 무엇을 물었고 무엇이 돌아왔는지 남긴다.
    // 프롬프트 원문은 FAQ 전체를 담아 길어지므로 목록 조회에서는 읽지 않는다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS llm_call_logs (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER,
        "sessionId" INTEGER,
        "visitorName" TEXT,
        "promptId" TEXT,
        provider TEXT,
        model TEXT,
        status TEXT,
        answered BOOLEAN,
        "inputTokens" INTEGER,
        "outputTokens" INTEGER,
        "latencyMs" INTEGER,
        "systemPrompt" TEXT,
        "userPrompt" TEXT,
        response TEXT,
        "errorMessage" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_llm_logs_created ON llm_call_logs ("createdAt" DESC)'
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

    /* ───────── 학부모 포털 ─────────
       모두 신규 테이블이다. 기존 테이블의 컬럼은 바꾸지 않는다.
       FK 방향도 신규 → 기존 이므로 기존 쓰기 경로에 제약이 붙지 않는다. */

    // 선생님별 학부모 초대 링크 (선생님당 1개, 재발급 가능)
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_invites (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        "expiresAt" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 학부모 계정 ↔ 초대한 선생님
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_accounts (
        "userId" INTEGER PRIMARY KEY,
        "teacherId" INTEGER NOT NULL,
        "inviteId" INTEGER,
        "displayName" TEXT,
        "lastLoginAt" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("teacherId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("inviteId") REFERENCES parent_invites(id) ON DELETE SET NULL
      )
    `);

    /* 학부모가 스스로 정한 표시 이름 ("예림엄마"). users.username 은 UNIQUE 라
       "지우엄마" 가 둘이면 한 명이 "지우엄마_2" 가 되므로 별명은 여기에 따로 담는다.
       users.username 은 카카오 닉네임(식별용)으로 그대로 둔다. */
    await client.query(`
      ALTER TABLE parent_accounts
      ADD COLUMN IF NOT EXISTS "displayName" TEXT
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_parent_accounts_teacher ON parent_accounts ("teacherId")');

    /* 학부모 ↔ 선생님 다대다 (docs/accounts-roles FR-350).
       parent_accounts 는 학부모 "프로필" 로 남고, 실제 소속은 여기서 읽는다.
       parent_accounts."teacherId" 는 대표 선생님으로 계속 채워 두어(FR-351)
       배포 중간 상태의 옛 코드가 깨지지 않게 한다. */
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_teachers (
        id SERIAL PRIMARY KEY,
        "parentUserId" INTEGER NOT NULL,
        "teacherId" INTEGER NOT NULL,
        "inviteId" INTEGER,
        "createdAt" TEXT NOT NULL,
        UNIQUE ("parentUserId", "teacherId"),
        FOREIGN KEY ("parentUserId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("teacherId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("inviteId") REFERENCES parent_invites(id) ON DELETE SET NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_parent_teachers_teacher ON parent_teachers ("teacherId")');

    // 기존 단일 소속을 다대다로 옮긴다 (멱등 — 이미 있으면 건너뛴다)
    await client.query(`
      INSERT INTO parent_teachers ("parentUserId", "teacherId", "inviteId", "createdAt")
      SELECT a."userId", a."teacherId", a."inviteId", a."createdAt"
        FROM parent_accounts a
       WHERE a."teacherId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM parent_teachers t
            WHERE t."parentUserId" = a."userId" AND t."teacherId" = a."teacherId")
    `);

    // 학부모가 입력한 아이. studentId 가 있으면 선생님 학생과 연결된 상태
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_children (
        id SERIAL PRIMARY KEY,
        "parentUserId" INTEGER NOT NULL,
        "studentId" INTEGER,
        "childName" TEXT NOT NULL,
        "childBirthdate" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        "linkedAt" TEXT,
        "linkedBy" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("parentUserId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE SET NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_parent_children_parent ON parent_children ("parentUserId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_parent_children_student ON parent_children ("studentId")');

    // 같은 학부모가 같은 학생을 두 번 연결하지 못하게 (studentId NULL 은 중복 허용)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_children_unique
      ON parent_children ("parentUserId", "studentId")
      WHERE "studentId" IS NOT NULL
    `);

    /* 자녀는 선생님 1명의 학생에 대응한다 (docs/accounts-roles FR-354).
       학부모가 여러 선생님과 연결되면 parent_accounts 조인으로는 어느 선생님인지
       결정할 수 없으므로 명시 컬럼을 둔다. 연결 전(pending)에도 필요하다.
       FK 는 붙이지 않는다 — ADD CONSTRAINT 가 멱등이 아니라 재실행에서 실패한다. */
    await client.query('ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS "teacherId" INTEGER');
    await client.query('CREATE INDEX IF NOT EXISTS idx_parent_children_teacher ON parent_children ("teacherId")');

    // 연결된 학생의 소유 선생님 → 없으면 학부모의 대표 선생님으로 채운다 (멱등)
    await client.query(`
      UPDATE parent_children c
         SET "teacherId" = COALESCE(
               (SELECT s."userId" FROM students s WHERE s.id = c."studentId"),
               (SELECT a."teacherId" FROM parent_accounts a WHERE a."userId" = c."parentUserId"))
       WHERE c."teacherId" IS NULL
    `);

    /* 선생님 초대 (관리자 발급, 일회용) — docs/accounts-roles FR-340.
       학부모 초대(parent_invites)와 달리 재사용되지 않고 회수할 수 있다.
       상태(대기/사용/만료/회수)는 컬럼이 아니라 usedAt·revokedAt·expiresAt 에서 파생한다. */
    await client.query(`
      CREATE TABLE IF NOT EXISTS teacher_invites (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        "createdBy" INTEGER NOT NULL,
        label TEXT,
        "expiresAt" TEXT,
        "usedByUserId" INTEGER,
        "usedAt" TEXT,
        "revokedAt" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("createdBy") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("usedByUserId") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_teacher_invites_creator ON teacher_invites ("createdBy")');

    // 일정의 단일 출처. 대회형(type='competition')은 competitions 행과 1:1
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        "endDate" TEXT,
        "startTime" TEXT,
        location TEXT,
        description TEXT,
        options TEXT NOT NULL DEFAULT '[]',
        "requireOption" BOOLEAN DEFAULT FALSE,
        "isPublished" BOOLEAN DEFAULT TRUE,
        "registrationOpen" BOOLEAN DEFAULT TRUE,
        "registrationDeadline" TEXT,
        "competitionId" INTEGER UNIQUE,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("competitionId") REFERENCES competitions(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_events_user_date ON events ("userId", date)');

    // 학부모 신청 (자녀 1명 = 이벤트당 1행, 취소는 status 로 남긴다)
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id SERIAL PRIMARY KEY,
        "eventId" INTEGER NOT NULL,
        "studentId" INTEGER NOT NULL,
        "parentUserId" INTEGER,
        "optionIds" TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'registered',
        "confirmedAt" TEXT,
        "cancelledAt" TEXT,
        "cancelledAfterConfirm" BOOLEAN DEFAULT FALSE,
        "createdBy" TEXT NOT NULL DEFAULT 'parent',
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        UNIQUE ("eventId", "studentId"),
        FOREIGN KEY ("eventId") REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY ("parentUserId") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations ("eventId", status)');

    // ───────── 대회 사진·영상 앨범 (docs/photo-sharing) ─────────

    // 선생님 ↔ Google 계정. 토큰을 users 에 컬럼으로 붙이지 않는 이유는
    // 연결 해제가 행 삭제로 끝나고, 학부모 users 행에 빈 컬럼이 생기지 않게 하기 위함이다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS google_drive_accounts (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL UNIQUE,
        "googleSub" TEXT NOT NULL,
        "googleEmail" TEXT NOT NULL,
        "accessToken" TEXT NOT NULL,
        "refreshToken" TEXT NOT NULL,
        "tokenExpiresAt" TEXT NOT NULL,
        "rootFolderId" TEXT,
        "rootFolderName" TEXT NOT NULL DEFAULT 'RG Manager',
        status TEXT NOT NULL DEFAULT 'connected',
        "lastError" TEXT,
        "connectedAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 이벤트에 앨범 폴더를 붙인다 (대회·스페셜만 쓰고 휴관일은 쓰지 않는다).
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT');
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveFolderName" TEXT');
    // 어느 Google 연결로 만든 폴더인지 기억해 둔다. 선생님이 계정을 바꾸면 이전 앨범은 조회만 된다.
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveAccountId" INTEGER');
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumUploadOpen" BOOLEAN NOT NULL DEFAULT TRUE');
    // none | ready | missing(폴더가 Drive 에서 사라짐) | unshared(링크 공유가 꺼짐)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumStatus" TEXT NOT NULL DEFAULT 'none'`);
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumCreatedAt" TEXT');
    await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumCheckedAt" TEXT');

    // 사진·영상 1개. 바이트는 Drive 에 있고 여기에는 파일 id 와 메타만 둔다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_media (
        id SERIAL PRIMARY KEY,
        "eventId" INTEGER NOT NULL,
        "driveFileId" TEXT UNIQUE,
        kind TEXT NOT NULL,
        "originalName" TEXT NOT NULL,
        "driveName" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        size BIGINT NOT NULL DEFAULT 0,
        width INTEGER,
        height INTEGER,
        "durationMs" INTEGER,
        "takenAt" TEXT NOT NULL,
        "uploaderUserId" INTEGER,
        "uploaderRole" TEXT NOT NULL,
        "uploaderStudentId" INTEGER,
        status TEXT NOT NULL DEFAULT 'uploading',
        "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
        "faceStatus" TEXT NOT NULL DEFAULT 'pending',
        "faceCount" INTEGER NOT NULL DEFAULT 0,
        "faceAnalyzedAt" TEXT,
        "faceError" TEXT,
        "uploadSessionUri" TEXT,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        FOREIGN KEY ("eventId") REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY ("uploaderUserId") REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY ("uploaderStudentId") REFERENCES students(id) ON DELETE SET NULL
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_event_media_gallery
      ON event_media ("eventId", status, "isHidden", "takenAt" DESC, id DESC)`);
    await client.query('CREATE INDEX IF NOT EXISTS idx_event_media_uploader ON event_media ("uploaderUserId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_event_media_face ON event_media ("eventId", "faceStatus")');

    // 사진에서 찾은 얼굴. 이미지는 저장하지 않고 특징값(128차원)과 위치만 남긴다.
    // descriptor 는 base64(Float32Array) — pgvector 는 운영 DB 계정 권한으로 설치할 수 없어
    // 거리 계산은 순수 JS 로 한다 (docs/photo-sharing/03-implementation-plan.md C-1).
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_faces (
        id SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL,
        box TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        descriptor TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("mediaId") REFERENCES event_media(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_media_faces_media ON media_faces ("mediaId")');

    // 학부모가 등록한 자녀 기준 얼굴. 학생 단위로 모으고, 올린 학부모를 기억한다.
    await client.query(`
      CREATE TABLE IF NOT EXISTS child_face_profiles (
        id SERIAL PRIMARY KEY,
        "studentId" INTEGER NOT NULL,
        "teacherUserId" INTEGER NOT NULL,
        "parentUserId" INTEGER,
        "createdBy" TEXT NOT NULL DEFAULT 'parent',
        "storagePath" TEXT,
        descriptor TEXT NOT NULL,
        "consentAt" TEXT,
        "createdAt" TEXT NOT NULL,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY ("teacherUserId") REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY ("parentUserId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_child_face_student ON child_face_profiles ("studentId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_child_face_teacher ON child_face_profiles ("teacherUserId")');

    // 미디어 ↔ 학생. 자동(face)·후보(candidate)·수동(manual)·학부모 확인(parent_confirmed)·제외(excluded)
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_tags (
        id SERIAL PRIMARY KEY,
        "mediaId" INTEGER NOT NULL,
        "studentId" INTEGER NOT NULL,
        source TEXT NOT NULL,
        distance REAL,
        "faceId" INTEGER,
        "createdByUserId" INTEGER,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL,
        UNIQUE ("mediaId", "studentId"),
        FOREIGN KEY ("mediaId") REFERENCES event_media(id) ON DELETE CASCADE,
        FOREIGN KEY ("studentId") REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY ("faceId") REFERENCES media_faces(id) ON DELETE SET NULL,
        FOREIGN KEY ("createdByUserId") REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_media_tags_student ON media_tags ("studentId", source)');

    // 설정한 적이 없을 때 기존 동작(Gemini)이 그대로 유지되도록 기본값을 채워둔다.
    await client.query(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES ('ai_provider', $1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [process.env.AI_PROVIDER || 'gemini', new Date().toISOString()]
    );

    // 얼굴 매칭 임계값. 관리자가 나중에 조정할 수 있도록 설정으로 둔다.
    await client.query(
      `INSERT INTO app_settings (key, value, "updatedAt")
       VALUES ('face_match_threshold', '0.50', $1), ('face_candidate_threshold', '0.60', $1)
       ON CONFLICT (key) DO NOTHING`,
      [new Date().toISOString()]
    );

    // 기존 대회를 학부모 일정(events)으로 옮긴다.
    // 매 부팅마다 실행되므로 이미 옮긴 대회는 건너뛴다(멱등).
    // 여기서 실패해도 나머지 초기화와 기존 기능은 계속돼야 한다.
    try {
      const { backfillCompetitionEvents } = await import('./services/competitionMirror.js');
      const moved = await backfillCompetitionEvents(client);
      if (moved > 0) console.log(`기존 대회 ${moved}건을 이벤트로 옮겼습니다.`);
    } catch (error) {
      console.error('대회→이벤트 백필 실패(무시하고 계속):', error?.message || error);
    }

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
