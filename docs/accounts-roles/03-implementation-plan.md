# 계정 · 역할 · 초대 체계 — 구현 계획

> 상태: **초안 — 2026-08-30** · 대상: [01-requirements.md](./01-requirements.md) FR-300~393 · 설계: [02-data-model-api.md](./02-data-model-api.md) · 목업: [mockups/accounts.html](./mockups/accounts.html)
> 기준 브랜치: `main`(학부모 포털·사진 공유 머지 완료). 작업 브랜치 `feat/accounts-roles`.
> 원칙: **기존 화면·API·데이터는 그대로 동작한다.** 컬럼은 지우지 않고, 학부모 단일 소속(`parent_accounts.teacherId`)은 **대표 선생님으로 남겨** 배포 중간 상태에서도 옛 코드가 깨지지 않게 한다.

## 0. 요약

| 항목 | 내용 |
|---|---|
| 단계 | **S1** 스키마·모델·유틸 → **S2** 콜백 재작성(계정 선택 · **초대 없는 가입 차단**) → **S3** 선생님 초대(관리자) → **S4** 역할 조회·전환 + 전환 메뉴 → **S5** 역할 계정 만들기 → **S6** 학부모 다중 선생님 **서버** → **S7** 학부모 다중 선생님 **화면** → **S8** 관리자 화면·e2e·문서 |
| 가장 위험한 변경 2가지 | ① **콜백에서 자동 선생님 가입을 없앤다**(S2) — 잘못 배포하면 아무도 가입하지 못한다. 기존 계정 로그인은 영향 없음을 테스트로 고정 ② **학부모 소속을 단일 → 다대다**(S6) — 일정·사진·자녀·신청·알림이 모두 이 스코프를 쓴다. `services/parentScope.js` 한 곳으로 모아 누락을 막는다 |
| DB | `users` 제약 교체, 신규 표 2개(`teacher_invites`·`parent_teachers`), 컬럼 1개(`parent_children.teacherId`), 백필 2개. **삭제 없음** |
| 환경 위험 | **로컬 `.env` 의 `DATABASE_URL` 이 운영 Supabase** 다. 이 작업은 반드시 로컬 Postgres 로 한다(§4.3) |

## 1. 기존 코드 분석 — 무엇을 건드리고 무엇을 건드리지 않는가

### 1.1 DB `server/database.js`

| 사실 | 의미 |
|---|---|
| `users."kakaoId"` 는 `ADD COLUMN IF NOT EXISTS "kakaoId" TEXT UNIQUE` 로 만들어졌고 로컬 제약 이름이 **`users_kakaoId_key`** 임을 `pg_constraint` 로 확인했다 | 이 이름으로 `DROP CONSTRAINT IF EXISTS`. 운영 이름은 §4.2 에서 확인 |
| 모든 문장이 `IF NOT EXISTS`, 마이그레이션 도구 없음, `initDatabase()` 가 모듈 로드 시 실행 | 새 문장 7개도 멱등(02 §8). 백필은 `WHERE NOT EXISTS` / `WHERE 컬럼 IS NULL` |
| `parent_accounts (userId PK, teacherId NOT NULL, inviteId, lastLoginAt, createdAt)` + `idx_parent_accounts_teacher` | `teacherId` 는 **지우지 않고 대표 선생님으로** 남긴다. `NOT NULL` 이라 지우려면 제약 변경이 필요하고 옛 코드가 읽는다 |
| `parent_children` 에 `teacherId` 가 없고, 소속은 `parent_accounts` 조인으로 알아낸다(`ParentChild.getWithOwner`) | 다대다가 되면 이 조인이 **어느 선생님인지 결정하지 못한다** → 컬럼 추가가 필수 |
| `parent_children` UNIQUE `("parentUserId","studentId") WHERE studentId IS NOT NULL` | 그대로. 학생이 선생님을 함의한다 |
| **운영 DB 현황(2026-08-30 정리 후)**: `admin 2`(admin · 최재웅) · `user 1`(이재림) · `parent 0`. 로컬 dev DB 는 `admin 1 · user 7 · parent 6`(대부분 e2e 픽스처) | `kakaoId` 중복이 없어 인덱스 생성이 실패하지 않는다. **운영에는 학부모가 0명**이라 `parent_teachers`·`parent_children.teacherId` 백필 대상이 없다 — 다중 선생님 기능은 사실상 새 데이터부터 적용된다. 백필 검증은 로컬(학부모 6명)에서 한다 |

