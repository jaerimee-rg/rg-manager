# 04. 구현 계획 및 테스트 계획 — FAQ 챗봇

---

## 1. 작업 순서

각 단계는 독립적으로 동작 확인이 가능하도록 나눴다. 단계별로 커밋한다.

### 1단계 — DB 스키마 (0.5일)

- [ ] `server/database.js`의 `initDatabase()`에 `faqs`, `chat_channels`, `chat_sessions`, `chat_messages` 테이블 생성 추가
- [ ] 인덱스 및 `chat_sessions_unique` 제약 추가 (기존 `try/catch` 패턴)
- [ ] 로컬 DB에서 서버 기동 → 테이블 생성 확인

### 2단계 — FAQ 백엔드 (1일)

- [ ] `server/models/Faq.js` (getAll/getById/create/update/delete, `userId`+`role` 처리)
- [ ] `server/controllers/faqController.js` (검증 규칙 포함)
- [ ] `server/routes/faqs.js` (`verifyToken` + `logAction`)
- [ ] `server/server.js`에 라우트 등록
- [ ] `server/middleware/logger.js`의 `saveLog`에 `CREATE_FAQ`/`UPDATE_FAQ`/`DELETE_FAQ` 상세 문구 추가

### 3단계 — FAQ 관리 화면 (1.5일)

- [ ] `client/src/pages/Faq/FaqList.jsx` (목록·검색, 데스크톱 표 / 모바일 스와이프 카드 — FR-15a)
- [ ] `client/src/pages/Faq/FaqForm.jsx` (등록·수정 공용, 기존 `StudentForm` 패턴 참고)
- [ ] `client/src/App.jsx` — `navLinks`에 FAQ 추가, `/faq`, `/faq/new`, `/faq/edit` 라우트 추가
- [ ] 삭제 확인 및 성공/실패 피드백

### 4단계 — 채널 및 링크 복사 (0.5일)

- [ ] `server/models/ChatChannel.js`, `server/utils/publicId.js`
- [ ] `GET /api/chat/channel` (없으면 자동 생성), `PUT /api/chat/channel`
- [ ] `client/src/utils/copyToClipboard.js` (clipboard API + `execCommand` 폴백)
- [ ] FaqList 상단 링크 배너 + 아이콘 전용 복사 버튼 + 페이지 헤더 우측 공유 아이콘(FR-22a) + 채널 설정 모달

### 5단계 — 공개 채팅 화면 (1.5일)

- [ ] `client/src/pages/PublicChat.jsx` — **일반 `fetch` 사용** (`fetchWithAuth` 금지)
- [ ] 대화명 입력 화면(FR-33) → `POST /api/chat/public/:publicId/session` 후 채팅 진입
- [ ] `visitorKey` localStorage 발급/복원
- [ ] `App.jsx` 비로그인 분기와 로그인 분기 양쪽에 `/chat/:publicId` 라우트 추가
- [ ] 메시지 목록/입력창 컴포넌트, 500자 제한, 로딩 상태, 모바일 하단 고정 입력
- [ ] `GET /api/chat/public/:publicId`, `GET .../messages` 연동

### 6단계 — AI 답변 (1.5일)

- [ ] `cd server && npm install @google/genai dotenv` + `server/loadEnv.js` 생성, `server.js` 첫 import로 추가
- [ ] `server/utils/aiAnswer.js` — 프롬프트 빌드 + 호출 + 구조화 출력 파싱 ([03 문서](./03-ai-answer-design.md) §4)
- [ ] `POST /api/chat/public/:publicId/messages` — 세션 upsert, 질문 저장, AI 호출, 답변 저장
- [ ] 공개 채팅 전용 레이트 리미터를 `apiLimiter`보다 먼저 등록
- [ ] 채널 일일 한도 체크
- [ ] 루트 `.env`의 `GEMINI_API_KEY` 확인(저장 완료) + Render/Vercel 환경변수에 동일 키 추가
- [ ] [03 문서](./03-ai-answer-design.md) §8 품질 시나리오 수동 검증

### 7단계 — 관리자 대화 확인 (1일)

- [ ] `server/models/ChatSession.js`, `ChatMessage.js`
- [ ] `GET /api/chat/sessions`, `GET /api/chat/sessions/:id/messages`, `DELETE /api/chat/sessions/:id`
- [ ] `client/src/pages/Faq/FaqChats.jsx` (목록/상세, 미답변 필터, 기간 필터, 페이지네이션)
- [ ] 모바일: 세션 선택 시 상세를 전체 화면으로 표시(FR-51a), 통계 카드 없음(FR-50a)
- [ ] `/faq` 화면 상단 탭으로 `FAQ 관리` ↔ `대화 내역` 전환

### 8단계 — 관리자(admin) 화면 (0.5일)

- [ ] `client/src/pages/admin/AdminFaq.jsx` (사용자 필터 `filterUserId`)
- [ ] `AdminLayout.jsx` 메뉴 및 `App.jsx` `/admin/faq` 라우트 추가

### 9단계 — 테스트 및 마무리 (1일)

