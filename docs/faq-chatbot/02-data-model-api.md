# 02. 데이터 모델 및 API 명세 — FAQ 챗봇

기존 코드 규약을 그대로 따른다.

- DB: PostgreSQL (`server/database.js`의 `pool`), 컬럼명은 camelCase + 큰따옴표
- 스키마 생성: `initDatabase()` 안에서 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- 모델: `server/models/*.js`의 static 메서드 클래스 (`getAll(userId, role)` 형태)
- 컨트롤러: `req.user.id` / `req.user.role` 기반 권한 처리, `filterUserId` 쿼리로 관리자 필터
- 라우트: `verifyToken` + `logAction('...')` 조합
- ESM (`"type": "module"`)

---

## 1. 테이블 설계

### 1.1 `faqs` — FAQ 항목

```sql
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
);

CREATE INDEX IF NOT EXISTS idx_faqs_user ON faqs ("userId", "isPublished");
```

| 컬럼 | 설명 |
|---|---|
| `userId` | 소유 관리자. 멀티테넌시 기준 |
| `question` | 질문 (≤200자, 서버에서 검증) |
| `answer` | 답변 (≤2000자) |
| `displayOrder` | 목록 정렬 순서 (기존 `classes.displayOrder`와 동일 개념) |
| `isPublished` | false면 AI 근거에서 제외 |

### 1.2 `chat_channels` — 사용자별 채팅창

```sql
CREATE TABLE IF NOT EXISTS chat_channels (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "publicId" TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  greeting TEXT,
  "fallbackMessage" TEXT,
  "pendingMessage" TEXT,
  "isActive" BOOLEAN DEFAULT TRUE,
  "aiEnabled" BOOLEAN DEFAULT TRUE,
  "kakaoNotify" BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_user ON chat_channels ("userId");
```

| 컬럼 | 설명 |
|---|---|
| `publicId` | 공개 링크 토큰. `crypto.randomBytes(16).toString('base64url')` (22자) |
| `name` | 채팅창 제목. 기본값 `"<username> 문의"` |
| `greeting` | 첫 인사말. 기본값 `"안녕하세요! 궁금한 점을 남겨주시면 등록된 FAQ를 바탕으로 안내해 드립니다."` |
| `fallbackMessage` | 답변 불가 시 안내 문구. 기본값은 FR-42 문구 |
| `isActive` | false면 링크 접속 시 "문의를 받고 있지 않습니다" |
| `aiEnabled` | false면 AI를 호출하지 않고 접수 안내만 남긴다(관리자가 직접 답변) |
| `pendingMessage` | AI가 답하지 않을 때(`aiEnabled=false` 또는 관리자 접속 중) 학부모에게 보여줄 접수 안내 문구 |
| `kakaoNotify` | true면 새 문의가 들어올 때 채널 주인에게 카카오톡 알림을 보낸다 |

> MVP에서는 사용자당 채널 1개(최초 진입 시 자동 생성). 스키마는 1:N을 허용하므로 이후 확장 가능.

### 1.3 `chat_sessions` — 학부모 단위 대화

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  "channelId" INTEGER NOT NULL,
  "visitorKey" TEXT NOT NULL,
  "visitorName" TEXT NOT NULL,
  "messageCount" INTEGER DEFAULT 0,
  "unansweredCount" INTEGER DEFAULT 0,
  "lastMessageAt" TEXT,
  "lastAdminReplyAt" TEXT,
  "adminViewingAt" TEXT,
  "kakaoNotifiedAt" TEXT,
  "aiEnabled" BOOLEAN DEFAULT TRUE,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("channelId") REFERENCES chat_channels(id) ON DELETE CASCADE
);

ALTER TABLE chat_sessions
  ADD CONSTRAINT chat_sessions_unique UNIQUE ("channelId", "visitorKey");

CREATE INDEX IF NOT EXISTS idx_chat_sessions_channel
  ON chat_sessions ("channelId", "lastMessageAt" DESC);
