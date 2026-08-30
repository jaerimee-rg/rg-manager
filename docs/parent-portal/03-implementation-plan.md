# 학부모 포털 — 구현 계획 (1차 MVP)

> 상태: **초안** · 2026-08-23 · 대상: [01-requirements.md](./01-requirements.md) §5 (MVP) + FR-88 · 설계: [02-data-model-api.md](./02-data-model-api.md)
> 원칙: **기존 화면·API·데이터는 그대로 동작한다.** 모든 변경은 추가(additive)이고, 기존 코드 수정은 "학부모 토큰 거부"와 "대회 ↔ 이벤트 동기화" 두 군데로 최소화한다.

## 0. 요약

| 항목 | 내용 |
|---|---|
| 단계 | **S1** 스키마·역할 가드 → **S2** 이벤트 API·대회 동기화·백필 → **S3** 선생님 UI(이벤트 관리·학부모 메뉴·관리자 학부모) → **S4** 초대·카카오 가입·학부모 API → **S5** 학부모 포털 UI → **S6** 알림(선택)·정리. 각 단계는 **단독으로 배포 가능**하며 앞 단계만 의존한다 |
| 기존 코드 수정 | `server.js`(라우터에 가드 1줄씩, 라우터 3개 등록), `middleware/`(신규 1), `authController.kakaoCallback/getKakaoAuthUrl`(분기 추가), `competitionController`(이벤트 미러 호출 3줄), `models/User.transferData`·`Student.delete`(연결 테이블 정리), `App.jsx`(학부모 분기 + 메뉴 2개), `AuthContext.kakaoLogin`(state 전달), `KakaoCallback.jsx`(역할별 이동), `AdminLayout`(메뉴 1개) |
| DB | 신규 테이블 5개, 기존 테이블 **컬럼 변경 없음**. `initDatabase()` 에 `IF NOT EXISTS` 문 추가 + 멱등 백필 |
| 위험 최상위 2개 | ① 로컬 개발이 **운영 DB 를 공유**하므로 학부모 계정을 운영에 만들면 **가드가 배포되기 전 운영 코드**가 그 계정을 선생님처럼 취급한다 → S1 을 먼저 배포하거나 로컬 DB 로 개발 ② `/api/auth/kakao` 레이트 리밋(IP 당 15분 20회)이 같은 Wi-Fi 의 학부모 단체 가입을 막을 수 있다 → 한도 조정 |

## 1. 기존 코드 분석 — 무엇을 건드리고 무엇을 건드리지 않는가

### 1.1 서버 진입점 `server/server.js`

| 사실 | 의미 |
|---|---|
| 라우터를 경로별로 `app.use('/api/xxx', router)` 로 등록. 인증은 각 라우터 안에서 `verifyToken` 을 라우트마다 건다 | 역할 가드를 **`server.js` 의 `app.use` 줄에 끼우면** 기존 라우터 파일을 한 줄도 안 고치고 전부 보호할 수 있다 |
| `verifyToken`(`middleware/auth.js`)은 JWT 를 풀어 `req.user = { id, username, role }` 만 넣고 **역할을 보지 않는다**. 컨트롤러 47곳이 `role === 'admin'` 만 검사 | 학부모 토큰(`role='parent'`)은 지금 구조에서 **모든 선생님 API 를 통과**한다. 데이터는 `userId` 로 스코프되므로 남의 데이터는 못 보지만, 자기 `userId` 로 학생·수업을 만들 수 있다 → **S1 에서 반드시 막는다** |
| 레이트 리밋: `/api/auth/kakao` 15분 **20회/IP**, `/api` 200회/IP, 공개 채팅은 별도 키 | 초대 가입은 `GET /api/auth/kakao?invite` + `POST /api/auth/kakao/callback` = IP 당 2회. 학원·학교 Wi-Fi 로 10명 넘게 가입하면 막힌다 → S4 에서 한도 60으로 올리거나 `GET` 을 한도에서 뺀다 |
| `express.json({ limit: '10mb' })`, helmet(CSP off), `app.get('*')` 가 SPA index 반환 | `/invite/:token`, `/parent/*` 같은 새 SPA 경로는 추가 설정 없이 동작 |
| Vercel 에서는 `app.listen` 생략, `initDatabase()` 가 모듈 로드 시 실행 | 스키마 변경은 콜드스타트마다 재실행 → **모든 문장 멱등** |

### 1.2 인증 `authController.js` · `models/User.js`

