# 계정 · 역할 · 초대 체계 — 데이터 모델 · API 설계

> 상태: **초안 — 2026-08-30** · [01-requirements.md](./01-requirements.md) 의 FR 번호를 참조한다.
> 원칙: 모든 스키마 변경은 `initDatabase()` 에 **멱등** 문장으로 넣고(NFR-301), 기존 컬럼은 **지우지 않는다**. 백필은 `INSERT … WHERE NOT EXISTS` / `UPDATE … WHERE 컬럼 IS NULL` 이라 재실행해도 같다.

## 1. 스키마 (PostgreSQL, `server/database.js`)

### 1.1 `users` — 제약만 바뀐다 (FR-310)

| 변경 | 내용 |
|---|---|
| **제거** | `users_kakaoId_key` — `ADD COLUMN IF NOT EXISTS "kakaoId" TEXT UNIQUE` 가 만든 단일 UNIQUE. 이름은 로컬 DB `pg_constraint` 로 확인했다. 운영도 같은 문장이라 같아야 하지만 배포 전 확인(03 §4.2) |
| **추가** | `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_role ON users ("kakaoId", role) WHERE "kakaoId" IS NOT NULL` |
| 컬럼 | **없음**. `role` 은 TEXT 라 `'admin' \| 'user' \| 'parent'` 그대로 |

```sql
-- 인덱스를 먼저 만들어 제약이 사라지는 사이에도 중복이 생기지 않게 한다
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_role
  ON users ("kakaoId", role) WHERE "kakaoId" IS NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_kakaoId_key";
```

### 1.2 `teacher_invites` — 선생님 초대 (관리자 발급, 일회용) (FR-340~348)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `token` | TEXT NOT NULL UNIQUE | `generatePublicId()` — 학부모 초대와 같은 생성기 |
| `createdBy` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 발급한 관리자 |
| `label` | TEXT NULL | 메모("김리듬 선생님에게"). 목록에서 누구에게 준 링크인지 알아보려고 |
| `expiresAt` | TEXT NULL | ISO 시각. 기본 발급 시각 + **14일**. NULL 이면 무기한 |
| `usedByUserId` | INTEGER NULL → `users(id)` ON DELETE SET NULL | 이 초대로 만들어진 선생님 계정 |
| `usedAt` | TEXT NULL | 사용 시각. NULL 이면 미사용 |
| `revokedAt` | TEXT NULL | 회수 시각. NULL 이 아니면 무효 |
| `createdAt` | TEXT NOT NULL | |

인덱스: `("createdBy")`. 상태는 컬럼이 아니라 **파생**이다 — `revokedAt` 있으면 `revoked`, `usedAt` 있으면 `used`, `expiresAt` 지났으면 `expired`, 아니면 `pending`.

> 학부모 초대(`parent_invites`)는 **선생님당 1개 재사용** 링크라 구조가 다르다. 선생님 초대는 고권한 계정을 만들므로 **1회용 + 회수**로 둔다.

### 1.3 `parent_teachers` — 학부모 ↔ 선생님 다대다 (FR-350~352)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `parentUserId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 학부모 계정 |
| `teacherId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 선생님 계정 |
| `inviteId` | INTEGER NULL → `parent_invites(id)` ON DELETE SET NULL | 어떤 링크로 연결됐는지 |
| `createdAt` | TEXT NOT NULL | 연결 시각 |

제약: `UNIQUE ("parentUserId", "teacherId")`. 인덱스: `("teacherId")`.

**백필** (기존 단일 소속을 옮긴다):

```sql
INSERT INTO parent_teachers ("parentUserId", "teacherId", "inviteId", "createdAt")
SELECT a."userId", a."teacherId", a."inviteId", a."createdAt"
  FROM parent_accounts a
 WHERE a."teacherId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM parent_teachers t
                    WHERE t."parentUserId" = a."userId" AND t."teacherId" = a."teacherId");
