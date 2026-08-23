# 학부모 포털 — 데이터 모델 · API 설계

> 상태: **초안** · [01-requirements.md](./01-requirements.md) 의 FR 번호를 참조한다.

## 1. 스키마 (PostgreSQL, `server/database.js`)

모든 변경은 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` 로 재실행 안전하게 둔다(NFR-04).
기존 테이블과 같이 시각은 ISO 문자열 `TEXT`, 날짜는 `YYYY-MM-DD` `TEXT`, JSON 은 `TEXT` 에 직렬화한다.

### 1.1 `users` — 역할 추가만

| 변경 | 내용 |
|---|---|
| `role` | 기존 `'admin' | 'user'` 에 **`'parent'`** 추가. 컬럼 타입은 TEXT 라 스키마 변경 없음. `User.create*` 에서 허용값 검증에 `parent` 추가 |
| `password` | 학부모는 비밀번호 로그인 불가. `createWithKakao` 가 넣는 사용 불가 해시를 그대로 둔다(NOT NULL 유지) |

### 1.2 `parent_invites` — 선생님별 초대 링크 (FR-10~15)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `userId` | INTEGER NOT NULL UNIQUE → `users(id)` ON DELETE CASCADE | 선생님. **선생님당 1행** |
| `token` | TEXT NOT NULL UNIQUE | `generatePublicId()`; 재발급 시 교체 |
| `expiresAt` | TEXT NULL | 선택 만료 (FR-14) |
| `createdAt`, `updatedAt` | TEXT NOT NULL | |

### 1.3 `parent_accounts` — 학부모 ↔ 선생님 (FR-22)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `userId` | INTEGER PK → `users(id)` ON DELETE CASCADE | 학부모 계정 |
| `teacherId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 초대한 선생님. 선생님 삭제 시 학부모 계정은 남지만 소속이 없어지므로 실제로는 함께 삭제(CASCADE) |
| `inviteId` | INTEGER NULL → `parent_invites(id)` ON DELETE SET NULL | 어떤 링크로 왔는지 (재발급 추적용) |
| `lastLoginAt` | TEXT NULL | 학부모 메뉴 표시용 (FR-83) |
| `createdAt` | TEXT NOT NULL | 가입일 |

> 학부모 1명 = 선생님 1명. 같은 카카오 계정으로 다른 선생님 초대 링크를 타면 "이미 ○○ 선생님 소속입니다" 로 거절한다(MVP).

### 1.4 `parent_children` — 학부모의 자녀 (FR-30~37)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `parentUserId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | |
| `studentId` | INTEGER NULL → `students(id)` ON DELETE SET NULL | 연결된 학생. 학생 삭제 시 NULL + `status='unlinked'` (FR-36; 트리거 대신 `Student.delete` 에서 갱신) |
| `childName` | TEXT NOT NULL | 학부모가 입력한 이름(원문 보존) |
| `childBirthdate` | TEXT NOT NULL | `YYYY-MM-DD` |
| `status` | TEXT NOT NULL | `'linked'` / `'pending'` / `'unlinked'` |
| `linkedAt` | TEXT NULL | 자동/수동 연결 시각 |
| `linkedBy` | TEXT NULL | `'auto'` / `'teacher'` |
| `createdAt` | TEXT NOT NULL | |

제약: `UNIQUE ("parentUserId", "studentId")` (NULL 은 중복 허용되므로 pending 여러 건 가능).
인덱스: `("studentId")` — 학생 화면의 "연결된 학부모 n명" (FR-84).