| 사실 | 의미 |
|---|---|
| `kakaoCallback({ code })`: 토큰 발급 → `/v2/user/me` → `getByKakaoId` 없으면 `createWithKakao(role 기본 'user', username '카카오_<ts>')` → JWT → `isNewUser` 반환. 클라이언트는 `isNewUser` 면 `/register-name` | `state`(초대 토큰) 가 **없으면 지금 흐름 그대로**. 있으면 학부모 분기. 선생님 흐름은 변경 없음 |
| `getKakaoAuthUrl` 은 항상 `scope=talk_message` | 학부모도 같은 URL 생성기를 쓰되 `state` 만 추가. scope 는 그대로 둬도 무해(학부모 토큰은 메시지 발송에 쓰지 않음) |
| `createWithKakao` 는 `role` 파라미터를 이미 받는다(기본 `'user'`) | `role: 'parent'` 로 호출만 하면 됨. `users` 스키마 변경 불필요 |
| `username` UNIQUE | 학부모 username = 카카오 닉네임 → 중복이면 `닉네임_숫자`. 선생님의 `/register-name` 흐름은 건드리지 않음. **화면에 보이는 이름은 `parent_accounts.displayName`**(UNIQUE 아님) — "지우엄마" 가 둘이어도 접미사가 붙지 않는다 (FR-25a) |
| `verifyTokenEndpoint`(`GET /api/auth/verify`) 는 `User.getById` 만 — 역할 무관 | 학부모도 앱 부팅 시 이 엔드포인트로 세션을 확인한다 → 가드의 **예외 목록**에 넣는다 |
| `User.transferData` 는 students·classes·attendance·competitions 의 `userId` 를 옮긴다 | `events.userId`, `parent_accounts.teacherId`, `parent_invites.userId` 도 함께 옮겨야 선생님 계정 이전 후 학부모가 이벤트를 잃지 않는다 → S2/S4 에서 3줄 추가 |
| `User.delete(id)` 단순 DELETE | 선생님 삭제 시 `parent_accounts` 는 CASCADE 로 지워지지만 학부모 `users` 행은 남는다 → 선생님 삭제 컨트롤러에서 소속 학부모 `users` 도 지운다(S4) |
| `logAction('KAKAO_LOGIN')` 이 공개 라우트에서도 동작(사용자 없어도 기록) | 초대 공개 엔드포인트에도 `logAction` 을 써도 안전 |

### 1.3 대회 `competitionController.js` · `models/Competition.js`

| 사실 | 의미 |
|---|---|
| `competitions(id, name, date, location, userId, createdAt)` — 스키마 단순. `competition_students` 에 `events`(JSON 종목)·`award`·`paid`·`coachFeePaid` | **건드리지 않는다.** 이벤트는 새 `events` 테이블에, 대회형만 `events.competitionId` 로 1:1 참조 |
| `Competition.create/update/delete` 는 컨트롤러에서 직접 호출. 소유권은 `userId`/`role` 로 모델 안에서 검사 | 컨트롤러 3곳에 **미러 동기화 한 줄씩** 추가: create 후 `eventService.mirrorFromCompetition()`, update 후 동기화, delete 는 FK CASCADE 로 자동. 미러 실패는 **로그만 남기고 대회 작업은 성공 처리**(기존 동작 보존), 백필이 다음 부팅 때 메운다 |
| `Competition.addStudent` 는 존재 확인 후 INSERT/UPDATE (UNIQUE 제약 있음) | 학부모 신청 **확정** 은 이 메서드를 그대로 호출 → 참가 학생 화면·`학생별 대회`·참가비 토글은 무변경 |
| 기존 클라이언트 `/competitions/*` 4개 화면(`CompetitionList/Form/StudentManagement`, `StudentCompetitions`) | 그대로 둔다. `/competitions` 목록만 `/events` 로 리다이렉트, 나머지 경로는 유지(FR-60). 옛 `CompetitionForm` 으로 만든 대회도 미러로 이벤트가 생긴다(`registrationOpen=false`) |

### 1.4 학생 `models/Student.js`

| 사실 | 의미 |
|---|---|
| `students.userId` 로 선생님 소유, `birthdate TEXT`(폼은 `<input type="date">` → `YYYY-MM-DD`) | 자녀 매칭은 `userId = teacherId` 범위에서 이름(공백 제거)·생년월일(정규화) 비교. 기존 데이터 포맷이 섞여 있을 수 있어 `normalizeDate()` 로 `2018-3-5` 도 흡수 |
| `Student.delete` 는 단순 DELETE, FK 들이 CASCADE | `parent_children.studentId` 는 `ON DELETE SET NULL` 로 두고, **삭제 직전** `UPDATE parent_children SET status='unlinked' WHERE studentId=$1` 한 줄 추가(S4). `event_registrations.studentId` 는 CASCADE |