```

### 1.4 `parent_accounts` — 유지 (의미만 바뀜)

| 컬럼 | 변경 |
|---|---|
| `userId` (PK), `lastLoginAt`, `createdAt` | 그대로. **학부모 프로필 행** 역할 |
| `teacherId` | **대표 선생님**(가장 먼저 연결된 선생님)으로 남긴다. 새 코드는 읽지 않고 `parent_teachers` 만 본다. 배포 중간 상태에서 옛 코드가 읽어도 깨지지 않게 채워 둔다 |
| `inviteId` | 그대로(대표 연결의 초대) |

> 컬럼을 지우지 않는 이유: `NOT NULL` 이라 롤백이 어렵고, 배포 사이의 옛 코드가 이 컬럼을 읽는다. **후속 정리 과제**로 남긴다.

### 1.5 `parent_children` — `teacherId` 추가 (FR-354~356)

| 변경 | 내용 |
|---|---|
| **추가** | `ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS "teacherId" INTEGER` + FK `→ users(id) ON DELETE CASCADE` (별도 `ADD CONSTRAINT` 는 멱등이 아니므로 **FK 없이 컬럼만** 두고 애플리케이션이 보장한다) |
| 의미 | 이 자녀가 **어느 선생님의 학생인지**. 연결 전(`pending`)에도 알 수 있어야 매칭·표시가 된다 |
| 인덱스 | `("teacherId")` |

**백필** (연결된 학생의 소유 선생님 → 없으면 학부모의 대표 선생님):

```sql
UPDATE parent_children c
   SET "teacherId" = COALESCE(
         (SELECT s."userId" FROM students s WHERE s.id = c."studentId"),
         (SELECT a."teacherId" FROM parent_accounts a WHERE a."userId" = c."parentUserId"))
 WHERE c."teacherId" IS NULL;
```

기존 UNIQUE 인덱스 `("parentUserId","studentId") WHERE "studentId" IS NOT NULL` 는 그대로 둔다(학생이 곧 선생님을 함의한다).

### 1.6 건드리지 않는 것

`parent_invites`, `events`, `event_registrations`, `competitions`, `google_drive_accounts`, 앨범 관련 표 전부 그대로.

### 1.7 롤백 SQL

```sql
-- 1) 다중 역할 되돌리기 — 한 카카오에 행이 여럿이면 먼저 정리해야 한다
SELECT "kakaoId", array_agg(id || ':' || role) FROM users
 WHERE "kakaoId" IS NOT NULL GROUP BY "kakaoId" HAVING count(*) > 1;
-- (검토 후 추가 행 삭제) → CASCADE 로 parent_accounts·parent_teachers 정리됨
ALTER TABLE users ADD CONSTRAINT "users_kakaoId_key" UNIQUE ("kakaoId");
DROP INDEX IF EXISTS idx_users_kakao_role;

-- 2) 다중 선생님 되돌리기 — 연결이 2개 이상인 학부모를 먼저 확인
SELECT "parentUserId", count(*) FROM parent_teachers GROUP BY 1 HAVING count(*) > 1;
-- parent_accounts."teacherId" 가 대표 선생님으로 계속 채워져 있으므로 옛 코드는 그대로 동작한다
DROP TABLE IF EXISTS parent_teachers;   -- 필요할 때만