### 1.5 `events` — 일정의 단일 출처 (FR-60~68)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `userId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 선생님 |
| `type` | TEXT NOT NULL | `'competition'` / `'special'` / `'closure'` (등록 후 변경 불가) |
| `title` | TEXT NOT NULL | 이벤트 이름 (100자) |
| `date` | TEXT NOT NULL | 시작일 `YYYY-MM-DD` |
| `endDate` | TEXT NULL | 종료일(기간 이벤트, 주로 휴관일). NULL 이면 하루 |
| `startTime` | TEXT NULL | `HH:mm`. NULL 이면 종일 |
| `location` | TEXT NULL | 휴관일은 NULL |
| `description` | TEXT NULL | 1000자, 텍스트만 |
| `options` | TEXT NOT NULL DEFAULT '[]' | JSON `[{ "id": "opt_x7k2", "label": "개인전" }, …]` (FR-64). id 불변 |
| `requireOption` | BOOLEAN DEFAULT FALSE | 신청 시 옵션 1개 이상 필수 (FR-52) |
| `isPublished` | BOOLEAN DEFAULT TRUE | 학부모 공개 (FR-48) |
| `registrationOpen` | BOOLEAN DEFAULT TRUE | 접수 받기. 휴관일은 의미 없음 |
| `registrationDeadline` | TEXT NULL | ISO 시각. NULL 이면 이벤트 시작 전까지 (FR-53) |
| `competitionId` | INTEGER NULL UNIQUE → `competitions(id)` ON DELETE CASCADE | **대회형만.** 기존 대회 행과 1:1 (FR-65) |
| `createdAt`, `updatedAt` | TEXT NOT NULL | |

인덱스: `("userId", "date")`, `("competitionId")`.

**`competitions` 와의 관계 (FR-65~67)**

- 대회형 이벤트는 **항상** `competitions` 행을 동반한다. 생성 시 같은 트랜잭션에서 `competitions(name, date, location, userId)` 를 먼저 만들고 `events.competitionId` 에 건다.
- 이름·날짜·장소는 두 곳에 있지만 **쓰기는 `EventService.saveCompetitionEvent()` 한 함수만** 거친다. 기존 `competitionController.create/update` 도 이 함수를 호출하도록 바꿔 어느 화면에서 고쳐도 동기화된다.
- 삭제: 이벤트 삭제 → `competitions` 삭제(명시적) → `competition_students`·`event_registrations` CASCADE. 기존 대회 화면에서 삭제해도 `events.competitionId` FK CASCADE 로 이벤트가 함께 지워진다.
- **백필**(FR-67): `INSERT INTO events (…) SELECT … FROM competitions c WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e."competitionId" = c.id)`, `type='competition'`, `isPublished=TRUE`, `registrationOpen=FALSE`. `initDatabase()` 안에서 매 부팅마다 돌아도 멱등.

### 1.6 `event_registrations` — 학부모 신청 (FR-50~58, 70~74)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `eventId` | INTEGER NOT NULL → `events(id)` ON DELETE CASCADE | |
| `studentId` | INTEGER NOT NULL → `students(id)` ON DELETE CASCADE | 자녀 (연결된 학생). 연결되지 않은 자녀는 신청 불가이므로 NOT NULL |
| `parentUserId` | INTEGER NULL → `users(id)` ON DELETE SET NULL | 신청한 학부모. 선생님 대리 신청이면 NULL + `createdBy='teacher'` (FR-74) |
| `optionIds` | TEXT NOT NULL DEFAULT '[]' | JSON 배열. `events.options[].id` |
| `status` | TEXT NOT NULL | `'registered'` / `'cancelled'` / `'confirmed'` (대회 확정, FR-72) |
| `confirmedAt` | TEXT NULL | |
| `cancelledAt` | TEXT NULL | 취소 시각. 재신청 시 NULL 로 |
| `cancelledAfterConfirm` | BOOLEAN DEFAULT FALSE | 확정 후 취소 경고 배지 (FR-56) |
| `createdBy` | TEXT NOT NULL DEFAULT 'parent' | `'parent'` / `'teacher'` |
| `createdAt`, `updatedAt` | TEXT NOT NULL | |

제약: `UNIQUE ("eventId", "studentId")` — 자녀당 이벤트 1행. 취소·재신청은 같은 행의 `status` 만 바꾼다(FR-55, 57).
인덱스: `("eventId", "status")`.

### 1.7 `notification_settings` — 이벤트 추가 (FR-90)

`NOTIFICATION_EVENTS` 에 `{ eventType: 'EVENT_REGISTRATION', label: '이벤트 신청 알림', description: '학부모가 일정에 신청·취소하면 선생님에게 알립니다.' }` 추가. 행이 없으면 켜짐(기존 규칙).

## 2. 서버 구성