```

> `UNIQUE` 제약은 기존 `attendance_unique` / `competition_students_unique`와 동일하게 `try { ALTER ... } catch {}` 패턴으로 추가한다.

| 컬럼 | 설명 |
|---|---|
| `visitorKey` | 학부모 브라우저 `localStorage`의 UUID. 개인정보 아님 |
| `visitorName` | 학부모가 입장 시 입력한 대화명(**필수**, 1~20자) |
| `unansweredCount` | 안내 문구로 응답된 횟수. 미답변 필터에 사용 |
| `adminViewingAt` | 관리자가 이 대화창을 열어둔 마지막 시각. 45초 안이면 AI 자동 답변을 멈춘다 |
| `kakaoNotifiedAt` | 마지막 카카오 알림 발송 시각. 5분 쿨다운으로 연속 문의에 중복 발송을 막는다 |
| `aiEnabled` | 이 대화에서만 AI 자동 답변을 끈다. 채널 설정(`chat_channels.aiEnabled`)과 AND 로 판정 |

### 1.4 `chat_messages` — 메시지

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL,
  role TEXT NOT NULL,                 -- 'parent' | 'bot' | 'admin'
  content TEXT NOT NULL,
  answered BOOLEAN,                   -- role='bot'일 때만 의미. false = 미답변
  "matchedFaqIds" TEXT,               -- JSON 배열 문자열. 예: "[3,7]"
  status TEXT DEFAULT 'ok',           -- 'ok' | 'ai_error' | 'rate_limited' | 'no_faq' | 'ai_off'
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "latencyMs" INTEGER,
  "createdAt" TEXT NOT NULL,
  FOREIGN KEY ("sessionId") REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
  ON chat_messages ("sessionId", "createdAt");
```

- `matchedFaqIds`는 기존 `students.classIds` / `competition_students.events`와 동일하게 **JSON 문자열**로 저장하고, 조회 시 `server/utils/safeJsonParse.js`로 파싱한다.
- 토큰 사용량과 지연 시간을 남겨 비용·성능을 추적한다.

### 1.5 ER 다이어그램

```
users 1 ──── N faqs
  │
  └──── 1 chat_channels 1 ──── N chat_sessions 1 ──── N chat_messages
```

---

### 1.6 Supabase RLS·권한 (실제 적용됨)

기존 테이블과 동일한 구성을 그대로 따른다. 앱은 `rg_app` 롤로 접속한다.

```sql
-- 1) RLS 활성화 + 애플리케이션 롤 정책
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;           -- chat_* 테이블도 동일
CREATE POLICY rg_app_all ON faqs FOR ALL TO rg_app USING (true) WITH CHECK (true);

-- 2) 시퀀스 사용 권한
GRANT USAGE, SELECT ON SEQUENCE faqs_id_seq TO rg_app;

-- 3) 소유권 (중요) — 서버의 initDatabase()가 CREATE INDEX IF NOT EXISTS 등을
--    실행하려면 테이블 소유자여야 한다. 소유자가 postgres면 "must be owner of table"로
--    초기화가 중단되고 이후 구문(기본 관리자 계정 생성 등)이 실행되지 않는다.
ALTER TABLE faqs OWNER TO rg_app;
ALTER SEQUENCE faqs_id_seq OWNER TO rg_app;
```

> MCP/대시보드에서 테이블을 만들면 소유자가 `postgres`가 되므로 위 3번을 반드시 함께 적용한다.

## 2. 서버 파일 구성 (신규)

```
server/
├── models/
│   ├── Faq.js               # FAQ CRUD (userId/role 기반)
│   ├── ChatChannel.js       # 채널 조회/생성/수정, publicId 조회
│   ├── ChatSession.js       # 세션 upsert, 목록, 카운터 갱신
│   └── ChatMessage.js       # 메시지 저장/조회
├── controllers/
│   ├── faqController.js     # FAQ CRUD + 채널 설정
│   └── chatController.js    # 공개 채팅 + 관리자 대화 조회
├── routes/
│   ├── faqs.js              # /api/faqs  (인증 필요)
│   └── chat.js              # /api/chat  (공개 + 관리자 혼합)
└── utils/
    ├── aiAnswer.js          # 프롬프트 빌드 + Anthropic 호출 (03 문서 참조)
    └── publicId.js          # 랜덤 publicId 생성
```

`server/server.js` 등록:

```javascript
import faqRoutes from './routes/faqs.js';
import chatRoutes from './routes/chat.js';

// 공개 채팅 전용 레이트 리미터 (apiLimiter 보다 엄격)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/chat/public', chatLimiter);   // apiLimiter 보다 먼저 등록
app.use('/api/faqs', faqRoutes);
app.use('/api/chat', chatRoutes);
```

> 주의: 기존 `app.use('/api', apiLimiter)`(15분 200건)가 모든 API에 적용되므로, 공개 채팅 경로는 **더 엄격한 리미터를 먼저** 등록해야 한다.

---

## 3. API 명세

공통:

- Base: `/api` (프론트는 항상 상대 경로 사용)
- 인증 필요 엔드포인트: `Authorization: Bearer <JWT>` (기존 `fetchWithAuth` 사용)
- 에러 응답: `{ "error": "메시지" }` (기존 규약과 동일)

### 3.1 FAQ 관리 — `/api/faqs` (인증 필요)

| 메서드 | 경로 | 설명 | 로그 액션 |
|---|---|---|---|
| GET | `/api/faqs` | 내 FAQ 목록. `?filterUserId=`(admin 전용), `?q=`(검색어), `?includeUnpublished=true` | - |
| GET | `/api/faqs/:id` | FAQ 단건 | - |
| POST | `/api/faqs` | FAQ 생성 | `CREATE_FAQ` |
| PUT | `/api/faqs/:id` | FAQ 수정 | `UPDATE_FAQ` |
| DELETE | `/api/faqs/:id` | FAQ 삭제 | `DELETE_FAQ` |
| PUT | `/api/faqs/reorder` | 순서 일괄 변경 `{ orders: [{id, displayOrder}] }` (선택) | `REORDER_FAQ` |

**POST /api/faqs — 요청**

```json
{
  "question": "토요일 수업은 몇 시인가요?",
  "answer": "토요일 초등부 수업은 오전 10시부터 11시 30분까지입니다.",
  "isPublished": true
}
```

**응답 201**

```json
{
  "id": 12,
  "userId": 3,
  "question": "토요일 수업은 몇 시인가요?",
  "answer": "토요일 초등부 수업은 오전 10시부터 11시 30분까지입니다.",
  "displayOrder": 0,
  "isPublished": true,
  "createdAt": "2026-08-22T01:00:00.000Z",
  "updatedAt": "2026-08-22T01:00:00.000Z"
}
```

**검증 규칙 (400 반환)**

| 조건 | 메시지 |
|---|---|
| `question` 없음/공백 | `질문을 입력해주세요.` |
| `question` > 200자 | `질문은 200자 이내로 입력해주세요.` |
| `answer` 없음/공백 | `답변을 입력해주세요.` |
| `answer` > 2000자 | `답변은 2000자 이내로 입력해주세요.` |

### 3.2 채널 설정 — `/api/chat/channel` (인증 필요)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/chat/channel` | 내 채널 조회. 없으면 **자동 생성 후 반환** |
| PUT | `/api/chat/channel` | `{ name, greeting, fallbackMessage, pendingMessage, isActive, aiEnabled, kakaoNotify }` 수정 |
| PUT | `/api/chat/channel/ai` | `{ aiEnabled }` — 대화 내역 화면의 AI 자동 답변 토글 |
| POST | `/api/chat/sessions/:id/viewing` | `{ active }` — 관리자 접속 상태 갱신(20초 주기). 살아있는 동안 AI 답변 중지 |
| PUT | `/api/chat/sessions/:id/ai` | `{ aiEnabled }` — 이 대화에서만 AI 자동 답변 on/off |
| PATCH | `/api/chat/sessions/:id/messages/:messageId` | `{ message }` — 내 답변·AI 답변 수정. `editedAt` 기록 |
| DELETE | `/api/chat/sessions/:id/messages/:messageId` | 메시지 한 건 삭제. 삭제 후 메시지 수·미답변 수를 재계산 |

학부모 질문은 **수정할 수 없다** — 상대가 하지 않은 말이 상대 이름으로 남는다. 삭제만 허용한다.
AI 답변을 사람이 고치면 그 질문은 처리된 것으로 보아 `answered=true` 로 바꾸고 미답변 집계를 다시 계산한다.

AI 자동 답변은 세 단계로 꺼진다 — 채널 전체(`chat_channels.aiEnabled`), 대화별(`chat_sessions.aiEnabled`),
관리자 접속 중 자동 일시중지(`adminViewingAt`). 봇 메시지의 `status` 로 어느 이유였는지 구분한다:
`ai_off` / `session_ai_off` / `admin_viewing`.

### 카카오 알림 (관리자 전용, `/api/notifications`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/notifications/settings` | 이벤트별 알림 on/off 목록 |
| PUT | `/api/notifications/settings/:eventType` | `{ enabled }` — 해당 이벤트 알림 전역 on/off |
| GET | `/api/notifications/logs` | 발송 이력. `?eventType=` 로 유형 필터, `?limit=`(최대 200) `?offset=` |