-- 3) 선생님 초대 — 두어도 무해
DROP TABLE IF EXISTS teacher_invites;
```

## 2. 모델 · 서비스 · 유틸

### 2.1 `models/User.js`

| 메서드 | 변경 |
|---|---|
| `getByKakaoId(kakaoId, role)` | **시그니처 변경**. `WHERE "kakaoId" = $1 AND role = $2`. role 없이 부르면 `throw` (옛 호출을 테스트에서 잡는다) |
| `listByKakaoId(kakaoId)` | **신규**. `id, username, role, "createdAt"` — 콜백 계정 선택·역할 조회·관리자 목록 묶기 |
| `transferData(from, to)` | `parent_teachers`·`parent_children` 의 `teacherId` 이전 추가(FR-363, §2.6) |
| 나머지 | 변경 없음 |

### 2.2 `models/TeacherInvite.js` — 신규

| 메서드 | 설명 |
|---|---|
| `create({ createdBy, label, expiresAt })` | 토큰 생성 후 INSERT |
| `list()` | 전체 + `usedByUserId` 조인한 사용자 이름, `createdAt` 내림차순 |
| `getByToken(token)` | 관리자 이름(`createdBy` 조인) 포함 |
| `isUsable(invite, now)` | `!revokedAt && !usedAt && (!expiresAt || now < expiresAt)` — **순수 함수**, 단위 테스트 대상 |
| `markUsed(id, userId)` | `usedAt`·`usedByUserId` 설정. `WHERE id = $1 AND "usedAt" IS NULL RETURNING id` 로 **경합 시 1명만** 성공 |
| `revoke(id)` | `revokedAt` 설정 (`WHERE "usedAt" IS NULL`) |

### 2.3 `models/ParentTeacher.js` — 신규

| 메서드 | 설명 |
|---|---|
| `link({ parentUserId, teacherId, inviteId })` | `INSERT … ON CONFLICT ("parentUserId","teacherId") DO NOTHING RETURNING *` |
| `unlink(parentUserId, teacherId)` | DELETE |
| `listTeachers(parentUserId)` | `[{ teacherId, teacherName, createdAt }]` — 이름은 `users` 조인 |
| `teacherIds(parentUserId)` | `number[]` — 스코프 질의용 |
| `isLinked(parentUserId, teacherId)` | boolean |
| `listParents(teacherId)` | 선생님의 학부모 id 목록 |
| `unlinkAllByTeacher(teacherId)` | 선생님 삭제 시 |
| `orphanParentIds()` | 연결이 하나도 없는 학부모 `users.id` (선생님 삭제 뒤 정리, FR-362) |

### 2.4 `models/ParentAccount.js` — 변경

| 메서드 | 변경 |
|---|---|
| `create({ userId, teacherId, inviteId })` | 프로필 행 upsert(현행) **＋** `ParentTeacher.link` 호출. `teacherId` 컬럼은 **비어 있을 때만** 채운다(대표 선생님 고정) |
| `getByUserId(userId)` | 유지하되 `teacherName` 대신 **프로필만**. 선생님 정보는 `ParentTeacher.listTeachers` 로 |
| `listByTeacher(teacherId)` | `parent_accounts` ↔ `parent_teachers` 조인으로 변경. 자녀는 **그 선생님의 자녀만**(`parent_children."teacherId" = $1`) 담는다 — 다른 선생님 자녀가 보이면 안 된다 |
| `listAll()` | 학부모별로 **연결된 선생님 배열**과 자녀 전부(각 자녀에 선생님 이름) |
| `deleteByTeacher(teacherId)` | **의미 변경**: 연결만 지우고, 연결이 하나도 남지 않은 학부모 `users` 행만 삭제(FR-362) |
| `delete(userId)` | 그대로(`users` 삭제 → CASCADE) |

### 2.5 `models/ParentChild.js` — 변경

| 메서드 | 변경 |
|---|---|
| `create({ …, teacherId })` | `teacherId` 필수 인자 추가 |
| `listByParent(parentUserId, { teacherIds } = {})` | 선택적 선생님 필터. 반환에 `teacherId`·`teacherName`(users 조인) 추가 |
| `getWithOwner(childId)` | `parent_accounts` 조인 대신 **`c."teacherId"` 를 그대로** 돌려준다 |
| `hasStudent`, `link`, `unlink`, `markUnlinkedByStudent`, `linkedStudentIds` | 변경 없음 |

### 2.6 `models/User.transferData` 추가 문장 (FR-363)

```sql
-- 받는 선생님에게 이미 같은 학부모 연결이 있으면 중복이 되므로 먼저 지운다
DELETE FROM parent_teachers pt
 WHERE pt."teacherId" = $from
   AND EXISTS (SELECT 1 FROM parent_teachers x
                WHERE x."parentUserId" = pt."parentUserId" AND x."teacherId" = $to);