| 파일 | 역할 |
|---|---|
| `models/ParentInvite.js` | getOrCreate(userId), getByToken, regenerate |
| `models/ParentAccount.js` | create, getByUserId(with teacher), listByTeacher(with children), touchLogin, delete |
| `models/ParentChild.js` | create, listByParent, findMatches(teacherId, name, birthdate), link(id, studentId, by), unlink, markUnlinkedByStudent(studentId) |
| `models/Event.js` | CRUD(userId scope), listUpcomingForParent(teacherId, fromDate, toDate), getForTeacher(id, userId, role) |
| `models/EventRegistration.js` | upsertRegistered, cancel, confirm, listByEvent, mapByEventIdsForStudents(eventIds, studentIds) |
| `services/eventService.js` | `saveCompetitionEvent()` (events ↔ competitions 동기화, 트랜잭션), `canRegister(event, now)` 순수 함수, `backfillCompetitionEvents()` |
| `services/parentOnboarding.js` | `matchChild()` — 이름 공백 제거·생년월일 정규화 후 정확히 1명이면 linked |
| `controllers/parentInviteController.js` | 선생님: 링크 조회/재발급. 공개: 토큰 검증 |
| `controllers/parentController.js` | 학부모: me, children, events(upcoming), event detail, register/update/cancel |
| `controllers/eventController.js` | 선생님: 이벤트 CRUD, registrations, confirm, 대리 신청 |
| `controllers/parentAdminController.js` | 선생님: 학부모 목록, 자녀 연결/해제, 학부모 삭제 |
| `controllers/authController.js` (수정) | `getKakaoAuthUrl(invite)`, `kakaoCallback(code, state)` 의 학부모 분기 (FR-21~25) |
| `middleware/roles.js` (신규) | `requireRole(...roles)`, `rejectParents` |
| `utils/kakaoMessage.js` (수정) | `sendEventRegistrationKakaoMessage()` (FR-90) |
| `routes/parent.js`, `routes/events.js`, `routes/parentInvite.js` (신규) | 아래 API |

`server.js` 에서 기존 모든 인증 라우터에 `rejectParents` 를 끼운다 (FR-03). `/api/auth/*`, `/api/chat/public/*`, `/api/invite/*`, `/api/parent/*` 는 예외.

## 3. REST API

응답 형식·에러 메시지는 기존 컨트롤러 관례(`{ error: '…' }`, 한국어)를 따른다. 🔓 = 비로그인, 👩‍🏫 = 선생님/시스템 관리자 토큰, 👪 = 학부모 토큰.

### 3.1 초대 · 가입

| 메서드 · 경로 | 권한 | 설명 |
|---|---|---|
| `GET /api/invite/:token` | 🔓 | 토큰 검증. `{ teacherName, valid: true }` 또는 404. 선생님 id 는 노출하지 않는다 (FR-20) |
| `GET /api/auth/kakao/url?invite=<token>` | 🔓 | 기존 엔드포인트에 `invite` 쿼리 추가. 유효하면 카카오 URL 의 `state` 에 토큰을 싣는다 (FR-21) |
| `POST /api/auth/kakao/callback` `{ code, state? }` | 🔓 | 기존 + 학부모 분기. 응답 `{ token, user, role, isNewUser, needsOnboarding }` (FR-22~24). 선생님 카카오로 초대 링크 진입 시 409 `이미 선생님 계정으로 사용 중인 카카오 계정입니다.` |

### 3.2 학부모 (`/api/parent/*`, 👪)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /api/parent/me` | `{ user: { id, username }, teacher: { name, channelName }, children: [{ id, childName, childBirthdate, status, studentId, studentName }] }` |
| `POST /api/parent/children` `{ children: [{ name, birthdate }] }` | 온보딩·추가. 각 항목 매칭 후 `status` 와 함께 반환 (FR-30~33) |
| `GET /api/parent/events?upcoming=1` | **오늘(KST)~올해 12/31** 의 공개 이벤트 + 내 자녀별 신청 상태. 응답 항목: `{ id, type, title, date, endDate, startTime, location, hasOptions, registrationState: 'open'|'closed'|'none', registrations: [{ childId, studentName, status, optionIds }] }` (FR-42~46). `?includeNextYear=1` 은 FR-49 용 선택 |
| `GET /api/parent/events/:id` | 상세: 설명·옵션 전체·신청 가능 여부와 사유(`canRegister`, `reason`) (FR-50~53) |
| `PUT /api/parent/events/:id/registrations/:childId` `{ optionIds }` | 신청 또는 옵션 변경(upsert). 서버가 `canRegister` 재검증, `requireOption` 검증. 200 `{ status: 'registered', optionIds }` (FR-52~54, 57) |
| `DELETE /api/parent/events/:id/registrations/:childId` | 취소(`status='cancelled'`). 확정 상태였으면 `cancelledAfterConfirm=true` (FR-55~56) |