이벤트: `ATTENDANCE`(출석 체크 알림), `FAQ_INQUIRY`(새 문의 알림), `CUSTOM`(관리자 직접 발송).
설정은 `notification_settings` 테이블에 저장하며, `utils/kakaoMessage.js` 의 각 발송 함수 진입점에서 확인한다.
설정 행이 없거나 조회에 실패하면 **켜짐으로 간주**해 알림이 조용히 끊기지 않도록 한다.
| POST | `/api/chat/channel/regenerate` | `publicId` 재발급 (선택 기능) |

**GET 응답 200**

```json
{
  "id": 1,
  "publicId": "K3jd82nfAsdk29fjLm3xQw",
  "name": "리듬체조 문의",
  "greeting": "안녕하세요! 궁금한 점을 남겨주시면 등록된 FAQ를 바탕으로 안내해 드립니다.",
  "fallbackMessage": "죄송합니다. 등록된 FAQ에서 관련 내용을 찾지 못했습니다. 자세한 내용은 담당 선생님께 문의해 주세요.",
  "isActive": true,
  "faqCount": 12
}
```

> 프론트는 `window.location.origin + '/chat/' + publicId` 로 전체 링크를 만든다(하드코딩 금지).

### 3.3 공개 채팅 — `/api/chat/public/*` (인증 불필요)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/chat/public/:publicId` | 채널 공개 정보 조회 |
| POST | `/api/chat/public/:publicId/session` | **대화명 등록 후 세션 시작** `{ visitorKey, visitorName }` (FR-33) |
| GET | `/api/chat/public/:publicId/messages?visitorKey=` | 이전 대화 복원 (최대 50건) |
| POST | `/api/chat/public/:publicId/messages` | 질문 전송 및 AI 답변 수신 |

**GET /api/chat/public/:publicId — 응답 200**

```json
{
  "name": "리듬체조 문의",
  "greeting": "안녕하세요! ...",
  "isActive": true,
  "suggestedQuestions": ["토요일 수업은 몇 시인가요?", "결석하면 보강이 되나요?"]
}
```

- **소유자 정보(`userId`, `username`)는 절대 반환하지 않는다.**
- 존재하지 않거나 `isActive = false` → `404 { "error": "채팅방을 찾을 수 없습니다." }`

**POST /api/chat/public/:publicId/messages — 요청**

```json
{
  "visitorKey": "8f14e45f-ea1a-4b2c-9c2d-3f1a2b3c4d5e",
  "message": "결석하면 보강이 되나요?"
}
```

> 대화명은 `POST .../session`에서 이미 등록되었으므로 메시지 전송 시에는 보내지 않는다. 세션이 없는 `visitorKey`로 메시지를 보내면 `400 { "error": "대화명을 먼저 입력해주세요." }`.

**응답 200 (답변 성공)**

```json
{
  "answered": true,
  "reply": "결석 시 같은 주 내 1회 보강이 가능합니다. 사전에 담당 선생님께 알려주세요.",
  "matchedFaqIds": [7],
  "messageId": 341,
  "createdAt": "2026-08-22T01:05:12.000Z"
}
```

**응답 200 (근거 없음 — FR-41/42)**

```json
{
  "answered": false,
  "reply": "죄송합니다. 등록된 FAQ에서 관련 내용을 찾지 못했습니다. 자세한 내용은 담당 선생님께 문의해 주세요.",
  "matchedFaqIds": [],
  "messageId": 342,
  "createdAt": "2026-08-22T01:06:03.000Z"
}
```

> AI 실패(FR-45)와 FAQ 0건(FR-46)도 **동일한 200 + `answered:false` 형태**로 응답한다. 학부모에게 오류 화면을 보이지 않기 위함이며, 구분은 서버의 `chat_messages.status`에만 기록한다.

**에러**

| 상태 | 조건 | 응답 |
|---|---|---|
| 400 | `message` 없음/공백/500자 초과, `visitorKey` 없음 | `{ "error": "..." }` |
| 404 | 잘못된 `publicId` 또는 비활성 채널 | `{ "error": "채팅방을 찾을 수 없습니다." }` |
| 429 | IP 리미트 초과 또는 채널 일일 한도 초과 | `{ "error": "오늘 문의가 많아 잠시 후 이용 가능합니다." }` |