UPDATE parent_teachers SET "teacherId" = $to WHERE "teacherId" = $from;
UPDATE parent_children SET "teacherId" = $to WHERE "teacherId" = $from;
```

기존 `parent_accounts.teacherId` 이전 문장은 그대로 둔다(대표 선생님 유지).

### 2.7 `utils/oauthState.js` — 신규 (순수 함수)

```js
encodeState({ prefer, invite, tinvite })  // → base64url(JSON) { v:1, p, i, t }  — 있는 키만
decodeState(raw)                          // → { prefer, invite, tinvite, legacy }
pickAccount(accounts, prefer)             // prefer 역할 → 없으면 ROLE_PRIORITY 첫 행 → null
ROLE_PRIORITY = ['admin', 'user', 'parent']
```

| 입력 | 결과 |
|---|---|
| 비어 있음 | `{}` |
| base64url JSON, `v===1` | `{ prefer, invite, tinvite }` (`prefer` 가 허용 외면 무시) |
| 그 외 비어 있지 않은 문자열 | `{ invite: raw, legacy: true }` — 옛 학부모 초대 토큰 원문(FR-307) |

### 2.8 `utils/usernames.js` — 신규

`uniqueUsername(base, exists)`: 30자 절단 → `exists(name)` 이면 `_2`…`_99` → 그래도 겹치면 `_<timestamp>`. `exists` 는 `User.getByUsername` 주입(테스트 용이).

### 2.9 `services/roleAccounts.js` — 신규 (전환·만들기·부여 공통)

`issueToken(user)` · `describeRoles(user)` · `createTeacherAccount(fromUser, { invite })` · `createParentAccount(fromUser, { invite, selfTeacherId })` · `createAdminAccount(targetUser)`.
컨트롤러는 이 서비스를 부르고 HTTP 코드만 매긴다.

### 2.10 `services/parentScope.js` — 신규 (다중 선생님 스코프 한 곳으로)

| 함수 | 설명 |
|---|---|
| `teacherIdsOf(parentUserId)` | `ParentTeacher.teacherIds` (캐시 없음) |
| `assertLinked(parentUserId, teacherId)` | 연결 없으면 `null` → 컨트롤러가 404 |
| `scopeEvent(parentUserId, eventId)` | 이벤트를 읽고 `event.userId` 연결 여부까지 확인해 `{ event }` 또는 `null` |

학부모 컨트롤러의 `teacherOf()`(단일 선생님)를 전부 이 모듈로 바꾼다.

## 3. OAuth `state` 와 인가 URL (FR-301, 308, 345)

`GET /api/auth/kakao?prefer=<admin|user|parent>&invite=<학부모토큰>&tinvite=<선생님토큰>`

| 파라미터 | 규칙 |
|---|---|
| `prefer` | 마지막 역할 힌트. 없으면 생략, 허용 외 값은 무시 |
| `invite` | 학부모 초대(현행) |
| `tinvite` | **선생님 초대**(신규) |
| scope | 현행 `talk_message` 유지 |
| `state` | `encodeState({ prefer, invite, tinvite })`. 셋 다 없으면 `state` 생략(현행과 같은 URL) |

카카오 콘솔 redirect URI 변경 없음.

## 4. API

### 4.1 `POST /api/auth/kakao/callback` — 변경 (FR-302~304, 315, 340, 346, 352)

1. `decodeState(state)` → `prefer` · `invite` · `tinvite`
2. `invite` 가 있으면 `ParentInvite.getByToken` + `isUsable` — 무효면 400 (현행)
3. `tinvite` 가 있으면 `TeacherInvite.getByToken` + `isUsable` — 무효면 400 `유효하지 않은 초대 링크입니다.`
4. 카카오 토큰 교환 → `/v2/user/me` (현행)
5. `accounts = User.listByKakaoId(kakaoId)`
6. **판정표(§4.2)**
7. JWT + 응답(성공 시)

성공 응답:

```json
{ "message": "카카오 로그인 성공", "user": { … }, "token": "…", "role": "user",
  "isNewUser": false, "needsOnboarding": false,
  "accounts": [ { "role": "user", "username": "김리듬" }, { "role": "parent", "username": "김리듬_2" } ] }