모든 `:id`/`:childId` 는 본인 선생님 이벤트·본인 자녀인지 확인하고 아니면 404 (FR-58).

### 3.3 선생님 — 이벤트 (`/api/events`, 👩‍🏫)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /api/events?type=&includePast=` | 본인(시스템 관리자는 `filterUserId`) 이벤트 + `registrationCount`(활성 신청 수) |
| `POST /api/events` | 생성. `type='competition'` 이면 `competitions` 동반 생성 (FR-63~65). `logAction('CREATE_EVENT')` |
| `GET /api/events/:id` | 상세 |
| `PUT /api/events/:id` | 수정(`type` 변경 거부). 옵션 삭제 시 `removedOptionRegistrations` 수를 응답에 담아 경고 표시 (FR-64) |
| `DELETE /api/events/:id` | 삭제(대회형은 `competitions` 함께) (FR-66) |
| `GET /api/events/:id/registrations` | 신청 현황: 행 + 옵션별 집계 (FR-70~71) |
| `PUT /api/events/:id/registrations/:regId/confirm` | 대회 확정 → `competition_students` 추가 (FR-72). `POST …/registrations/confirm-all` 일괄 |
| `PUT /api/events/:id/registrations/student/:studentId` `{ optionIds }` / `DELETE` 동일 경로 | 선생님 대리 신청/취소 (FR-74, 선택) |

기존 `/api/competitions/*` 는 그대로 두되 `create/update/delete` 는 `eventService` 를 경유한다.

### 3.4 선생님 — 초대 링크 · 학부모 관리 (👩‍🏫)

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /api/parent-invite` | 없으면 생성. `{ token, url, createdAt, expiresAt }` (FR-10) |
| `POST /api/parent-invite/regenerate` | 토큰 교체 (FR-13) |
| `GET /api/parents?filterUserId=` | 본인 학부모 목록 + 자녀·상태·마지막 로그인 + 요약 수치 (FR-81~83). `filterUserId` 는 `role==='admin'` 만(기존 `competitions` 의 관리자 필터 패턴, FR-88). 학생별 보기는 같은 데이터를 클라이언트에서 학생 기준으로 뒤집는다(학생 목록은 기존 `GET /api/students`) |
| `POST /api/parents/:userId/children` `{ studentId }` | 선생님이 학부모에 학생 연결을 **직접 추가**(`linked`, `linkedBy='teacher'`) (FR-83~84) |
| `PUT /api/parents/children/:childId/link` `{ studentId }` | 확인 대기 자녀를 수동 연결. 학생이 본인 소유인지 확인 (FR-83~84) |
| `DELETE /api/parents/children/:childId/link` | 연결 해제 → `pending` |
| `DELETE /api/parents/:userId` | 학부모 삭제 (FR-86) |

### 3.5 알림 (FR-90, 선택)

`parentController` 의 register/update/cancel 성공 후 `sendEventRegistrationKakaoMessage({ userId: teacherId, eventTitle, childName, optionLabels, action })` 를 **응답 전에 기다리되 실패는 무시**한다(FAQ 알림과 동일 규칙). 버튼 링크 `${APP_URL}/events/:id/registrations`.

## 4. 핵심 판정 로직 (순수 함수, 테스트 대상)

```js
// services/eventService.js
export const canRegister = (event, child, now = Date.now()) => {
  if (event.type === 'closure') return { ok: false, reason: 'none' };
  if (!event.isPublished) return { ok: false, reason: 'hidden' };
  if (!event.registrationOpen) return { ok: false, reason: 'closed' };
  if (event.registrationDeadline && now >= Date.parse(event.registrationDeadline))
    return { ok: false, reason: 'deadline' };
  if (now >= eventStartMs(event)) return { ok: false, reason: 'started' }; // 시간 없으면 당일 00:00 KST
  if (!child || child.status !== 'linked') return { ok: false, reason: 'child_pending' };
  return { ok: true };
};