### 3.4 관리자 대화 조회 — `/api/chat/*` (인증 필요)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/chat/sessions` | 세션 목록. `?unansweredOnly=true`, `?startDate=`, `?endDate=`, `?limit=20&offset=0`, `?filterUserId=`(admin) |
| GET | `/api/chat/sessions/:id/messages` | 세션 상세 메시지 (근거 FAQ 포함) |
| POST | `/api/chat/sessions/:id/reply` | **관리자 답변 전송** `{ message }` (≤500자) → `role='admin'` 메시지 생성, 미답변 0으로 초기화 |
| DELETE | `/api/chat/sessions/:id` | 세션 삭제 (메시지 CASCADE) |
| GET | `/api/chat/stats` | 요약 통계: 총 질문 수, 미답변 수, 최근 7일 추이 (선택) |

**GET /api/chat/sessions — 응답 200**

```json
{
  "total": 34,
  "sessions": [
    {
      "id": 5,
      "visitorName": "학부모",
      "messageCount": 4,
      "unansweredCount": 1,
      "lastMessage": "보강 되나요?",
      "lastMessageAt": "2026-08-21T10:22:31.000Z"
    }
  ]
}
```

**GET /api/chat/sessions/:id/messages — 응답 200**

```json
{
  "session": { "id": 5, "visitorName": "학부모", "createdAt": "..." },
  "messages": [
    { "id": 340, "role": "parent", "content": "보강 되나요?", "createdAt": "..." },
    {
      "id": 341,
      "role": "bot",
      "content": "결석 시 같은 주 내 1회 보강이 가능합니다.",
      "answered": true,
      "matchedFaqs": [{ "id": 7, "question": "결석하면 보강이 되나요?" }],
      "createdAt": "..."
    }
  ]
}
```

권한: 세션이 속한 채널의 `userId`가 `req.user.id`와 다르고 `role !== 'admin'`이면 `404`(존재 여부를 숨기기 위해 403 대신 404).

---

## 4. 프론트엔드 라우트 및 파일

### 4.1 신규 파일

```
client/src/
├── pages/
│   ├── Faq/
│   │   ├── FaqList.jsx          # /faq          FAQ 목록 + 링크 복사
│   │   ├── FaqForm.jsx          # /faq/new, /faq/edit
│   │   ├── FaqChats.jsx         # /faq/chats    대화 내역
│   │   └── ChannelSettings.jsx  # 채널 이름/인사말/안내문구 수정 (모달 또는 페이지)
│   ├── PublicChat.jsx           # /chat/:publicId  (공개)
│   └── admin/
│       └── AdminFaq.jsx         # /admin/faq
├── components/Faq/
│   ├── FaqItem.jsx
│   ├── ChatMessageList.jsx
│   └── ChatComposer.jsx
└── utils/
    └── copyToClipboard.js       # clipboard API + execCommand 폴백
```

### 4.2 `App.jsx` 라우트 변경

1. **비로그인 분기**에 공개 채팅 라우트를 추가한다 (현재는 모든 경로가 `/login`으로 리다이렉트됨):

```jsx
if (!user) {
  return (
    <Routes>
      <Route path="/chat/:publicId" element={<PublicChat />} />   {/* 추가 */}
      <Route path="/login" element={<Login />} />
      ...
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
```

2. **로그인 상태**에서도 동일 경로가 동작하도록 메인 `<Routes>`에 추가한다(관리자가 링크를 직접 확인하는 경우).

3. `navLinks`에 항목 추가:

```jsx
{ path: '/faq', label: 'FAQ', icon: '💬' },
```

4. 보호 라우트 추가:

```jsx
<Route path="/faq" element={<ProtectedRoute><FaqList /></ProtectedRoute>} />
<Route path="/faq/new" element={<ProtectedRoute><FaqForm /></ProtectedRoute>} />
<Route path="/faq/edit" element={<ProtectedRoute><FaqForm /></ProtectedRoute>} />
<Route path="/faq/chats" element={<ProtectedRoute><FaqChats /></ProtectedRoute>} />
```

5. `AdminLayout.jsx`의 `adminMenuItems`에 `{ path: '/admin/faq', label: 'FAQ', icon: '💬' }` 추가 및 `/admin` 하위 라우트에 `<Route path="faq" element={<AdminFaq />} />` 추가.

> **주의**: `PublicChat`은 `fetchWithAuth`가 아니라 **일반 `fetch`** 를 사용해야 한다. `fetchWithAuth`는 401 시 `/login`으로 강제 이동시키므로 공개 페이지에 부적합하다.

### 4.3 배포 라우팅 확인

- `vercel.json`은 `/(.*) → client/index.html` 이므로 `/chat/:publicId` 는 SPA에서 처리된다. 추가 설정 불필요.
- Render(Express) 배포에서도 `app.get('*')`가 `index.html`을 반환하므로 동일하게 동작한다.