```

### 4.2 콜백 판정표

| `tinvite` | `invite` | 해당 역할 행 | 처리 | 응답 |
|---|---|---|---|---|
| 유효 | – | 선생님 행 **있음** | 로그인만. **토큰 소비하지 않음**(FR-346). `updateKakaoTokens` | 200 `role:'user'` |
| 유효 | – | 선생님 행 **없음** | `createWithKakao({ role:'user', username:'카카오_<ts>', 토큰 })` → `TeacherInvite.markUsed` (0행이면 409 경합) | 200 `role:'user'`, `isNewUser:true` → `/register-name` |
| 무효/만료/사용됨 | – | – | – | 400 `유효하지 않은 초대 링크입니다.` |
| – | 유효 | 학부모 행 **있음** | `ParentAccount.create` upsert + **`ParentTeacher.link`**(이미 있으면 무변화) → `touchLogin` | 200 `role:'parent'` |
| – | 유효 | 학부모 행 **없음** | `createWithKakao({ role:'parent', username: uniqueUsername(닉네임), 토큰 NULL })` + `ParentAccount.create` + `ParentTeacher.link` | 200 `role:'parent'`, `needsOnboarding:true` |
| – | 무효 | – | – | 400 (현행) |
| – | – | `accounts` **비어 있음** | **아무것도 만들지 않는다** | **403** `{ outcome:'needsInvite', error:'가입에는 초대가 필요합니다.' }` |
| – | – | `accounts` 1개 이상 | `picked = pickAccount(accounts, prefer)`. 선생님·관리자 → `updateKakaoTokens`, 학부모 → `touchLogin` | 200 `role: picked.role` |

- 현행 `if (user && user.role !== 'parent') → 409` 분기는 **삭제**(FR-315).
- `createWithKakao` 가 `23505` 를 던지면(운영에 옛 단일 UNIQUE 가 남아 있음) → 409 `같은 카카오 계정의 다른 역할 계정이 있어 지금은 가입할 수 없습니다. 관리자에게 문의해 주세요.` + `console.error` 에 마이그레이션 미적용 기록(03 §4.2).
- 로그 `KAKAO_LOGIN` 상세: `역할: 선생님 (가입)`.

### 4.3 선생님 초대 (FR-341~348)

| 메서드 | 경로 | 가드 | 설명 |
|---|---|---|---|
| `GET` | `/api/teacher-invites` | `verifyToken` + `requireRole('admin')` | 목록 + 파생 상태 + `url`. **`token` 은 `url` 안에만** |
| `POST` | `/api/teacher-invites` | 〃 | `{ label?, expiresInDays? }`(기본 14, `0`/`null` 이면 무기한) → 201 `{ id, url, label, expiresAt, status:'pending' }` |
| `POST` | `/api/teacher-invites/:id/revoke` | 〃 | 미사용만 회수. 사용된 것은 409 |
| `GET` | `/api/teacher-invite/:token` | **공개** | `{ valid: true, adminName }` 또는 404. 내부 id·이메일은 내려보내지 않는다(FR-348) |

### 4.4 `GET /api/auth/roles` (FR-320)  ·  `POST /api/auth/switch-role` (FR-321)

```json
// GET /api/auth/roles
{ "current": { "id": 12, "role": "user", "username": "김리듬" },
  "kakao": true,
  "accounts": [ { "id": 12, "role": "user", "username": "김리듬" },
                { "id": 31, "role": "parent", "username": "김리듬_2" } ],
  "canCreate": { "user": false, "parent": false, "admin": false },
  "teacherNeedsInvite": true, "parentNeedsInvite": false }