### 1.2 인증 `controllers/authController.js` · `models/User.js`

| 사실 | 의미 |
|---|---|
| `kakaoCallback`: `state` 가 있으면 초대 토큰 → `getByKakaoId(kakaoId)` → 초대면 학부모(선생님 행이면 **409**), 아니면 **선생님 생성/토큰 갱신** | 구조는 유지하고 ① `decodeState` ② `listByKakaoId` + `pickAccount` ③ **초대 없으면 생성 금지** ④ 409 삭제 ⑤ `tinvite` 분기 추가. 카카오 토큰 교환·`/v2/user/me` 부분은 **무변경** |
| `getKakaoAuthUrl`: 항상 `scope=talk_message`, `?invite=` 면 `state=<토큰 원문>` | `prefer`·`invite`·`tinvite` 를 `encodeState` 로. 셋 다 없으면 지금과 **완전히 같은 URL** |
| `uniqueParentUsername` 이 컨트롤러 안에 있다 | `utils/usernames.js` 로 이동(동작 동일), 선생님·관리자 행 생성에도 사용 |
| JWT 서명이 `login`·`signup`·`kakaoCallback` 세 곳에 복사돼 있다 | `services/roleAccounts.issueToken()` 으로 모아 전환·만들기가 같은 것을 쓴다 |
| `User.getByKakaoId(kakaoId)` 호출은 **`kakaoCallback` 한 곳**(grep 확인) | 시그니처 변경 영향이 한 곳. 테스트 모킹도 한 곳 |
| `deleteUser`: `ParentAccount.deleteByTeacher(id)` → `User.delete(id)` | `deleteByTeacher` 의 **의미가 바뀐다**(연결 해제 + 고아 계정만 삭제). 호출부는 그대로 |
| `USER_ROLES = ['user','admin']` 로 역할 편집 검증 | 학부모 행 편집은 지금도 400. 클라이언트에서 셀렉트만 비활성화 |
| `User.transferData` 가 students·classes·attendance·competitions·events·parent_accounts·parent_invites 를 옮긴다 | `parent_teachers`·`parent_children.teacherId` 3문장 추가(02 §2.6) |
| `kakaoMessage.js` 는 `User.getKakaoTokens(userId)` — 행 단위 토큰 | 전환 메뉴로 만든 선생님/관리자 행에 **현재 행 토큰을 복사**해야 알림이 재로그인 없이 동작 |

### 1.3 학부모 도메인 (다대다 전환의 실제 범위)

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `controllers/parentController.js` | `teacherOf(userId)` = `ParentAccount.getByUserId` 한 줄이 **모든 핸들러의 스코프**. `getMe`·`addChildren`·`getEvents`·`getEvent`·`loadForRegistration` 이 전부 `account.teacherId` 를 쓴다 | `services/parentScope.js` 로 교체. `getMe` 는 `teachers[]`, `addChildren` 은 `teacherId` 인자, 이벤트 3종은 `teacherIds` |
| 〃 `notifyTeacher({ teacherId: loaded.account.teacherId })` | 학부모의 **단일 소속 선생님**에게 알림 | **`event.userId`**(이벤트 소유자)로 변경 — 다중 연결에서 엉뚱한 선생님에게 갈 수 있다(FR-374) |
| `controllers/parentAlbumController.js` | `teacherOf` 로 `account.teacherId` (`listAlbums`, `getPublishedForParent`, `matchStudentAcrossAlbums`) | 같은 스코프 모듈로. `matchStudentAcrossAlbums(teacherId, …)` 의 teacherId 는 **자녀의 선생님**에서 얻는다 |
| `models/Event.js` `listUpcomingForParent(teacherId,…)` · `getPublishedForParent(id, teacherId)` · `listWithAlbumsForParent(teacherId)` | `WHERE "userId" = $1` | `= ANY($1)` 로 바꾸고 배열을 받는다 |
| `models/ParentChild.js` `getWithOwner` 가 `parent_accounts` 를 조인해 `teacherId` 를 얻는다 | 다대다에서 **어느 선생님인지 결정 불가** | `parent_children."teacherId"` 를 직접 반환 |
| `controllers/parentAdminController.js` | `authorize` 가 `child.teacherId`(조인값) 비교, `addChildLink`·`deleteParent` 가 `account.teacherId` 비교 | `child.teacherId`(컬럼) / `ParentTeacher.isLinked` 로 |
| `models/ParentAccount.js` `listByTeacher` | `WHERE a."teacherId" = $1` + 그 학부모의 **자녀 전부** | `parent_teachers` 조인 + 자녀는 **그 선생님 것만**(다른 선생님 자녀가 보이면 개인정보 문제) |
| `services/parentOnboarding.matchChild(students, …)` | 순수 함수, 학생 목록을 받는다 | **변경 없음**. 넘겨주는 목록의 범위만 "고른 선생님" 으로 |
| `utils/albumAccess.js` | 순수 함수(확정 여부 판정) | **변경 없음** |