- [ ] §4 테스트 작성 및 통과
- [ ] 모바일 실기기 확인
- [ ] `CLAUDE.md`에 FAQ 챗봇 구조 요약 추가

**예상 총 공수: 약 9일 (1인 기준)**

---

## 2. 신규/수정 파일 목록

### 신규 (서버)

| 파일 | 역할 |
|---|---|
| `server/models/Faq.js` | FAQ CRUD |
| `server/models/ChatChannel.js` | 채널 조회/생성/수정 |
| `server/models/ChatSession.js` | 세션 upsert/목록/카운터 |
| `server/models/ChatMessage.js` | 메시지 저장/조회 |
| `server/controllers/faqController.js` | FAQ API |
| `server/controllers/chatController.js` | 공개 채팅 + 관리자 조회 API |
| `server/routes/faqs.js` | `/api/faqs` |
| `server/routes/chat.js` | `/api/chat` |
| `server/utils/aiAnswer.js` | Gemini 호출 (`@google/genai`) |
| `server/utils/publicId.js` | 랜덤 토큰 생성 |

### 신규 (클라이언트)

| 파일 | 역할 |
|---|---|
| `client/src/pages/Faq/FaqList.jsx` | FAQ 목록 + 링크 |
| `client/src/pages/Faq/FaqForm.jsx` | FAQ 등록/수정 |
| `client/src/pages/Faq/FaqChats.jsx` | 대화 내역 |
| `client/src/pages/Faq/ChannelSettings.jsx` | 채널 설정 |
| `client/src/pages/PublicChat.jsx` | 학부모 채팅 (공개) |
| `client/src/pages/admin/AdminFaq.jsx` | 관리자 FAQ 조회 |
| `client/src/components/Faq/ChatMessageList.jsx` | 메시지 목록 |
| `client/src/components/Faq/ChatComposer.jsx` | 입력창 |
| `client/src/utils/copyToClipboard.js` | 클립보드 복사 |
| `client/src/hooks/useSwipeActions.js` | 카드 스와이프(수정·삭제) 훅 |

### 수정

| 파일 | 변경 |
|---|---|
| `server/database.js` | 테이블 4개 + 인덱스 추가 |
| `server/server.js` | 라우트 2개, 채팅 전용 레이트 리미터, `import './loadEnv.js'` |
| `server/middleware/logger.js` | FAQ 액션 상세 문구 |
| `server/package.json` | `@google/genai`, `dotenv` 의존성 |
| `client/src/App.jsx` | `navLinks`, `/faq*`, `/chat/:publicId`(비로그인 포함), `/admin/faq` |
| `client/src/components/admin/AdminLayout.jsx` | `adminMenuItems`에 FAQ |
| `client/src/styles/App.css` | 채팅 버블·입력창 스타일 |
| `CLAUDE.md` | 아키텍처 설명 갱신 |

---

## 3. 구현 시 주의사항 (기존 코드 규약)

1. **상대 경로 API**: `fetch('/api/faqs')` — 절대 URL 금지
2. **컬럼명 인용부호**: PostgreSQL camelCase 컬럼은 `"userId"`처럼 큰따옴표 필수
3. **권한 처리**: 모든 모델 메서드는 `(id, userId, role)`을 받고 `role !== 'admin'`일 때 `AND "userId" = $n` 추가
4. **JSON 배열 컬럼**: 저장은 `JSON.stringify`, 조회는 `safeJsonParse`
5. **공개 페이지에서 `fetchWithAuth` 금지**: 401 시 `/login`으로 강제 이동하므로 학부모 화면이 깨진다
6. **레이트 리밋 순서**: `app.use('/api/chat/public', chatLimiter)`를 `app.use('/api', apiLimiter)`보다 먼저 등록
7. **모바일 패턴**: `useIsMobile()` 훅 사용, 라벨 `whiteSpace: 'nowrap'`, 버튼 그룹 `flexWrap: 'wrap'`
8. **ESM**: 모든 서버 파일은 `import`/`export` 사용 (`"type": "module"`)
9. **마이그레이션 없음**: 스키마 변경은 `initDatabase()`의 `IF NOT EXISTS` 구문으로만
10. **AI 키 노출 금지**: `GEMINI_API_KEY`는 서버에서만 읽는다(루트 `.env`). `VITE_` 접두사 사용 금지

---

## 4. 테스트 계획

프로젝트 규약(`TESTING.md`)에 따라 서버는 Jest, 클라이언트는 Jest + React Testing Library를 사용한다.

### 4.1 서버 단위 테스트