```

- `canCreate.user`: 선생님 행이 없고 `kakao` 일 때 `true`. `teacherNeedsInvite`: 현재 역할이 **관리자가 아니면** `true`(FR-331)
- `canCreate.parent`: 학부모 행이 없고 `kakao` 일 때 `true`. `parentNeedsInvite`: 현재 역할이 **선생님이 아니면** `true`(FR-332)
- `canCreate.admin`: 항상 `false`

`POST /api/auth/switch-role { role }`:

| 조건 | 응답 |
|---|---|
| 현재 역할과 같음 | 200 재발급 |
| `kakaoId` 없음 | 400 |
| 그 역할 행 없음 | 404 `{ canCreate }` |
| 있음 | 200 `{ user, token, role }` (학부모면 `touchLogin`) |

`kakaoId` 는 **`User.getById(req.user.id)`** 에서 읽는다 — 본문 값으로 남의 계정에 갈 수 없다(AC-313).

### 4.5 `POST /api/auth/roles` — 역할 계정 만들기 (FR-330~336)

요청 `{ role: 'user' | 'parent', invite? }`.

| 조건 | 응답 |
|---|---|
| `kakaoId` 없음 | 400 |
| `role === 'admin'` 또는 그 외 값 | 400 |
| `role:'user'`, 선생님 행 이미 있음 | 409 |
| `role:'user'`, **현재 역할 관리자** | 생성(토큰 불필요) → 201 `{ user, token, role:'user', isNewUser:true }` |
| `role:'user'`, 그 외 + `invite` 가 유효한 **선생님 초대** | 생성 + `markUsed` → 201 |
| `role:'user'`, 그 외 + 토큰 없음/무효 | 400 `{ error:'선생님 초대 링크가 필요합니다.', needsInvite:true }` |
| `role:'parent'`, 학부모 행 **있음** + `invite` 유효 | 계정 생성 없이 **`ParentTeacher.link` 만** → 200 `{ linkedTeacher }` (FR-332) |
| `role:'parent'`, 학부모 행 없음 + `invite` 유효 | 생성 + `ParentAccount.create` + `link` → 201 `{ …, needsOnboarding:true }` |
| `role:'parent'`, 토큰 없음 + **현재 역할 선생님** | `teacherId = 현재 id` 로 생성/연결 → 201 |
| `role:'parent'`, 토큰 없음 + 그 외 | 400 `{ needsInvite:true }` |

`invite` 는 토큰 원문 또는 `https://…/invite/<token>` · `https://…/teacher-invite/<token>` 전체를 받는다(마지막 경로 조각 추출).

### 4.6 `POST /api/auth/users/:id/grant-admin` (FR-382) · `DELETE /api/auth/users/:id` (FR-386)

- `grant-admin`: `verifyToken` + `requireRole('admin')`. 대상 `kakaoId` 없으면 400, 관리자 행 이미 있으면 409, 아니면 `createAdminAccount` → 201.
- `deleteUser`: `id === req.user.id` 면 400 `자기 자신은 삭제할 수 없습니다.`

### 4.7 학부모 API — 다중 선생님 반영 (FR-353~359)

| 경로 | 변경 |
|---|---|
| `GET /api/parent/me` | `teacher: { name }` → **`teachers: [{ id, name, since }]`**. 자녀에 `teacherId`·`teacherName` 추가. (옛 클라이언트 호환을 위해 `teacher` 도 대표 선생님으로 함께 내려보낸다 — 한 배포 주기 뒤 제거) |
| `POST /api/parent/children` | 본문에 **`teacherId`** 추가. 연결된 선생님이 아니면 403. 선생님이 1명이면 생략 가능(그 선생님으로). 매칭은 `Student.getAll(teacherId,'user')` 범위(현행 규칙, 범위만 명시) |
| `GET /api/parent/events` | `teacherIds` 전체로 조회. 응답 이벤트에 `teacherId`·`teacherName`, 최상위에 `teachers` 배열. 쿼리 `?teacherId=` 로 필터(선택) |
| `GET /api/parent/events/:id` | `Event.getPublishedForParent(id, teacherIds)` — 연결 밖이면 404 |
| `PUT/DELETE /api/parent/events/:id/registrations/:childId` | 이벤트 소유 선생님과 **연결** + 자녀의 `teacherId` 가 **그 이벤트 소유자와 같아야** 한다(FR-371, AC-323). 알림은 **`event.userId`** 에게(FR-374) |
| `GET /api/parent/albums`, `/events/:id/media*` | 같은 스코프 규칙. 앨범 목록은 `Event.listWithAlbumsForParent(teacherIds)` |
| **신규** `POST /api/parent/teachers` | `{ invite }` — 학부모 화면에서 선생님 추가. 유효하면 `link` → 201 `{ teachers }` (FR-353) |