> 다중 선생님으로 바뀌는 지점은 **스코프를 만드는 한 줄**(`teacherOf`)과 그것을 쓰는 곳들이다. 판정 로직(`canRegister`, `matchChild`, `isConfirmedParent`)은 순수 함수라 손대지 않는다.

### 1.4 클라이언트

| 사실 | 의미 |
|---|---|
| `App.jsx` 는 `user.role==='parent'` → `ParentApp`, `/admin` 접두사 → 관리자 트리, 아니면 선생님 트리 | **전환 = `setUser`** 로 트리가 바뀐다. `App.jsx` 는 헤더 메뉴와 `/teacher-invite/:token` 공개 라우트만 추가 |
| 공개 화면 분기(`isPublicChatPage || isInvitePage`)가 인증 확인을 기다리지 않는다 | `/teacher-invite/` 도 같은 분기에 넣는다 |
| `Login.jsx` 는 카카오 버튼만 | `?outcome=needsInvite` 안내 상태 추가. 나머지 그대로 |
| `KakaoCallback` 은 `!response.ok` 면 throw | 403 `needsInvite` 는 던지지 않고 안내 화면으로 |
| `ParentSettings` 가 `me.teacher.name` 을 쓴다 | `me.teachers[]` 로. 서버가 한 배포 주기 동안 `teacher` 도 함께 내려보내 옛 번들이 깨지지 않게 |
| `ParentOnboarding({ teacherName })` | 선생님 선택 단계 추가(2명 이상) |
| `AdminLayout.adminMenuItems` 배열 | `선생님(/admin/teachers)` 추가 |
| `App.routing.test.js` 가 `useAuth` 모킹으로 주소를 검증 | 같은 패턴으로 초대 랜딩·전환 케이스 추가 |

### 1.5 테스트 인프라

| 사실 | 의미 |
|---|---|
| 서버 Jest ESM + `unstable_mockModule`. `authController.test.js` 가 `User`·`ParentInvite`·`ParentAccount`·`ParentChild` 를 모킹하고 `global.fetch` 로 카카오 응답을 흉내 낸다 | `TeacherInvite`·`ParentTeacher` 모킹 추가. 판정표 전 행을 케이스로 |
| `parentController.test.js`·`parentAlbumController.test.js` 존재 | 스코프 변경의 회귀를 여기서 잡는다 |
| Playwright: `setup.mjs` 가 DB 에 직접 행을 넣고 JWT 발급, `loginAs` 가 localStorage 주입. 카카오는 자동화 불가 | 같은 `kakaoId` 의 선생님+학부모, **선생님 2명과 연결된 학부모**, 관리자 세션, 미사용 선생님 초대를 만들어 둔다 |

## 2. 단계별 계획

각 단계 끝: `cd server && npm test`, `cd client && npm test` 통과 + §5.4 수동 회귀.