### 1.5 클라이언트 `App.jsx` · `AuthContext` · `KakaoCallback`

| 사실 | 의미 |
|---|---|
| `App()` 이 `loading → !user → (admin 경로면 AdminLayout) → 선생님 트리` 순으로 분기. `ProtectedRoute` 는 로그인 여부만 본다 | **`!user` 분기 바로 뒤에 `user.role === 'parent'` 분기를 하나 추가**해 `ParentApp`(자체 레이아웃·라우트) 을 반환한다. 선생님 트리·`ProtectedRoute` 는 **수정 없음** → 선생님 회귀 위험 0. 학부모가 `/students` 로 와도 `ParentApp` 의 `*` 가 `/parent/schedule` 로 보낸다(FR-05) |
| 비로그인 트리는 `/login`, `/oauth/kakao/callback`, `/register-name`, `*→/login` | `/invite/:token` 을 비로그인 트리에 추가. 로그인 상태에서 초대 링크를 열면(선생님이 자기 링크 클릭) 로그인 트리로 들어오므로 `/invite/:token` 을 **양쪽 트리**에 두고, 로그인된 선생님에게는 "선생님 계정으로 로그인되어 있습니다" 안내 |
| `isPublicChatPage` 는 인증 확인 전에 렌더 | 초대 랜딩도 같은 방식(인증 대기 없이 바로 표시)으로 처리하면 체감이 빠르다 — 선택 |
| `AuthContext.kakaoLogin(code)` → `isNewUser` 반환, `verifyStoredToken` 이 `/api/auth/verify` 호출 | `kakaoLogin(code, state)` 로 확장(기존 호출부 1곳), 반환에 `role`·`needsOnboarding` 추가. 토큰 저장(`tokenStorage`)은 그대로 |
| `KakaoCallback` 은 `isNewUser ? /register-name : /` | `role === 'parent'` 면 `needsOnboarding ? /parent/onboarding : /parent/schedule`. 선생님 분기는 그대로 |
| `fetchWithAuth` 는 401+`tokenExpired` 면 `/login` 으로 | 학부모도 동일. `/login` 의 카카오 버튼으로 재로그인(FR-23) |
| `navLinks` 배열, `AdminLayout.adminMenuItems` 배열 | `대회 관리 → 이벤트 관리(/events)`, `학부모(/parents)` 추가, 관리자 `학부모(/admin/parents)` 추가 — 배열 항목 편집 |
| 테스트: 서버 Jest(ESM, `unstable_mockModule` 로 모델 모킹), 클라이언트 Jest+RTL(`App.routing.test.js` 가 딥링크·역할 리다이렉트 검증). Playwright 설정 파일은 저장소에 없음 | 서버: 새 컨트롤러마다 같은 패턴. 클라이언트: `App.routing.test.js` 에 학부모 케이스 추가, 순수 로직(`parentSchedule.js`)은 단위 테스트. e2e 는 §6 |

### 1.6 DB 운영 조건 (`database.js`, CLAUDE.md)

| 사실 | 의미 |
|---|---|
| `initDatabase()` 가 **모든 부팅**(로컬·Vercel 콜드스타트)에서 실행, `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` 패턴, 마이그레이션 도구 없음 | 신규 문장 모두 멱등. 백필은 `INSERT … SELECT … WHERE NOT EXISTS` |
| **로컬과 운영이 같은 Supabase DB** 를 쓴다(CLAUDE.md "Local and production share one Supabase database") | 로컬에서 새 코드를 띄우는 순간 운영 DB 에 새 테이블·백필이 들어간다. 테이블 추가 자체는 운영 코드가 모르는 테이블이라 무해하지만, **학부모 계정(`role='parent'`)을 운영 DB 에 만들면 가드 없는 운영 코드가 선생님으로 취급**한다(§1.1). → **권장: 이 기능 개발은 로컬 Postgres(`createdb rg_manager`)로 한다.** 불가피하게 공유 DB 로 개발하면 S1 을 먼저 배포한 뒤 S4 이후를 진행한다 |
| Vercel Preview 배포의 `DATABASE_URL` 이 운영과 같은지 확인 필요 | 같다면 PR 프리뷰 = 운영 데이터. S4 부터는 프리뷰에서 학부모 가입 테스트를 하지 않는다 |
| `users.role` 은 TEXT, 제약 없음 | `'parent'` 추가에 스키마 변경 없음. 운영의 옛 코드가 `role='parent'` 행을 만나도 깨지지 않는다(`AdminUsers` 목록에 역할 문자열만 보임) |