`Event` 모델의 `listUpcomingForParent(teacherId, …)` · `getPublishedForParent(id, teacherId)` · `listWithAlbumsForParent(teacherId)` 는 **배열을 받도록** 바꾼다(`WHERE "userId" = ANY($1)`).

### 4.8 선생님·관리자 학부모 관리 (FR-360~364, 387)

| 경로 | 변경 |
|---|---|
| `GET /api/parents` | `ParentAccount.listByTeacher` 가 `parent_teachers` 조인. 자녀는 **그 선생님 것만**. 관리자 전체 조회는 학부모별 **선생님 배열** 포함 |
| `POST /api/parents/:userId/children` | 선생님 연결 확인 후 `teacherId` 를 넣어 생성 |
| `PUT/DELETE /api/parents/children/:childId/link` | 권한 판정을 `child.teacherId` 로(현행 `parent_accounts` 조인 대신) |
| **신규** `DELETE /api/parents/:userId/teachers/:teacherId` | 연결 해제(FR-361). 선생님은 자기 자신만, 관리자는 아무 선생님. 계정은 지우지 않는다 |
| `DELETE /api/parents/:userId` | 연결된 선생님만 해제할지 계정을 지울지 → **선생님**은 연결 해제로 동작(자기 권한 밖의 다른 연결을 지울 수 없다), **관리자**만 계정 삭제 |

## 5. 프론트

### 5.1 `AuthContext` · `tokenStorage`

| 함수 | 변경 |
|---|---|
| `getKakaoLoginUrl({ prefer, invite, tinvite })` | 쿼리 조립 |
| `kakaoLogin(code, state)` | 성공 시 `saveLastRole`. 403 `outcome:'needsInvite'` 는 던지지 않고 반환 |
| `logout()` | 마지막 역할은 남긴다 |
| `listRoles()` / `switchRole(role)` / `addRole(role, invite)` | 신규 |
| `tokenStorage` | `saveLastRole` / `getLastRole` (키 `lastRole`, 실패 무시) |

### 5.2 신규 화면 · 컴포넌트

| 파일 | 내용 |
|---|---|
| `utils/roleRoutes.js` | `homePathFor` · `roleLabel` · `ROLE_ORDER` · `afterCreatePath` |
| `components/common/RoleSwitcher.jsx` | `variant: 'menu' \| 'list' \| 'card'`. `listRoles()` 1회 → 보유 역할 전환 / 없는 역할 만들기 / 도움말. 아무것도 없으면 렌더 안 함 |
| `components/common/ParentAccountDialog.jsx` | 선생님이면 [내 학원 학부모로 가입] + 초대 입력, 아니면 초대 입력만 |
| `components/common/TeacherAccountDialog.jsx` | 선생님 계정 만들기 — 관리자면 즉시, 아니면 초대 링크 입력 |
| `pages/TeacherInviteLanding.jsx` | `/teacher-invite/:token` — `InviteLanding` 과 같은 골격 |
| `pages/admin/AdminTeacherInvites.jsx` | `/admin/teachers` — 발급 폼 + 목록 + 복사 + 회수 |
| `pages/login/NeedsInvite.jsx` | `/login?outcome=needsInvite` 안내(Login.jsx 안의 분기로 둬도 된다) |
| `pages/parent/TeacherFilter.jsx` | 선생님 필터 칩(2명 이상일 때만) |

### 5.3 기존 화면 수정