### S1. 스키마 · 모델 · 유틸 (서버만, 동작 변화 없음)

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/database.js` | 02 §8 문장 7개(제약 교체, `teacher_invites`, `parent_teachers`+백필, `parent_children.teacherId`+백필) |
| 수정 | `server/models/User.js` | `getByKakaoId(kakaoId, role)`, `listByKakaoId`, `transferData` 3문장 |
| 신규 | `server/models/TeacherInvite.js`, `server/models/ParentTeacher.js` | 02 §2.2·2.3 |
| 신규 | `server/utils/oauthState.js`, `server/utils/usernames.js` | 02 §2.7·2.8 |
| 신규 | `server/services/roleAccounts.js`, `server/services/parentScope.js` | 02 §2.9·2.10 (연결은 다음 단계들) |
| 수정 | `server/controllers/authController.js` | `getByKakaoId(kakaoId, invite ? 'parent' : 'user')` 로 **임시** 호출(옛 동작 유지), `uniqueUsername` 사용 |
| 테스트 | `utils/__tests__/oauthState.test.js` | 왕복 / 빈 값 / 옛 토큰 원문 / 잘못된 `prefer` 무시 / `pickAccount` 힌트·우선순위·빈 목록 |
| 테스트 | `utils/__tests__/usernames.test.js` | 절단·접미사·타임스탬프 |
| 테스트 | `models/__tests__/teacherInvite.test.js` | `isUsable` 4상태(대기·사용·만료·회수) — 순수 함수만 |

**완료 조건** 로컬에서 서버 2회 기동, `\d users`·`\d parent_children` 확인, `SELECT count(*) FROM parent_teachers` 가 기존 학부모 수와 같음, 기존 로그인·학부모 화면 정상.
**기존 영향** 없음. 이 단계만 배포해도 안전하다.

### S2. 콜백 재작성 — 계정 선택 · 초대 없는 가입 차단

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/controllers/authController.js` | `getKakaoAuthUrl`(`prefer`·`invite`·`tinvite`), `kakaoCallback`(02 §4.2 판정표), 응답 `accounts`, 23505 → 409 |
| 수정 | `server/middleware/logger.js` | `KAKAO_LOGIN` 상세 |
| 수정 | `client/src/utils/tokenStorage.js` | `saveLastRole` / `getLastRole` |
| 수정 | `client/src/context/AuthContext.jsx` | `getKakaoLoginUrl({prefer,invite,tinvite})`, `kakaoLogin` 의 403 처리, `logout` 이 마지막 역할 유지 |
| 수정 | `client/src/pages/KakaoCallback.jsx` | `admin` → `/admin`, `needsInvite` → `/login?outcome=needsInvite` |
| 수정 | `client/src/pages/Login.jsx` | `?outcome=needsInvite` 안내 상태 |
| 테스트 | `controllers/__tests__/authController.test.js` | 판정표 **8행 전부**, 하위 호환 2건, 다중 계정 선택 2건(힌트 있음/없음), 23505 → 409. **`needsInvite` 응답에 `token` 이 없고 `createWithKakao` 가 호출되지 않는지** 단언 |
| 테스트 | `client/src/utils/__tests__/tokenStorage.test.js`, `pages/__tests__/KakaoCallback.test.js` | 마지막 역할, 응답별 이동 5종 |

**완료 조건** 초대 없는 새 카카오 → 계정 미생성 + 안내. 기존 계정 로그인 정상. 선생님 카카오가 학부모 초대를 타면 학부모 행 생성.
**기존 영향** **가입 정책 변경(의도)**. 기존 사용자 로그인은 영향 없음.

### S3. 선생님 초대 (관리자)

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `server/controllers/teacherInviteController.js`, `server/routes/teacherInvites.js` | 02 §4.3 |
| 수정 | `server/server.js` | `app.use('/api/teacher-invites', rejectParents, …)`, `app.use('/api/teacher-invite', …)`(공개) |
| 수정 | `server/controllers/authController.js` | 콜백의 `tinvite` 분기에서 `markUsed`(경합 시 409) |
| 수정 | `server/middleware/logger.js` | `CREATE_TEACHER_INVITE` / `REVOKE_TEACHER_INVITE` |
| 신규 | `client/src/pages/TeacherInviteLanding.jsx`, `client/src/pages/admin/AdminTeacherInvites.jsx` | 목업 ③④ |
| 수정 | `client/src/App.jsx`, `components/admin/AdminLayout.jsx` | 공개 라우트 + `/admin/teachers` 메뉴 |
| 테스트 | `controllers/__tests__/teacherInviteController.test.js` | 발급(만료 계산)·목록 상태 4종·회수(사용된 것 409)·비관리자 403·공개 확인이 내부 정보를 안 내려보내는지 |
| 테스트 | `controllers/__tests__/authController.test.js` | `tinvite` 유효/무효/사용됨/회수됨/만료, **선생님 행이 이미 있으면 토큰 미소비**, `markUsed` 경합 |
| 테스트 | `client/src/pages/admin/__tests__/AdminTeacherInvites.test.js` | 발급 → 목록 갱신, 회수, 복사 버튼 |

**완료 조건** 관리자가 링크를 만들고 그 링크로 새 선생님이 가입된다. 회수·만료·재사용이 막힌다.