| 파일 | 검증 항목 |
|---|---|
| `server/controllers/__tests__/faqController.test.js` | 생성 시 필수값 누락 400 / 길이 초과 400 / 정상 201, 목록은 본인 `userId`만, 타 사용자 FAQ 수정 시 404, admin은 `filterUserId`로 조회 가능 |
| `server/controllers/__tests__/chatController.test.js` | 잘못된 `publicId` 404, 비활성 채널 404, 500자 초과 400, `visitorKey` 누락 400, 일일 한도 초과 429, 정상 질문 시 세션·메시지 저장, AI 실패 시에도 200 + `answered:false`, 관리자 세션 조회 시 타 사용자 세션 404 |
| `server/utils/__tests__/aiAnswer.test.js` | (Gemini SDK 목킹) FAQ 0건이면 API 호출 없음(`status:'no_faq'`), 프롬프트에 모든 공개 FAQ id 포함, 비공개 FAQ 미포함, `answered:false` 응답 시 `answer` 무시, `stop_reason:'refusal'` 처리, 타임아웃/예외 시 `status:'ai_error'`, FAQ 정렬이 항상 동일(캐시 안정성) |
| `server/utils/__tests__/publicId.test.js` | 길이·문자셋(URL-safe), 1000회 생성 시 중복 없음 |

- Gemini SDK는 `jest.unstable_mockModule('@google/genai', ...)`로 목킹한다(ESM). **실제 API를 호출하는 테스트는 작성하지 않는다.**
- `pool.query`는 기존 `studentController.test.js`와 동일한 방식으로 목킹한다.

### 4.2 클라이언트 단위 테스트

| 파일 | 검증 항목 |
|---|---|
| `client/src/utils/__tests__/copyToClipboard.test.js` | `navigator.clipboard` 사용, 미지원 환경에서 `execCommand` 폴백, 실패 시 false 반환 |
| `client/src/pages/Faq/__tests__/FaqForm.test.js` | 필수값 미입력 시 제출 차단, 200/2000자 초과 경고, 저장 호출 페이로드 |
| `client/src/components/Faq/__tests__/ChatComposer.test.js` | 500자 초과 시 전송 비활성화, 전송 중 중복 전송 차단, 빈 문자열 전송 차단 |
| `client/src/components/Faq/__tests__/ChatMessageList.test.js` | parent/bot 메시지 구분 렌더링, 줄바꿈 유지, HTML 문자열이 태그로 해석되지 않음(XSS) |
| `client/src/pages/__tests__/PublicChat.test.js` | 404 응답 시 안내 화면, 비활성 채널 안내, 인사말 표시, 질문 전송 후 답변 렌더링 |

### 4.3 수동 QA 체크리스트

[01 문서](./01-requirements.md) §8의 AC-01 ~ AC-17을 전부 수행하고 결과를 기록한다. 특히:

- 시크릿 창(비로그인)에서 링크 접속
- 서로 다른 두 계정의 링크에서 FAQ 교차 노출 없음
- `GEMINI_API_KEY` 제거 상태에서 안내 문구 정상 표시
- 모바일 실기기(iOS Safari, Android Chrome): 링크 복사, 키보드 노출 시 입력창 위치

### 4.4 실행

```bash
cd server && npm test
cd client && npm test
```

---

## 5. 배포

1. **환경변수 추가** (Render 서비스 및 Vercel 프로젝트 양쪽)
   - `GEMINI_API_KEY`
   - (선택) `FAQ_CHAT_DAILY_LIMIT`, `FAQ_CHAT_MODEL`
2. **DB 스키마**: 서버 기동 시 `initDatabase()`가 테이블을 자동 생성한다. 별도 작업 없음
3. **의존성**: `server/package.json`에 `@google/genai`, `dotenv` 추가 → 배포 시 `npm install`로 반영
4. **라우팅**: `vercel.json`의 `/(.*) → client/index.html` 규칙으로 `/chat/:publicId`가 동작한다. 추가 설정 불필요
5. **배포 후 확인**: 실제 도메인에서 링크 복사 → 다른 기기로 접속 → 질문/답변 1회 왕복

---

## 6. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| AI가 FAQ 밖 내용을 답변 | 잘못된 학원 안내 → 신뢰 손상 | 구조화 출력의 `answered` 플래그로 서버가 최종 문구 결정, 배포 전 §8 시나리오 검증, 초기 운영 중 대화 로그 주기 점검 |
| 링크 유출로 스팸 유입 | 비용 증가 | IP·채널 레이트 리밋, 채널 비활성화, 링크 재발급(2차) |
| AI 비용 초과 | 운영비 부담 | 일일 한도, 토큰 사용량 기록, `FAQ_CHAT_MODEL`로 모델 교체 가능(flash ↔ flash-lite ↔ pro) |
| Gemini API 장애·안전필터 차단 | 답변 불가 | 안내 문구 폴백(FR-45), 채팅 화면 자체는 정상 동작 |
| FAQ가 적어 대부분 미답변 | 학부모 불만 | FAQ 0건이면 채팅 링크에 "준비 중" 안내, 관리자 화면에서 미답변 질문 확인 유도 |
| 학부모가 개인정보를 채팅에 입력 | 개인정보 보관 이슈 | 화면 하단 고지, 관리자 세션 삭제 기능 제공, 프롬프트에 개인정보 질문은 답변 불가 규칙 명시 |
| 입력 토큰 증가로 비용 상승 | 비용 증가 | FAQ 직렬화 순서 고정, `usageMetadata` 모니터링, FAQ 200건 초과 시 후보 검색 단계 도입 |