| 파일 | 수정 |
|---|---|
| `App.jsx` | 비로그인 트리에 `/teacher-invite/:token` (공개 화면 분기에도 추가), 헤더 nav·모바일 메뉴에 `RoleSwitcher` |
| `components/admin/AdminLayout.jsx` | 메뉴에 **선생님(`/admin/teachers`)** 추가, 사이드바 푸터에 `RoleSwitcher` |
| `pages/KakaoCallback.jsx` | `role==='admin'` → `/admin`, 403 `needsInvite` → `/login?outcome=needsInvite` |
| `pages/Login.jsx` | `?outcome=needsInvite` 안내 상태, 문구 조정 |
| `pages/parent/ParentSettings.jsx` | 선생님 **목록** + [선생님 추가] + `RoleSwitcher card` |
| `pages/parent/ParentSchedule.jsx` | 선생님 필터 칩 + 카드 선생님 배지 |
| `pages/parent/ParentAlbumList.jsx` | 같은 필터·배지 |
| `pages/parent/ParentOnboarding.jsx` | 선생님 선택 단계(2명 이상일 때) |
| `pages/Parents/ParentList.jsx` | 학부모별 연결 해제 버튼 |
| `pages/admin/AdminParents.jsx` | 선생님 배열 표시·해제 |
| `pages/admin/AdminUsers.jsx` | 배지 3종·같은 카카오 표시·[관리자 계정 추가]·셀렉트 비활성·이전 목록 정리 |
| `pages/Settings.jsx`, `pages/admin/AdminSettings.jsx` | `RoleSwitcher card` |

## 6. 접근 제어 (`server.js`)

| 경로 | 가드 |
|---|---|
| `/api/auth/kakao`, `/kakao/callback`, `/login`, `/verify` | 공개(현행) |
| `/api/teacher-invite/:token` | **공개**(랜딩 확인 전용) |
| `/api/teacher-invites*` | `rejectParents` + `verifyToken, requireRole('admin')` |
| `/api/auth/roles`(GET·POST), `/api/auth/switch-role` | `verifyToken` 만 — **학부모 허용**(`rejectParents` 목록에 넣지 않는다) |
| `/api/auth/users/:id/grant-admin` | 기존 `/api/auth/users` 가드에 이미 포함 + `requireRole('admin')` |
| `/api/parent/*` | 현행(`requireRole('parent')`) |
| `/api/parents/*` | 현행(`rejectParents`) |

## 7. 로그 (`middleware/logger.js`)

| 액션 | 상세 |
|---|---|
| `KAKAO_LOGIN` (변경) | `역할: 선생님 (가입)` |
| `SWITCH_ROLE` | `선생님 → 학부모` |
| `ADD_ROLE` | `선생님 → 학부모 계정 생성` |
| `GRANT_ADMIN` | `대상: ○○ → 관리자 계정 ○○` |
| `CREATE_TEACHER_INVITE` | `메모: ○○ · 만료: 2026-09-13` |
| `REVOKE_TEACHER_INVITE` | `초대 ID: n` |
| `ADD_PARENT_TEACHER` | `학부모 ○○ ↔ 선생님 ○○` |
| `REMOVE_PARENT_TEACHER` | 〃 |

## 8. 마이그레이션 요약

| 순서 | 문장 | 멱등 |
|---|---|---|
| 1 | `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_role …` | ✓ |
| 2 | `ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_kakaoId_key"` | ✓ |
| 3 | `CREATE TABLE IF NOT EXISTS teacher_invites (…)` + 인덱스 | ✓ |
| 4 | `CREATE TABLE IF NOT EXISTS parent_teachers (…)` + UNIQUE·인덱스 | ✓ |
| 5 | `INSERT INTO parent_teachers … SELECT … WHERE NOT EXISTS` (백필) | ✓ |
| 6 | `ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS "teacherId" INTEGER` + 인덱스 | ✓ |
| 7 | `UPDATE parent_children … WHERE "teacherId" IS NULL` (백필) | ✓ |

기존 행·컬럼은 지우지 않는다. 백필 두 개는 재실행해도 결과가 같다.