## 2. 단계별 계획

각 단계: **목표 → 신규/수정 파일 → 테스트 → 완료 조건 → 기존 영향**. 단계 끝마다 `npm test`(server·client) 통과 + 기존 화면 수동 회귀(§6.3).

### S1. 스키마 · 모델 · 역할 가드 (서버만, 배포 안전)

**목표** 새 테이블을 만들고 학부모 토큰이 선생님 API 에 닿지 않게 한다. 학부모 계정은 아직 생성 경로가 없으므로 사용자 체감 변화 0.

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/database.js` | `parent_invites`, `parent_accounts`, `parent_children`, `events`, `event_registrations` CREATE + 인덱스 + 제약(02 §1). `competitions → events` 백필은 S2 |
| 신규 | `server/middleware/roles.js` | `requireRole(...roles)`; `rejectParents`(Authorization 이 있으면 JWT 를 **비치명적으로** 풀어 `role==='parent'` 면 403, 없거나 다른 역할이면 통과 — 인증 자체는 기존 `verifyToken` 이 계속 담당) |
| 수정 | `server/server.js` | `rejectParents` 를 `/api/students`, `/api/classes`, `/api/attendance`, `/api/logs`, `/api/competitions`, `/api/faqs`, `/api/notifications`, `/api/settings`, `/api/faq-files`(단 `GET /:id/view` 는 공개 유지), `/api/chat`(단 `/api/chat/public/*` 제외), `/api/auth/users*`, `/api/auth/kakao/consent|messages|users|test`, `/api/auth/username` 에 적용. **예외**: `/api/auth/login|signup|kakao|kakao/callback|verify`, `/api/chat/public/*`, `/api/faq-files/:id/view`, 이후 추가될 `/api/invite/*`, `/api/parent/*` |
| 신규 | `server/models/ParentInvite.js`, `ParentAccount.js`, `ParentChild.js`, `Event.js`, `EventRegistration.js` | 02 §2 메서드. SQL 은 기존 모델 스타일(`pool.query`, camelCase 따옴표 컬럼) |
| 신규 | `server/services/parentOnboarding.js` | `normalizeDate`, `matchChild` 순수 함수 |
| 신규 | `server/services/eventService.js` | `canRegister`, `eventStartMs`(KST 기준), `mirrorFromCompetition`, `saveCompetitionEvent`, `backfillCompetitionEvents` 골격 |
| 테스트 | `server/middleware/__tests__/roles.test.js` | 학부모 토큰 403 / 선생님·관리자 통과 / 토큰 없음 통과(뒤의 verifyToken 이 401) / 깨진 토큰 통과 |
| 테스트 | `server/services/__tests__/parentOnboarding.test.js`, `eventService.test.js` | 매칭(공백·날짜 포맷·동명이인 → pending), `canRegister` 7가지 사유 |
| 테스트 | 기존 `chatController.test.js` 등 | 변경 없음 — 통과 유지로 회귀 확인 |

**완료 조건** `npm test` 통과. 로컬에서 `initDatabase()` 두 번 실행해도 오류 없음(`\dt` 로 5개 테이블 확인). 기존 선생님 로그인·학생·대회 화면 정상.
**기존 영향** 없음(학부모 토큰이 아직 존재하지 않음). 콜드스타트 +수십 ms.

### S2. 이벤트 API · 대회 동기화 · 백필

**목표** 선생님이 이벤트를 만들고 신청 현황을 볼 수 있는 API. 기존 대회가 이벤트 목록에 나타난다.

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `server/controllers/eventController.js`, `server/routes/events.js` | 02 §3.3 전부(`type` 변경 거부, 옵션 id 부여·삭제 경고 수, 대회형 생성 시 `competitions` 동반 생성 — 트랜잭션). `logAction('CREATE_EVENT'|'UPDATE_EVENT'|'DELETE_EVENT')` |
| 수정 | `server/controllers/competitionController.js` | `createCompetition` 성공 후 `eventService.mirrorFromCompetition(newCompetition)`; `updateCompetition` 성공 후 `syncCompetitionMirror(updated)`; delete 는 FK CASCADE. 둘 다 `try/catch` 로 감싸 실패해도 응답은 기존 그대로 |
| 수정 | `server/database.js` | `backfillCompetitionEvents()` 호출(멱등 INSERT…SELECT, `registrationOpen=FALSE`, `isPublished=TRUE`) |
| 수정 | `server/models/User.js` `transferData` | `UPDATE events SET "userId"…` 추가(학부모 이전은 S4) |
| 수정 | `server/server.js` | `app.use('/api/events', rejectParents, eventRoutes)` |
| 테스트 | `controllers/__tests__/eventController.test.js` | 생성/수정/삭제·타입 고정·옵션 id 불변·대회형 동반 생성·신청 현황 집계·확정 시 `Competition.addStudent` 호출·학부모 토큰 403 |
| 테스트 | `controllers/__tests__/competitionController.test.js`(있으면 보강) | 미러 호출 여부 + **미러 실패 시에도 201/200** |
| 테스트 | `services/__tests__/eventService.test.js` | 백필 멱등(두 번 호출해도 1행) |

**완료 조건** `/api/events` 로 세 종류 생성·조회, 기존 `/api/competitions` 로 만든 대회가 `/api/events` 에 보이고 역도 성립, `학생별 대회`·참가 학생 화면 무변화.
**기존 영향** `competitionController` 3곳에 미러 호출이 추가되지만 실패해도 기존 응답 유지. 백필은 새 테이블에만 쓴다.

### S3. 선생님 UI — 이벤트 관리 · 학부모 메뉴 · 관리자 학부모

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `client/src/pages/Events/EventList.jsx`, `EventForm.jsx`, `OptionsEditor.jsx`, `EventRegistrations.jsx` | 목업 `teacher.html` 이벤트 페이지 그대로: 표(종류·이벤트·날짜·장소·참가 학생·신청·공개/접수·관리)/모바일 카드·스와이프(FAQ `FR-15a` 유틸 재사용), 종류 필터, 지난 일정 보기, 폼 모달(타입 고정·옵션 편집기·[종목 6개 불러오기]·토글), 신청 현황 패널(집계·확정·일괄 확정·명단 복사·취소 숨기기) |
| 신규 | `client/src/pages/Parents/ParentList.jsx`, `ParentsByParent.jsx`, `ParentsByStudent.jsx`, `InviteLinkBox.jsx` | 목업 학부모 페이지: 🔗 아이콘, 링크 박스, 요약 카드 4, 학부모별/학생별, 검색, 추천 연결, 연결 추가/해제, 삭제. 데이터는 `GET /api/parents` + `GET /api/students` |
| 신규 | `client/src/pages/admin/AdminParents.jsx` | `AdminCompetitions` 와 같은 사용자 필터 패턴으로 `GET /api/parents?filterUserId=` (FR-88) |
| 수정 | `client/src/App.jsx` | `navLinks`: `대회 관리`→`이벤트 관리 /events`, `학부모 /parents` 추가. 라우트 `/events`, `/events/new|edit`, `/events/:id/registrations`, `/parents`, `/admin/parents`. `/competitions` → `<Navigate to="/events" />`(하위 경로 유지) |
| 수정 | `client/src/components/admin/AdminLayout.jsx` | `adminMenuItems` 에 `{ path:'/admin/parents', label:'학부모', icon:'👨‍👩‍👧' }` |
| 수정 | `client/src/pages/admin/AdminUsers.jsx` | 역할 배지에 `parent → 학부모` 표시(선택) |
| 신규(서버) | `server/controllers/parentAdminController.js`, `parentInviteController.js`, `routes/parents.js`, `routes/parentInvite.js` | 02 §3.4(`filterUserId` 는 `role==='admin'` 만, 그 외 본인) |
| 테스트 | `client/src/pages/Events/__tests__/*.test.js`, `Parents/__tests__/*.test.js` | 폼 타입별 필드 노출, 옵션 편집기 id 유지, 신청 현황 확정 버튼, 학생별 보기 추천 연결. `App.routing.test.js` 에 `/competitions → /events` 리다이렉트 |
| 테스트(서버) | `parentAdminController.test.js`, `parentInviteController.test.js` | 소유권·관리자 스코프·학부모 토큰 403 |

**완료 조건** 선생님이 이벤트 세 종류 등록/수정/삭제, 대회형 [참가 학생] → 기존 화면, 신청 현황(아직 신청 0건), 학부모 메뉴에 초대 링크 표시, 관리자 `/admin/parents` 빈 목록 표시.
**기존 영향** 헤더 메뉴 이름 변경(`대회 관리` → `이벤트 관리`)과 `/competitions` 리다이렉트. 기존 대회 데이터는 이벤트 목록에서 보임.

### S4. 초대 · 카카오 학부모 가입 · 학부모 API

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/controllers/authController.js` | `getKakaoAuthUrl`: `?invite=` 유효하면 `state` 첨부. `kakaoCallback`: `state` 있으면 02 §3.1 분기(신규→`role:'parent'`+`parent_accounts`, 기존 학부모→로그인, 선생님 카카오→409), 응답에 `role`·`needsOnboarding`. `state` 없고 기존 사용자가 학부모면 `needsOnboarding` 계산. **선생님 경로 코드 줄은 그대로** |
| 수정 | `server/server.js` | `/api/auth/kakao` 리밋 20→60(또는 GET 제외), `app.use('/api/invite', inviteRoutes)`, `app.use('/api/parent', requireParent, parentRoutes)` |
| 신규 | `server/controllers/parentController.js`, `routes/parent.js` | 02 §3.2 (`me`, `children`, `events?upcoming=1`, `events/:id`, 신청 PUT/DELETE). 모든 쿼리 `teacherId`/`parentUserId` 스코프, 남의 것은 404 |
| 수정 | `server/models/User.js` | `transferData` 에 `parent_accounts.teacherId`, `parent_invites.userId`; 선생님 삭제 시 소속 학부모 삭제는 `authController.deleteUser` 에서 `ParentAccount.deleteByTeacher` 호출 |
| 수정 | `server/models/Student.js` `delete` | 삭제 전 `ParentChild.markUnlinkedByStudent(id)` |
| 수정 | `client/src/context/AuthContext.jsx` | `kakaoLogin(code, state)`; 반환 `{ user, isNewUser, role, needsOnboarding }` |
| 수정 | `client/src/pages/KakaoCallback.jsx` | `state` 전달, 역할별 이동 |
| 신규 | `client/src/pages/parent/InviteLanding.jsx` | `/invite/:token` (비로그인·로그인 양쪽 트리) |
| 테스트(서버) | `authController.test.js` 보강 | state 없음=기존 동작, state 유효=parent 생성, 선생님 카카오+state=409, 만료 토큰=400, username 중복 suffix |
| 테스트(서버) | `parentController.test.js` | upcoming 범위(오늘~연말 KST, 진행 중 기간 포함, 비공개 제외), 신청 조건 7사유, 옵션 필수, 취소→재신청 같은 행, 남의 자녀/이벤트 404, 선생님 토큰 403 |
| 테스트(클라) | `KakaoCallback.test.js`(신규), `AuthContext` 테스트 보강 | 역할별 이동 |

**완료 조건** 초대 링크 → 카카오 → 학부모 계정 → `needsOnboarding=true`. 선생님 카카오로 초대 링크 → 409. 학부모 토큰으로 `/api/students` → 403, `/api/auth/verify` → 200.
**기존 영향** 카카오 선생님 로그인 경로는 `state` 가 없으므로 동작 동일(테스트로 고정). `/api/auth/kakao` 한도 상향은 선생님에게도 완화 방향.

### S5. 학부모 포털 UI

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `client/src/components/parent/ParentLayout.jsx`, `ParentRoute.jsx`, `ParentApp.jsx` | 헤더(학원명·자녀 칩·🔔)·하단 탭(`parentNavLinks`: 일정 / 내 정보, 사진·채팅은 비활성 자리) · `/parent/*` 라우트 · `*` → `/parent/schedule` |
| 신규 | `client/src/pages/parent/ParentOnboarding.jsx`, `ParentSchedule.jsx`, `EventCard.jsx`, `EventDetailSheet.jsx`, `ParentSettings.jsx` | 목업 `parent.html` 그대로. 바텀시트는 `PublicChat` 의 `visualViewport` 고정 패턴 재사용 |
| 신규 | `client/src/utils/parentSchedule.js` | `filterRemainingThisYear`, `groupByMonth`, `dDay`, `registrationState` 순수 함수 |
| 수정 | `client/src/App.jsx` | `!user` 뒤에 `if (user.role === 'parent') return <ParentApp />`; 비로그인 트리에 `/invite/:token` |
| 수정 | `client/src/pages/Login.jsx` | 카카오 버튼 아래 "학부모는 선생님이 보낸 초대 링크로 처음 가입해요" 한 줄(선택) |
| 테스트 | `utils/__tests__/parentSchedule.test.js` | 연말 경계·진행 중 기간·오늘 포함·월 그룹·D-day |
| 테스트 | `pages/parent/__tests__/*.test.js` | 온보딩 유효성·시트 상태(신청 가능/완료/마감/확인 대기/휴관일)·취소 확인 |
| 테스트 | `App.routing.test.js` 보강 | 학부모가 `/students` → `/parent/schedule`, 선생님이 `/parent/schedule` → `/`(선생님 트리 `*` → `/`) |

**완료 조건** §8 수용 기준 전부. 모바일 360px 가로 스크롤 없음.
**기존 영향** `App.jsx` 분기 한 줄. 선생님 트리 무변경.

### S6. 알림(선택) · 문서 · 정리

- `NOTIFICATION_EVENTS` 에 `EVENT_REGISTRATION`, `sendEventRegistrationKakaoMessage()`(FR-90) — FAQ 알림과 동일 규칙·테스트.
- CLAUDE.md 에 학부모 포털 섹션(역할·가드·초대·이벤트 미러·백필·환경변수) 추가. `docs/parent-portal/README.md` 상태 갱신.
- 기존 `CompetitionForm` 상단에 "이벤트 관리에서 등록하면 학부모에게 바로 보여요" 안내(선택).

## 3. 데이터 안전 검토

| 항목 | 검토 결과 |
|---|---|
| 기존 테이블 변경 | **없음.** `users.role` 값만 `'parent'` 추가(TEXT, 제약 없음). `competitions`·`competition_students`·`students` 스키마 불변 |
| 신규 FK 방향 | 모두 **신규 테이블 → 기존 테이블**(`events.competitionId → competitions`, `parent_children.studentId → students`, `event_registrations.studentId → students`, `parent_accounts.teacherId → users`). 기존 테이블에 제약이 붙지 않으므로 기존 INSERT/UPDATE 경로에 영향 없음. 기존 행 삭제 시 CASCADE/SET NULL 로 신규 테이블만 정리된다 |
| 백필 | `INSERT INTO events … SELECT … FROM competitions c WHERE NOT EXISTS(…)` — 읽기는 `competitions`, 쓰기는 `events` 만. 재실행 안전. `registrationOpen=FALSE` 라 학부모가 옛 대회에 신청할 수 없다 |
| 미러 동기화 실패 | 대회 작업은 성공 응답, 미러 누락은 다음 부팅 백필(생성) 또는 선생님이 이벤트 관리에서 수정 시 재동기화(수정) |
| 옛 운영 코드 × 새 데이터 | 새 테이블은 옛 코드가 참조하지 않음. `role='parent'` 행은 옛 코드에서 선생님 취급(§1.6) → **S1 배포 전 운영 DB 에 학부모 계정 생성 금지** |
| 새 코드 × 옛 데이터 | `students.birthdate` 포맷 편차 → `normalizeDate`. `competitions.location` NOT NULL 이라 미러 시 장소 항상 존재. `users.username` 중복 방지 suffix |
| 개인정보 | 학부모 API 응답에 다른 학부모·다른 자녀 정보 없음(컨트롤러 테스트로 고정). 온보딩 동의 문구. 관리자 학부모 목록은 `role='admin'` 만 |
| 롤백 | 코드 롤백만으로 충분. 남은 테이블·행은 무해. 필요 시 `DROP TABLE event_registrations, events, parent_children, parent_accounts, parent_invites` 순서(FK 역순) + `DELETE FROM users WHERE role='parent'` |

## 4. 환경 · 설정

| 항목 | 내용 |
|---|---|
| 환경변수 | 추가 없음(MVP). `APP_URL` 이 초대 링크·카카오 메시지 링크에 쓰임(기존). S6 알림도 기존 카카오 키 사용 |
| 카카오 개발자 콘솔 | 변경 없음(redirect URI 동일, `state` 는 표준 파라미터) |
| Vercel | 변경 없음. Preview 환경의 `DATABASE_URL` 이 운영과 같은지 **확인**(같으면 프리뷰에서 학부모 가입 테스트 금지) |
| 로컬 개발 | **권장: 로컬 Postgres** (`createdb rg_manager`, 루트 `.env` 의 `DATABASE_URL` 교체). 운영 데이터 복제가 필요하면 `pg_dump`/`psql` 로 students·competitions 만 가져온다 |

## 5. 일정(작업 단위) 제안

| 단계 | 규모 | 산출물 |
|---|---|---|
| S1 | 1 PR | 스키마·모델·가드·순수 함수 + 테스트 |
| S2 | 1 PR | 이벤트 API·동기화·백필 + 테스트 |
| S3 | 2 PR | (a) 이벤트 관리 UI (b) 학부모 메뉴 + 관리자 학부모 |
| S4 | 1 PR | 초대·가입·학부모 API + 테스트 |
| S5 | 1~2 PR | 학부모 포털 UI + 테스트 |
| S6 | 1 PR | 알림(선택)·문서 |

PR 은 `main` 기준(이 저장소는 `dev` 브랜치 없음), 머지 즉시 Vercel 배포되므로 **S1 → S2 → S3 → S4 → S5 순서로 머지**한다. S4 머지 전까지 운영에는 학부모 계정이 생기지 않는다.

## 6. 테스트 계획

### 6.1 자동 (각 PR)
- 서버 Jest: 위 표의 신규 테스트 + 기존 334개 유지. 핵심 고정점: **학부모 토큰 403**, **선생님 카카오 흐름 불변**, **백필 멱등**, **미러 실패 무영향**, **신청 조건**, **스코프 404**.
- 클라이언트 Jest: 순수 로직(`parentSchedule`, 옵션 편집기 id), 라우팅(`App.routing.test.js` 역할 분기), 화면 상태.

### 6.2 e2e (Playwright, 수동 → 자동화)
저장소에 Playwright 설정이 없으므로 S5 에서 `client/e2e/parent-portal.spec.js` 와 `playwright.config.js` 를 추가하되, 카카오 OAuth 는 자동화할 수 없어 **테스트용 로그인 우회**(`NODE_ENV=test` 에서만 열리는 `POST /api/auth/test-login`)를 두고 CI 외 로컬에서만 실행. 시나리오: 초대 → 온보딩 → 일정 → 신청 → 취소 → 선생님 신청 현황 → 확정 → 참가 학생 화면 확인.

### 6.3 수동 회귀 체크리스트 (단계마다)
- 선생님: 로그인(비밀번호·카카오), 학생/수업/출석, **대회 등록·수정·삭제(옛 화면)**, 참가 학생·종목·참가비 토글, 학생별 대회, FAQ·대화 내역, 설정.
- 관리자: `/admin/*` 전 메뉴, 사용자 목록, 데이터 이전.
- 학부모 공개 채팅 `/chat/:publicId` (비로그인) 정상.

## 7. 리스크 레지스터

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | 공유 DB 에서 가드 배포 전 학부모 계정 생성 | 학부모가 운영 선생님 UI/API 사용 가능 | 로컬 DB 개발, S1 선배포, S4 전까지 운영에 학부모 없음 |
| R2 | `/api/auth/kakao` IP 당 20회 | 단체 가입 시 차단 | 60으로 상향 또는 GET 제외, 응답 메시지 개선 |
| R3 | `rejectParents` 예외 목록 누락 | 학부모가 `verify`·초대 API 에서 403 → 로그인 루프 | 예외 목록 테스트(`verify`, `kakao/*`, `invite/*`, `parent/*`, `chat/public/*`, `faq-files/:id/view`) |
| R4 | 미러 동기화로 옛 `CompetitionForm` 등록이 학부모 일정에 노출 | 준비 중 대회가 보일 수 있음 | 미러는 `registrationOpen=FALSE`; 비공개가 필요하면 이벤트 관리에서 끈다(안내문) |
| R5 | 동명이인·오타로 자동 연결 오류 | 남의 아이에 연결 | 정확 일치 + 단일 매칭만 자동, 그 외 확인 대기; 연결 해제 가능; 로그 |
| R6 | 연말 경계("올해 남은 일정") | 12월에 내년 이벤트 안 보임 | FR-49(선택) — 내년 일정 섹션 |
| R7 | Vercel 함수 시간 | 신청 현황 집계·월 조회는 단순 쿼리 | 인덱스(`events(userId,date)`, `event_registrations(eventId,status)`) |
| R8 | 선생님 삭제·데이터 이전 시 학부모 고아 | 소속 없는 학부모 계정 | `transferData`·`deleteUser` 보강(S4) + 테스트 |
| R9 | `App.jsx` 학부모 분기 위치 오류 | 선생님 라우팅 회귀 | 분기 1줄 + `App.routing.test.js` 양방향 케이스 |
| R10 | Preview 배포가 운영 DB | 프리뷰 테스트가 운영 데이터 오염 | 환경변수 확인, S4 이후 프리뷰에서 가입 금지 |

## 8. 시작 체크리스트

- [ ] 로컬 Postgres 준비 또는 "공유 DB + S1 선배포" 결정
- [ ] Vercel Preview `DATABASE_URL` 확인
- [ ] 브랜치 `feat/parent-portal-s1` 생성(세션 워크트리 규칙대로 같은 디렉터리에서)
- [ ] S1 구현 → 테스트 → PR → 머지 → 운영 콜드스타트 로그에서 테이블 생성 확인