// services/parentOnboarding.js
export const matchChild = (students, { name, birthdate }) => {
  const n = name.replace(/\s+/g, '');
  const b = normalizeDate(birthdate);            // '2018-3-5' → '2018-03-05'
  const hits = students.filter(s => s.name.replace(/\s+/g, '') === n && normalizeDate(s.birthdate) === b);
  return hits.length === 1 ? { status: 'linked', studentId: hits[0].id } : { status: 'pending' };
};

// client/src/utils/parentSchedule.js
export const filterRemainingThisYear = (events, todayKst) => …; // date 또는 endDate 가 오늘 이상이고 연도가 올해
export const groupByMonth = (events) => …;                     // [{ month: '9월', events }]
export const dDay = (event, todayKst) => …;                     // '오늘' | 'D-3' | '진행 중'
```

## 5. 프론트 라우트 · 컴포넌트

| 경로 | 가드 | 컴포넌트 |
|---|---|---|
| `/invite/:token` | 없음 | `pages/parent/InviteLanding.jsx` |
| `/oauth/kakao/callback` | 없음 | 기존 `KakaoCallback.jsx` (state 전달, 역할 분기) |
| `/parent` → `/parent/schedule` | `ParentRoute` | `components/parent/ParentLayout.jsx` (`parentNavLinks = [{ path: '/parent/schedule', label: '일정', icon: '📅' }]`) |
| `/parent/onboarding` | `ParentRoute` | `pages/parent/ParentOnboarding.jsx` |
| `/parent/schedule` | `ParentRoute` | `pages/parent/ParentSchedule.jsx` + `EventCard.jsx` + `EventDetailSheet.jsx` |
| `/parent/settings` | `ParentRoute` | `pages/parent/ParentSettings.jsx` |
| `/events` | `ProtectedRoute`(선생님) | `pages/Events/EventList.jsx` |
| `/parents` | `ProtectedRoute`(선생님) | `pages/Parents/ParentList.jsx` (학부모별 `ParentsByParent.jsx` / 학생별 `ParentsByStudent.jsx`, 초대 링크 박스) |
| `/admin/parents` | `AdminRoute` | `pages/admin/AdminParents.jsx` — 사용자(선생님) 필터 + 전체 학부모 목록 (FR-88). `AdminLayout.adminMenuItems` 에 `학부모` 추가 |
| `/events/new`, `/events/edit` | 〃 | `pages/Events/EventForm.jsx` + `OptionsEditor.jsx` |
| `/events/:id/registrations` | 〃 | `pages/Events/EventRegistrations.jsx` (데스크톱은 목록 우측 패널) |
| `/competitions` | 〃 | → `/events` 리다이렉트. `/competitions/new|edit|manage` 유지 |

`App.jsx`: `navLinks` 의 `{ path: '/competitions', label: '대회 관리', icon: '🏆' }` → `{ path: '/events', label: '이벤트 관리', icon: '📅' }`, 그리고 `{ path: '/parents', label: '학부모', icon: '👨‍👩‍👧' }` 추가.
`ProtectedRoute` 는 `user.role === 'parent'` 면 `/parent/schedule` 로, `ParentRoute` 는 학부모가 아니면 `/` 로 보낸다 (FR-05).
`AuthContext.kakaoLogin(code, state)` 가 `state` 를 넘기고, 응답의 `role`/`needsOnboarding` 으로 이동한다.

## 6. 마이그레이션 순서

1. `users.role='parent'` 허용 (코드만)
2. `parent_invites`, `parent_accounts`, `parent_children` 생성
3. `events`, `event_registrations` 생성 + 인덱스
4. `competitions` → `events` 백필 (멱등)
5. `NOTIFICATION_EVENTS` 에 `EVENT_REGISTRATION` 추가 (행 없음 = 켜짐)

로컬과 운영이 **같은 Supabase DB** 를 쓰므로(CLAUDE.md), 로컬 서버를 띄우는 순간 2~4 가 운영 DB 에 적용된다. 백필은 `registrationOpen=FALSE` 라 학부모 화면이 아직 없어도 부작용이 없다.

## 7. 확장 요구사항을 위한 스키마 스케치 (01 §10, 2026-08-23 결정 반영)

MVP 스키마가 나중 단계를 막지 않도록 방향만 적어 둔다. 컬럼·제약은 해당 단계 설계 때 확정한다.

| 단계 | 테이블 / 변경 | 요지 |
|---|---|---|
| 2차 | `events` +`privateNote`, +`costumeNote`, +`attachments TEXT`(JSON `[{type:'image'|'pdf'|'link', url, name}]`) | §10.1. 종목은 별도 컬럼 없이 옵션으로 |
| 2차 | `competition_students` +`costumeFeePaid BOOLEAN DEFAULT FALSE` | 의상비 토글(선택), 학부모 노출 없음 |
| 2차~ | `parent_notifications(id, parentUserId, type, title, body, link, readAt, createdAt)` | §10.7 앱 내 알림(알림톡 없음) |
| 2차 후반 | `chat_sessions` +`parentUserId INTEGER NULL → users(id) ON DELETE CASCADE`, 인덱스 `(channelId, parentUserId)` | §10.5 FAQ 채팅 통합. `visitorKey = 'parent:<userId>'` |
| 3차 | `CREATE EXTENSION IF NOT EXISTS vector` (Supabase pgvector) | 얼굴 임베딩 거리 질의 |
| 3차 | `events` +`driveFolderId TEXT`, +`photosSyncedAt`; `event_photos(id, eventId, driveFileId UNIQUE, name, thumbnailUrl, takenAt, isPublic, faceStatus('pending'|'done'|'failed'), syncedAt)` | Drive 공개 폴더 + `GOOGLE_API_KEY` |
| 3차 | `photo_faces(id, photoId → event_photos CASCADE, box TEXT(JSON x,y,w,h), descriptor vector(128))` | 앨범 사진 속 얼굴 **벡터·위치만**(이미지 없음) |
| 3차 | `child_face_profiles(id, childId → parent_children CASCADE, studentId, storagePath(Supabase child-faces, 비공개), descriptor vector(128), createdAt)` | 학부모가 올린 기준 얼굴(1~3행/자녀) |
| 3차 | `photo_tags(id, photoId, studentId, source('face'|'manual'|'parent_confirmed'), distance REAL NULL, createdBy, createdAt, UNIQUE(photoId, studentId))` | 자동 태그(거리 ≤0.5), 후보(0.5~0.6 은 `source='candidate'` 로 두거나 조회 시 계산), 수동 태그 우선 |
| 4차 | `posts(id, userId, title, body, attachments, isPinned, isPublished, createdAt, updatedAt)`, `post_reads(postId, parentUserId, readAt)` | 게시판(공지 전용·댓글 없음 권장) |

**얼굴 매칭 질의 예** (자녀 1명 ↔ 앨범 전체):

```sql
SELECT f."photoId", MIN(f.descriptor <-> p.descriptor) AS distance
FROM photo_faces f
JOIN event_photos ph ON ph.id = f."photoId"
JOIN events e ON e.id = ph."eventId" AND e."userId" = $teacherId
JOIN child_face_profiles p ON p."studentId" = $studentId
GROUP BY f."photoId"
HAVING MIN(f.descriptor <-> p.descriptor) <= 0.6;
```

**얼굴 분석 API 스케치**: `POST /api/events/:id/photos/analyze { batch: 5 }` → `pending` 사진 5장을 Drive 에서 내려받아(2,000px 축소) face-api.js 로 검출·임베딩 → `photo_faces` 저장 → `{ processed, remaining }` 반환. 클라이언트는 `remaining > 0` 인 동안 반복 호출한다. 모델 파일은 `server/models-face/` 에 동봉하고 첫 호출에 메모리에 올린다(Vercel 인스턴스가 따뜻한 동안 재사용).