### S4. 역할 조회 · 전환 + 전환 메뉴

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/controllers/authController.js`, `server/routes/auth.js` | `getRoles`, `switchRole` (02 §4.4) |
| 수정 | `server/middleware/logger.js` | `SWITCH_ROLE` |
| 신규 | `client/src/utils/roleRoutes.js`, `client/src/components/common/RoleSwitcher.jsx` | 02 §5.2 |
| 수정 | `client/src/context/AuthContext.jsx` | `listRoles`, `switchRole` |
| 수정 | `App.jsx`, `AdminLayout.jsx`, `Settings.jsx`, `ParentSettings.jsx`, `AdminSettings.jsx` | 메뉴·카드 삽입 |
| 테스트 | `authController.test.js` | `switchRole` 6건(같은 역할·kakaoId 없음·없는 역할 404·성공·학부모 `touchLogin`·**현재 사용자 kakaoId 로만 조회**), `getRoles` 3건 |
| 테스트 | `roleRoutes.test.js`, `RoleSwitcher.test.js` | 분기 전체, 렌더 조건, 전환 후 이동 |

**완료 조건** 같은 카카오의 선생님 ↔ 학부모 왕복이 카카오 화면 없이 된다.

### S5. 역할 계정 만들기

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `server/controllers/authController.js`, `routes/auth.js` | `addRole` (02 §4.5) — 선생님(초대/관리자 예외), 학부모(초대/자기 학원), **이미 있으면 연결만 추가** |
| 수정 | `middleware/logger.js` | `ADD_ROLE` |
| 신규 | `client/src/components/common/ParentAccountDialog.jsx`, `TeacherAccountDialog.jsx` | 목업 ⑤ 의 만들기 항목 |
| 수정 | `RoleSwitcher.jsx` | 만들기 항목 활성 |
| 테스트 | `authController.test.js` | `addRole` 10건(위 표 전부 + `role:'admin'` 400 + kakaoId 없음 400 + URL 형태 토큰 파싱) |
| 테스트 | 다이얼로그 2개 | 버튼 구성·성공 이동·`needsInvite` 오류 |

### S6. 학부모 다중 선생님 — 서버

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `models/ParentAccount.js` | `create`(link 호출·대표 선생님 고정), `listByTeacher`(조인 + 자녀 필터), `listAll`(선생님 배열), `deleteByTeacher`(연결 해제 + 고아 삭제) |
| 수정 | `models/ParentChild.js` | `create({teacherId})`, `listByParent(…, {teacherIds})`, `getWithOwner` |
| 수정 | `models/Event.js` | 학부모용 3개 메서드 `= ANY($1)` |
| 수정 | `controllers/parentController.js` | `parentScope` 적용, `getMe.teachers[]`, `addChildren.teacherId`, 이벤트 3종 스코프, **알림 대상 `event.userId`**, 신청 시 자녀-이벤트 선생님 일치 검사 |
| 수정 | `controllers/parentAlbumController.js` | 같은 스코프 |
| 수정 | `controllers/parentAdminController.js`, `routes/parents.js` | `child.teacherId` 권한 판정, 연결 해제 엔드포인트, `deleteParent` 역할별 동작 |
| 신규 | `controllers/parentController.addTeacher` | `POST /api/parent/teachers` |
| 테스트 | `parentController.test.js` | 선생님 2명 시나리오: 일정 합쳐 조회·필터, 연결 없는 이벤트 404, **T1 자녀로 T2 이벤트 신청 거부**, 알림 대상이 이벤트 소유자, 자녀 추가 시 선생님 검증, 선생님 추가 API |
| 테스트 | `parentAdminController.test.js` | 자녀 필터(다른 선생님 자녀 미노출), 연결 해제, 선생님 삭제 시 고아만 삭제 |
| 테스트 | `parentAlbumController.test.js` | 앨범 스코프 회귀 |

**완료 조건** 학부모 1명이 선생님 2명과 연결된 상태에서 일정·사진·신청·자녀가 선생님별로 정확히 갈린다. 기존 단일 선생님 학부모는 무변화.

### S7. 학부모 다중 선생님 — 화면

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `client/src/pages/parent/TeacherFilter.jsx` | 칩(2명 이상일 때만) |
| 수정 | `ParentSchedule.jsx`, `ParentAlbumList.jsx` | 필터 + 카드 선생님 배지 |
| 수정 | `ParentSettings.jsx` | 선생님 목록 + [선생님 추가] + `RoleSwitcher` |
| 수정 | `ParentOnboarding.jsx` | 선생님 선택 단계 |
| 수정 | `ParentApp.jsx` | `me.teachers` 사용(온보딩 판정은 자녀 수 그대로) |
| 테스트 | `parent/__tests__/*` | 필터 렌더 조건, 선생님 선택, 선생님 추가 성공/실패 |

### S8. 관리자 화면 · e2e · 문서

| 구분 | 파일 | 내용 |
|---|---|---|
| 수정 | `AdminUsers.jsx` | 배지 3종·같은 카카오 표시·[관리자 계정 추가]·셀렉트 비활성·이전 목록 |
| 수정 | `AdminParents.jsx`, `Parents/ParentList.jsx` | 선생님 배열 표시·연결 해제 |
| 수정 | `authController.js` | `grantAdmin`, `deleteUser` 자기 자신 400 |
| 수정 | `client/e2e/setup.mjs` | 같은 kakaoId 의 선생님+학부모, **선생님 2명과 연결된 학부모**, 관리자 세션, 미사용 선생님 초대 |
| 신규 | `client/e2e/accounts.spec.mjs` | ① 선생님 초대 랜딩 렌더·회수된 링크 무효 ② 관리자 초대 발급 → 목록 ③ 선생님 헤더 → 학부모 화면 → 내 정보 → 선생님 화면 왕복 ④ 학부모 일정에 두 선생님 이벤트 + 필터 ⑤ 연결 없는 이벤트 API 404 ⑥ 학부모 토큰으로 `teacher-invites` 403 |
| 수정 | `playwright.config.mjs`, `e2e/smoke-prod.mjs` | 프로젝트 추가, `/api/auth/roles` 401 확인 |
| 수정 | `CLAUDE.md` | 조직 구조·초대 규칙·다중 역할·다중 선생님·전환·알려진 제한 |
| 수정 | `docs/accounts-roles/README.md` | 상태 갱신 |

## 3. 신규 / 수정 파일 총괄

| 구분 | 서버 | 클라이언트 |
|---|---|---|
| 신규 | `models/TeacherInvite.js`, `models/ParentTeacher.js`, `utils/oauthState.js`, `utils/usernames.js`, `services/roleAccounts.js`, `services/parentScope.js`, `controllers/teacherInviteController.js`, `routes/teacherInvites.js` + 테스트 4개 | `utils/roleRoutes.js`, `components/common/RoleSwitcher.jsx`, `ParentAccountDialog.jsx`, `TeacherAccountDialog.jsx`, `pages/TeacherInviteLanding.jsx`, `pages/admin/AdminTeacherInvites.jsx`, `pages/parent/TeacherFilter.jsx`, `e2e/accounts.spec.mjs` + 테스트 6개 |
| 수정 | `database.js`, `models/User.js`, `models/ParentAccount.js`, `models/ParentChild.js`, `models/Event.js`, `controllers/authController.js`, `parentController.js`, `parentAlbumController.js`, `parentAdminController.js`, `routes/auth.js`, `routes/parent.js`, `routes/parents.js`, `server.js`, `middleware/logger.js` | `App.jsx`, `context/AuthContext.jsx`, `utils/tokenStorage.js`, `pages/Login.jsx`, `pages/KakaoCallback.jsx`, `components/admin/AdminLayout.jsx`, `pages/admin/AdminUsers.jsx`, `AdminParents.jsx`, `AdminSettings.jsx`, `pages/Settings.jsx`, `pages/Parents/ParentList.jsx`, `pages/parent/ParentSettings.jsx`, `ParentSchedule.jsx`, `ParentAlbumList.jsx`, `ParentOnboarding.jsx`, `components/parent/ParentApp.jsx`, `e2e/setup.mjs`, `e2e/smoke-prod.mjs`, `playwright.config.mjs` |
| 무변경(확인) | `middleware/roles.js`, `utils/albumAccess.js`, `services/parentOnboarding.js`, `services/eventService.js` | `pages/parent/InviteLanding.jsx`(쿼리에 `role` 불필요 — `invite` 만으로 학부모 흐름), `RegisterName.jsx` |

## 4. 데이터 안전 · 마이그레이션 · 운영

### 4.1 무엇이 바뀌고 무엇이 안 바뀌나

- **바뀜**: `users` 제약, 신규 표 2개, 컬럼 1개, 백필 2개. **기존 행·컬럼 값은 손대지 않는다.**
- 기존 학부모는 백필로 `parent_teachers` 에 1행씩 생기고, `parent_children.teacherId` 가 채워진다 → 화면·신청·사진 동작이 이전과 같다(필터 칩은 선생님이 1명이라 안 보인다).
- 기존 선생님·관리자는 그대로 로그인된다(`pickAccount` 가 유일한 행을 고른다). 운영에 남은 선생님은 **이재림 선생님 1명**이므로(2026-08-30 정리) 새 선생님은 전부 관리자 초대를 거친다.
- **승격된 관리자**(역할 편집으로 선생님 → 관리자가 된 행)는 학생·수업을 관리자 행이 갖고 있다. 그 사람이 [선생님 계정 만들기]를 하면 **빈 선생님 계정**이 생기므로 관리자 > 사용자 **데이터 이전**으로 옮긴다. 배포 공지에 적는다.
- **가입 정책이 바뀐다**: 초대 없는 카카오 로그인은 계정을 만들지 않는다. 배포 전에 관리자가 **선생님 초대 링크 발급 절차**를 알고 있어야 한다.

### 4.2 운영 반영 절차 (Vercel `initDatabase()` 가 fire-and-forget)

1. S1(스키마)만 먼저 배포 → 콜드스타트(`smoke:prod`) → Supabase SQL 편집기 확인:
   ```sql
   SELECT conname FROM pg_constraint WHERE conrelid='users'::regclass;  -- users_kakaoId_key 없어야 함
   SELECT indexname FROM pg_indexes WHERE tablename='users';            -- idx_users_kakao_role 있어야 함
   SELECT to_regclass('teacher_invites'), to_regclass('parent_teachers');
   SELECT count(*) FROM parent_teachers;                                 -- 기존 학부모 수와 같아야 함
   SELECT count(*) FROM parent_children WHERE "teacherId" IS NULL;       -- 0 이어야 함
   ```
2. 안 됐으면 02 §8 문장을 직접 실행하고 `ALTER TABLE <t> OWNER TO rg_app`.
3. 그 전까지 두 번째 역할 생성은 `23505 → 409` 로 안전하게 실패한다.
4. 그 다음 S2~S8 배포.

### 4.3 로컬 개발 DB (필수)

`.env` 의 `DATABASE_URL` 은 **운영 Supabase** 다.

```bash
createdb rg_manager
cd server && DATABASE_URL=postgresql://<user>@localhost:5432/rg_manager npm start
```

로컬에서 한 카카오에 두 번째 역할 행을 만들면, 아직 옛 코드가 도는 운영에서 그 사람은 `getByKakaoId(kakaoId)` 의 **임의 행**으로 로그인된다.

### 4.4 롤백

- S2 이후 롤백 시 **가입 정책이 되돌아간다**(다시 아무나 선생님). 알고 되돌린다.
- 두 번째 역할 행이 이미 있으면 02 §1.7 의 정리 SQL 을 먼저 실행한다.
- `parent_teachers` 는 지워도 `parent_accounts.teacherId` 가 대표 선생님으로 남아 있어 옛 코드가 동작한다.

## 5. 테스트 계획

### 5.1 서버 단위

| 파일 | 케이스 |
|---|---|
| `utils/__tests__/oauthState.test.js` | 왕복·빈 값·legacy·잘못된 prefer·`pickAccount` 3종 |
| `utils/__tests__/usernames.test.js` | 절단·접미사·폴백 |
| `models/__tests__/teacherInvite.test.js` | `isUsable` 4상태 |
| `controllers/__tests__/authController.test.js` | 판정표 8행, 하위 호환 2, 다중 선택 2, 23505, `getKakaoAuthUrl` 3, `switchRole` 6, `getRoles` 3, `addRole` 10, `grantAdmin` 4, `deleteUser` 자기 자신 |
| `controllers/__tests__/teacherInviteController.test.js` | 발급·목록·회수·403·공개 응답 필드 |
| `controllers/__tests__/parentController.test.js` | 다중 선생님 7종(§2 S6) |
| `controllers/__tests__/parentAdminController.test.js` | 자녀 필터·연결 해제·고아 삭제 |
| `services/__tests__/roleAccounts.test.js` | `create*` 3종(역할·토큰 복사·이름·409), `describeRoles` |

### 5.2 클라이언트

`roleRoutes` · `tokenStorage` · `KakaoCallback` · `RoleSwitcher` · `ParentAccountDialog` · `TeacherInviteDialog` · `AdminTeacherInvites` · `AdminUsers` · `TeacherFilter` · `ParentOnboarding` · `App.routing`.

### 5.3 e2e — `client/e2e/accounts.spec.mjs`

§2 S8 의 ①~⑥. 카카오 인가 화면은 자동화하지 않는다(현행 방침).

### 5.4 수동 회귀 (단계마다)

- 기존 선생님 카카오 로그인 → 홈 / 기존 학부모 초대 링크 → 로그인 → 일정·신청·사진
- 초대 없는 새 카카오 → "초대가 필요해요" (계정 미생성 확인)
- 관리자 초대 발급 → 새 카카오로 선생님 가입 → `/register-name` → 홈
- 선생님 ↔ 학부모 전환 왕복, 관리자 → 선생님 전환
- 학부모에 두 번째 선생님 초대 링크 추가 → 일정에 두 선생님 이벤트 + 필터 → 각 자녀로 신청
- 휴대폰(414px): 필터 칩, 전환 메뉴, 초대 랜딩
- 기존 e2e `teacher.spec` · `parent.spec` 통과

## 6. 배포 순서

| 순서 | 내용 | 확인 |
|---|---|---|
| 1 | S1 (스키마만) | §4.2 SQL 확인 |
| 2 | S2~S3 (가입 정책 + 선생님 초대) | **공지**: 이제 초대로만 가입. 관리자에게 발급 방법 안내 |
| 3 | S4~S5 (전환·만들기) | 왕복 확인 |
| 4 | S6~S7 (다중 선생님) | 기존 학부모 무변화 + 2명 연결 시나리오 |
| 5 | S8 (관리자 화면·문서) | e2e·`smoke:prod` |

## 7. 리스크

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R-1 | 로컬 개발이 운영 DB 공유 | 운영에 다중 역할 행이 생겨 옛 코드가 임의 행으로 로그인 | §4.3 로컬 DB 강제 |
| R-2 | Vercel 에서 DDL 미적용 | 두 번째 역할 생성 실패, `parent_teachers` 없음 | §4.2 확인 + 수동 적용. 23505 → 409 안전 실패 |
| R-3 | **초대 없는 가입 차단이 기존 사용자에게 적용** | 기존 선생님이 못 들어옴 | 계정이 있으면 초대 불필요(판정표). 테스트로 고정(AC-304) |
| R-4 | 다중 선생님 스코프 **누락된 경로** | 다른 선생님 데이터 노출 | 스코프를 `services/parentScope.js` 한 곳으로. 학부모 API 전 경로 테스트(§5.1) |
| R-5 | `listByTeacher` 가 다른 선생님 자녀까지 노출 | 개인정보 | 자녀 필터를 명시적으로 테스트 |
| R-6 | 선생님 초대 토큰 유출 | 무단 선생님 가입 | 1회용 + 만료 + 회수. 목록에 토큰 원문 미표시 |
| R-7 | `markUsed` 경합(두 명이 같은 링크) | 두 계정 생성 | `WHERE "usedAt" IS NULL RETURNING` 로 1명만. 실패 시 409 |
| R-8 | `switch-role`/`addRole` 로 남의 계정 | 권한 상승 | `kakaoId` 를 토큰의 사용자 행에서만 읽는다. `admin` 생성 불가 |
| R-9 | 승격된 관리자가 [선생님 계정 만들기] 후 "학생이 없다" | 혼란 | 안내 문구 + 데이터 이전(§4.1) |
| R-10 | 알림이 엉뚱한 선생님에게 | 학부모 신청이 다른 선생님에게 감 | 알림 대상을 `event.userId` 로(FR-374) + 테스트 |
| R-11 | 브라우저당 역할 하나 | 다른 탭이 갑자기 바뀜 | FR-391 알려진 제한, 메뉴 도움말 |
| R-12 | 옛 번들이 `me.teacher` 를 읽음 | 학부모 내 정보 깨짐 | 한 배포 주기 동안 `teacher`(대표) 병행 제공 |

## 8. 범위 밖 · 후속

- ~~이벤트 단위 초대(`event_invitees`)~~ — 링크 단위로 확정(01 §5.7), 만들지 않는다
- 로그인 시 역할 선택 화면 — Q-8
- 학부모의 자기 연결 해제 — Q-5
- `parent_accounts.teacherId` 컬럼 제거(호환 기간 후)
- `/api/parent/me` 의 `teacher` 필드 제거(호환 기간 후)
- 탭별 세션(두 역할 동시 로그인)
- `/api/auth/signup` 제거, `pages/Admin.jsx`(라우트 없는 옛 화면) 삭제
