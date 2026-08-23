# 대회 사진 · 영상 공유 — 구현 계획

> 상태: **확정 — 2026-08-23** · 관련: [01-requirements.md](./01-requirements.md), [02-data-model-api.md](./02-data-model-api.md), [목업](./mockups/parent.html) ·
> 기준 브랜치: `feat/photo-albums` (base `main`, 학부모 포털 머지 완료 상태)

## 0. 한 줄 요약

목업 두 개(학부모·선생님)를 그대로 구현한다. 선생님이 **Google 계정을 한 번 연결**하고 **이벤트 상세에서 이름을 넣어 앨범 폴더를 만들면**,
**확정된 학부모**가 앱에서 사진·영상을 올리고(브라우저 → Drive 직접 전송) 앨범 전체를 본다.
사진을 올릴 때 **브라우저가 얼굴 특징값(128차원)을 뽑아** 서버로 보내고, 서버는 그것을 Supabase(Postgres)에 저장한 뒤
자녀 기준 얼굴과 **거리 매칭**해 태그를 만든다. 학부모는 **"우리 아이 사진만 보기" 토글**로 자기 아이 사진만 보고, 뷰어에서 **원본을 저장**한다.

## 1. 설계 변경 — 02 문서에서 바뀐 것 3가지

구현에 들어가며 실제 환경을 확인해 세 가지를 바꾼다. 나머지(테이블 구성·API 형태·권한 규칙·화면)는 02 문서 그대로다.

| # | 02 문서 | **이 계획** | 이유 (확인한 사실) |
|---|---|---|---|
| C-1 | 얼굴 벡터를 **pgvector** `vector(128)` 에 저장, `<->` 로 SQL 매칭 | **`TEXT` 컬럼에 base64(Float32Array 128)** 로 저장하고, **거리 계산은 순수 JS 함수** | 운영 Supabase 에 `vector` 확장이 **설치돼 있지 않고**, 앱 접속 계정 `rg_app` 은 **superuser 가 아니다**(확인함). 확장 설치를 부팅 마이그레이션에 넣으면 권한 오류로 매번 실패한다. 규모(선생님 1명당 수백~수천 얼굴)에서는 JS 계산이 수십 ms 라 문제가 없고, 로컬·운영 동작이 완전히 같아진다. base64 는 JSON 대비 저장·파싱 비용이 1/2 이하(512B → 684자). **pgvector 는 규모가 커지면 그때 컬럼만 바꾸면 되는 최적화**로 남긴다 |
| C-2 | 얼굴 검출·임베딩을 **Vercel 서버**에서(face-api.js + tfjs WASM) | **업로더의 브라우저**에서 계산해 서버로 **벡터만** 전송. 서버는 저장·매칭만 한다 | Vercel 함수에 tfjs(1.2MB)+모델(6.6MB)을 얹으면 콜드스타트·10초 제한·번들 크기가 모두 위험하다. 브라우저는 **이미 그 사진을 메모리에 갖고 있어** 다운로드가 없다. 필요한 자산은 `tiny_face_detector`(189KB) + `face_landmark_68_tiny`(75KB) + `face_recognition`(6.3MB) + 라이브러리(1.3MB)이며 **업로드/얼굴 등록 화면에서만 지연 로딩**한다. 서버 API 는 "벡터를 받는다" 로 정의하므로 나중에 서버 검출을 붙여도 계약이 바뀌지 않는다 |
| C-3 | 앨범 사진의 축소본을 서버로 보내 서버가 검출 | 축소본은 **보내지 않는다**. 브라우저가 `{box, score, descriptor}` 배열만 보낸다 | C-2 의 결과. 요청 본문이 사진 1MB → 벡터 수 KB 로 줄어 Vercel 4.5MB 제한과 무관해진다. 얼굴 이미지가 서버를 거치지 않으므로 개인정보 측면에서도 낫다(FR-255 를 더 강하게 지킨다) |

> **요구사항은 바뀌지 않는다.** "사진 올리면 얼굴 인덱스 값을 추출해서 supabase 에 저장" 은 그대로다 — 추출하는 **위치**만 서버에서 브라우저로 옮겼다.

**얼굴 인식을 못 하는 브라우저·실패 시**: `faceStatus='skipped'` 로 남기고 업로드는 성공한다. 선생님이 **수동 태그**로 보완할 수 있고, 나중에 [미분석 다시 분석] 을 눌러 그 사진들만 다시 처리한다(브라우저가 Drive 썸네일을 받아 계산 → 서버 전송).

## 2. 이번에 구현하는 것 / 하지 않는 것

### 2.1 구현

| 영역 | 내용 | FR |
|---|---|---|
| 선생님 · Drive | 설정의 Google Drive 카드(연결/해제/상태/용량), OAuth 콜백, 루트 폴더 확보, 토큰 자동 갱신 | FR-210~215 |
| 선생님 · 앨범 | 이벤트 상세의 앨범 섹션, 폴더 생성(이름 입력)·이름 변경·링크 공유 설정, 업로드 받기 토글, 통계, 새로고침 | FR-220~226, 238, 280, 284 |
| 업로드 | 업로드 세션 발급 → 브라우저가 Drive 로 직접 전송(청크·진행률·재개) → 완료 보고 → 검증 | FR-230~239 |
| 조회 | 학부모 앨범 목록/갤러리(날짜 그룹·무한 스크롤)·뷰어·영상 재생·**원본 저장(다운로드)**, 선생님 갤러리 | FR-240~246 |
| 얼굴 | 브라우저 검출·임베딩 → 저장 → 매칭 → 태그, 자녀 기준 얼굴 등록/삭제, 재분석·재매칭 | FR-250~256, 260~264, 270~275 |
| 필터 | **"우리 아이 사진만 보기" 토글** + 자녀 칩 + 사진/영상/내가 올린 것, "혹시 우리 아이?" 확인 | FR-272~273 |
| 관리 | 숨김/보이기, 수동 태그/해제, 삭제(Drive 휴지통), 활동 로그 | FR-281~285 |
| 안전 | 확정 학부모 판정, 권한 매트릭스, 학부모 응답 필드 화이트리스트, 삭제 연쇄 | FR-200~205, 290~294, NFR-4 |

### 2.2 하지 않는 것 (이번 범위 밖)

- **영상 얼굴 인식**(FR-253 그대로 제외), 앱 밖에서 Drive 에 직접 넣은 파일 동기화(`drive.file` 범위 한계)
- 선생님 대표 얼굴 등록(FR-265, 2차), 학부모 앱 내 알림(§10.7 인프라 이후), 앨범 업로드 카카오 알림(FR-295) — **알림 설정 키만 추가**하고 발송은 다음 단계
- `admin` 화면의 앨범 통계(FR-205)
- **Google Drive 연동의 실제 호출 테스트** — 사용자 지시로 이번 실행에서는 자격 증명이 없어 테스트하지 않는다(§9.4). Drive 호출은 전부 `utils/googleDrive.js` 한 곳에 모으고 **fetch 를 목으로 바꿔 단위 테스트**한다

## 3. 기존 코드 영향 분석

### 3.1 수정하는 기존 파일 (7개)

| 파일 | 변경 | 무회귀 근거 |
|---|---|---|
| `server/database.js` | `initDatabase()` 끝에 테이블 5개 + `events` 컬럼 6개 + 인덱스 + `app_settings` 시드 추가 | 전부 `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. 기존 테이블 정의는 손대지 않는다. `events` 의 `ALTER` 는 `CREATE TABLE events` **뒤에** 놓는다(파일의 기존 규칙) |
| `server/server.js` | 라우터 3개 등록: `/api/drive`(`rejectParents`), `/api/events/:id/...` 는 기존 `eventRoutes` 안에서 확장, `/api/parent/*` 는 기존 `parentRoutes` 안에서 확장 | 기존 등록 순서·리미터를 건드리지 않고 줄만 추가. 학부모 차단 목록에 새 선생님 경로를 반드시 넣는다 |
| `server/routes/events.js` | 앨범·미디어 라우트 추가 | 기존 라우트 위/아래에 추가만. 리터럴 경로를 `:id` 파라미터 라우트보다 먼저 두는 기존 규칙을 지킨다 |
| `server/routes/parent.js` | 앨범·미디어·자녀 얼굴 라우트 추가 | 라우터 전체가 이미 `verifyToken + requireRole('parent')` 로 보호된다 |
| `server/utils/storage.js` | `uploadFile/deleteFile/downloadFile` 에 **버킷 옵션** 추가, `createSignedUrl` 추가 | 인자를 **뒤에 선택적으로** 붙여 기존 호출부(FAQ 파일) 동작이 그대로다. 기존 테스트가 그대로 통과하는지 확인한다 |
| `server/models/NotificationSetting.js` | `NOTIFICATION_EVENTS` 에 `ALBUM_UPLOAD` 추가 | 행이 없으면 켜짐으로 보는 기존 규칙 그대로. 마이그레이션 불필요 |
| `server/middleware/logger.js` | `saveLog` 에 앨범 액션 분기 추가 | `else if` 만 추가. 알 수 없는 액션은 기존대로 기본 문구 |
| `client/src/components/parent/ParentLayout.jsx` | `SOON` 에 있던 `사진` 을 `parentNavLinks` 로 이동 | 탭 한 칸이 활성화될 뿐, 기존 탭 동작 불변 |
| `client/src/components/parent/ParentApp.jsx` | `/parent/photos`, `/parent/photos/:eventId` 라우트 추가 | 온보딩 게이트 안쪽, `*` 캐치올 **앞**에 추가 |
| `client/src/pages/Events/EventForm.jsx` | 저장 폼 아래에 `EventAlbumSection` 마운트 | `editing` 이 없거나 `closure` 면 렌더하지 않는다. 폼 제출 로직과 분리 |
| `client/src/pages/Settings.jsx` | Google Drive 카드 추가 | 기존 카드들과 같은 형태로 한 블록 추가 |
| `client/src/pages/parent/ParentSettings.jsx` | 자녀 행에 얼굴 등록 UI 추가 | 기존 행 렌더 확장 |

### 3.2 새로 만드는 파일

**서버**

```
server/utils/googleDrive.js        OAuth URL·토큰 교환/갱신, 폴더 생성·공유·이름변경, 업로드 세션,
                                   files.get, 휴지통, 용량 — 전부 fetch. DB 를 모른다
server/utils/faceVector.js         (순수) base64 ↔ Float32Array, euclideanDistance, classifyDistance,
                                   isValidDescriptor
server/utils/albumAccess.js        (순수) isConfirmedParent, canUpload, canManageAlbum, canDeleteMedia
server/utils/mediaValidation.js    (순수) validateUpload, buildDriveName, sanitizeFolderName,
                                   kindFromMime, ALLOWED_*, MAX_*
server/utils/mediaSerializer.js    (순수) toParentMedia, toParentAlbum — 화이트리스트 직렬화
server/utils/faceMatch.js          (순수) nextTagSource, mergeMatches, bestPerStudent
server/services/albumService.js    Drive + DB 를 엮는 유일한 곳(폴더 생성, 업로드 세션, complete 검증,
                                   재매칭). 컨트롤러는 얇게 유지
server/models/GoogleDriveAccount.js
server/models/EventMedia.js
server/models/MediaFace.js
server/models/MediaTag.js
server/models/ChildFaceProfile.js
server/controllers/driveController.js        선생님 Drive 연결
server/controllers/albumController.js        선생님 앨범·미디어
server/controllers/parentAlbumController.js  학부모 앨범·미디어·자녀 얼굴
server/routes/drive.js
```

**클라이언트**

```
client/src/utils/faceClient.js       face-api 지연 로딩, detectDescriptors(imageBitmap|File)
client/src/utils/driveUpload.js      resumable PUT(8MB 청크·진행률·재개) — XMLHttpRequest
client/src/utils/imagePrep.js        (순수 가능한 부분 분리) EXIF takenAt, 축소본, kind 판정
client/src/utils/mediaUrls.js        (순수) 썸네일·원본·미리보기 URL, 파일명
client/src/utils/albumFilter.js      (순수) 필터·날짜 그룹·카운트 — 화면과 분리해 단위 테스트
client/src/pages/Events/EventAlbumSection.jsx   선생님 앨범(통계·버튼·필터·그리드·선택 액션)
client/src/pages/Events/MediaDetailModal.jsx    얼굴 박스·태그·정보
client/src/components/album/MediaGrid.jsx       썸네일 그리드(선생님·학부모 공용)
client/src/components/album/MediaViewer.jsx     전체 화면 뷰어(좌우·저장·원본·삭제)
client/src/components/album/UploadSheet.jsx     파일 선택·검증·진행률·완료 요약
client/src/pages/parent/ParentAlbumList.jsx     사진 탭
client/src/pages/parent/ParentAlbum.jsx         갤러리(우리 아이만 토글·후보 확인)
client/src/pages/parent/ChildFaceCard.jsx       자녀 얼굴 등록
client/src/pages/Settings/DriveAccountCard.jsx  Google Drive 연결 카드
client/public/models/*                          face-api 모델 3종(약 6.6MB)
```

## 4. 데이터 모델 (확정)

`server/database.js` 의 `initDatabase()` 끝에 **이 순서로** 추가한다. 모든 식별자는 기존 규칙대로 camelCase + 큰따옴표, 시각은 `TEXT` ISO.

```sql
-- 1) 선생님 ↔ Google 계정
CREATE TABLE IF NOT EXISTS google_drive_accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  "googleSub" TEXT NOT NULL,
  "googleEmail" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiresAt" TEXT NOT NULL,
  "rootFolderId" TEXT,
  "rootFolderName" TEXT NOT NULL DEFAULT 'RG Manager',
  status TEXT NOT NULL DEFAULT 'connected',   -- connected | error
  "lastError" TEXT,
  "connectedAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- 2) events 확장 (CREATE TABLE events 뒤에 위치)
ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveFolderName" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "driveAccountId" INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumUploadOpen" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumCreatedAt" TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumCheckedAt" TEXT;

-- 3) 미디어
CREATE TABLE IF NOT EXISTS event_media (
  id SERIAL PRIMARY KEY,
  "eventId" INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  "driveFileId" TEXT UNIQUE,
  kind TEXT NOT NULL,                          -- image | video
  "originalName" TEXT NOT NULL,
  "driveName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  width INTEGER, height INTEGER, "durationMs" INTEGER,
  "takenAt" TEXT NOT NULL,
  "uploaderUserId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "uploaderRole" TEXT NOT NULL,                -- teacher | parent
  "uploaderStudentId" INTEGER REFERENCES students(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'uploading',    -- uploading | ready | missing | deleted
  "isHidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "faceStatus" TEXT NOT NULL DEFAULT 'pending',-- pending | done | none | failed | skipped
  "faceCount" INTEGER NOT NULL DEFAULT 0,
  "faceAnalyzedAt" TEXT, "faceError" TEXT,
  "uploadSessionUri" TEXT,
  "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_media_gallery
  ON event_media ("eventId", status, "isHidden", "takenAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_event_media_uploader ON event_media ("uploaderUserId");
CREATE INDEX IF NOT EXISTS idx_event_media_face ON event_media ("eventId", "faceStatus");

-- 4) 사진 속 얼굴 (벡터·위치만)
CREATE TABLE IF NOT EXISTS media_faces (
  id SERIAL PRIMARY KEY,
  "mediaId" INTEGER NOT NULL REFERENCES event_media(id) ON DELETE CASCADE,
  box TEXT NOT NULL,                           -- JSON {x,y,w,h} 0~1 상대 좌표
  score REAL NOT NULL DEFAULT 0,
  descriptor TEXT NOT NULL,                    -- base64(Float32Array(128))
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_faces_media ON media_faces ("mediaId");

-- 5) 자녀 기준 얼굴
CREATE TABLE IF NOT EXISTS child_face_profiles (
  id SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  "teacherUserId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "parentUserId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
  "createdBy" TEXT NOT NULL DEFAULT 'parent',  -- parent | teacher
  "storagePath" TEXT,
  descriptor TEXT NOT NULL,
  "consentAt" TEXT,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_child_face_student ON child_face_profiles ("studentId");
CREATE INDEX IF NOT EXISTS idx_child_face_teacher ON child_face_profiles ("teacherUserId");

-- 6) 태그
CREATE TABLE IF NOT EXISTS media_tags (
  id SERIAL PRIMARY KEY,
  "mediaId" INTEGER NOT NULL REFERENCES event_media(id) ON DELETE CASCADE,
  "studentId" INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                        -- face | candidate | manual | parent_confirmed | excluded
  distance REAL,
  "faceId" INTEGER REFERENCES media_faces(id) ON DELETE SET NULL,
  "createdByUserId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
  UNIQUE ("mediaId", "studentId")
);
CREATE INDEX IF NOT EXISTS idx_media_tags_student ON media_tags ("studentId", source);

-- 7) 임계값 시드
INSERT INTO app_settings (key, value, "updatedAt") VALUES
  ('face_match_threshold', '0.50', now), ('face_candidate_threshold', '0.60', now)
ON CONFLICT (key) DO NOTHING;
```

**태그 출처 우선순위** `manual > parent_confirmed > face > candidate`, `excluded` 는 자동 매칭이 되살리지 못한다 — 02 §1.6 표 그대로, `faceMatch.nextTagSource` 순수 함수로 구현하고 표 전체를 단위 테스트한다.

## 5. 서버 API (확정)

02 §6 에서 **바뀐 것만** 표시(★). 나머지는 그대로.

### 5.1 선생님 · Drive `/api/drive` (`rejectParents` + `verifyToken`)

| 경로 | 설명 |
|---|---|
| `GET /account` | `{ connected, email, rootFolderName, status, lastError, quota }` |
| `GET /connect` | Google 동의 화면으로 302. `state` = 1회용 난수(10분, 서명된 JWT 로 사용자에 묶음) |
| `GET /callback` | 코드 교환 → 계정 저장 → 루트 폴더 확보 → `/settings?drive=connected` 로 302 |
| `PATCH /account` | `{ rootFolderName }` |
| `DELETE /account` | revoke + 삭제 |

★ `GET /callback` 은 **`verifyToken` 을 쓰지 않는다**(브라우저 리다이렉트라 Authorization 헤더가 없다). 대신 `state` 안의 서명된 사용자 id 를 신뢰하고, 그 토큰은 10분 만료·1회용이다.

### 5.2 선생님 · 앨범 `/api/events/:id/album`, `/api/events/:id/media`

02 §6.2 그대로. ★ `POST /media/:mediaId/complete` 는 **JSON** 을 받는다(축소본을 보내지 않으므로 raw 바이트가 필요 없다):

```
POST /api/events/:id/media/:mediaId/complete
{ driveFileId, takenAt, width?, height?,
  faces?: [{ box:{x,y,w,h}, score, descriptor }]   // 없으면 faceStatus='skipped'
}
→ { media, faceStatus, faceCount, tags }
```

### 5.3 학부모 `/api/parent/*`

02 §6.3 그대로. ★ 자녀 얼굴 등록은 **두 조각**으로 나뉜다:

```
POST /api/parent/children/:childId/faces          JSON { descriptor, consent: true }   → 벡터 저장 + 즉시 매칭
POST /api/parent/children/:childId/faces/:id/image  raw JPEG(≤1MB)                     → 썸네일 보관(선택)
```
얼굴 개수 검사(0개·2개 이상 거절)는 **브라우저**가 하고, 서버는 `descriptor` 가 정확히 128차원인지와 동의 여부만 검증한다. 이미지 보관은 학부모가 나중에 "어떤 사진을 등록했더라" 를 확인하기 위한 것이라 **선택**이며, Supabase Storage 가 설정돼 있지 않으면 건너뛴다(FR-261 의 비공개 버킷 규칙은 유지).

## 6. 얼굴 파이프라인 (확정)

```
[업로드]  브라우저: 파일 → createImageBitmap → face-api(tiny detector + landmark tiny + recognition)
          → [{box(0~1), score, descriptor(Float32Array 128)}]
          → base64 로 직렬화해 complete 요청 본문에 첨부
[서버]    descriptor 유효성 검사(128, 유한수) → media_faces 저장 → faceStatus/faceCount 갱신
          → 같은 선생님의 child_face_profiles 전부 로드 → 얼굴×프로필 거리 최소값
          → classifyDistance(≤0.50 face / ≤0.60 candidate) → mergeMatches → media_tags upsert
[자녀 등록] 브라우저에서 같은 방식으로 1장 → 얼굴 정확히 1개 확인 → descriptor 전송
          → child_face_profiles 저장 → 그 선생님 앨범의 media_faces 전부와 매칭 → 태그 생성
          → 응답 { matched: { albums, photos } }
[재분석]  선생님 [미분석 다시 분석] → 브라우저가 대상 사진의 Drive 썸네일(w1600)을 받아 계산
          → 5장 단위로 서버에 전송 → 진행률 표시
```

- 모델 자산은 `client/public/models/` 에 두고 `faceClient.js` 가 **`await import('@vladmandic/face-api')`** 로 지연 로딩한다. 첫 사용 시 1회 로딩(6.6MB, 이후 브라우저 캐시).
- 로딩 실패·미지원 환경이면 `faces` 없이 업로드를 계속한다(`skipped`).
- e2e·단위 테스트는 **합성 벡터**를 직접 API 로 보내 검증한다(브라우저 ML 을 테스트에서 돌리지 않는다).

## 7. 권한 (구현 규칙)

```js
// utils/albumAccess.js — 순수 함수, 컨트롤러는 이 결과만 본다
isConfirmedParent({ registrations, competitionStudentIds, childStudentIds })   // FR-200
canUpload({ isOwner, isConfirmed, albumUploadOpen, albumStatus, driveStatus }) // → { ok, reason }
canDeleteMedia({ role, userId, media })
```

| 경로 | 가드 |
|---|---|
| `/api/drive/*` | `rejectParents` + `verifyToken` (콜백 제외) |
| `/api/events/:id/album`, `/media/*` | `rejectParents` + `verifyToken` + **이벤트 소유**(`Event.getById(id, userId, role)` 가 null 이면 404) |
| `/api/parent/*` | `verifyToken` + `requireRole('parent')` + **확정 학부모 판정** |

학부모 응답은 `mediaSerializer.toParentMedia` 화이트리스트만 통과한다 — `driveName`, `uploaderUserId`, 다른 자녀 태그, 얼굴 박스/벡터는 **절대 나가지 않는다**. 이를 스냅샷 테스트로 고정한다(NFR-4).

## 8. 구현 순서 (단계별 커밋)

각 단계는 **테스트를 함께 쓰고 통과시킨 뒤 커밋**한다.

| 단계 | 내용 | 산출물 | 테스트 |
|---|---|---|---|
| **S1** | 스키마 + 모델 5개 + 순수 유틸 5개 | database.js, models/*, utils/{faceVector,albumAccess,mediaValidation,faceMatch,mediaSerializer}.js | 순수 유틸 단위 테스트 (거리·분류·태그 전이표·업로드 검증·파일명·직렬화 화이트리스트) |
| **S2** | `utils/googleDrive.js` + `driveController` + `routes/drive.js` + 설정 카드 | Drive 연결 전체 | fetch 목으로 토큰 갱신·폴더 생성·공유·세션·오류 매핑 단위 테스트 |
| **S3** | `albumService` + `albumController` + 선생님 라우트 | 폴더 생성/이름변경/토글/통계/새로고침 | 컨트롤러 단위 테스트(권한·검증·오류) |
| **S4** | 업로드 세션 + complete(+얼굴 저장·매칭) + 삭제·숨김·태그·재매칭 | 미디어 API 전체 | 컨트롤러 + 매칭 통합(합성 벡터) |
| **S5** | 학부모 API (`parentAlbumController`) + 자녀 얼굴 | 앨범 목록·갤러리·업로드·확인·얼굴 등록 | 확정 판정·화이트리스트·403 케이스 |
| **S6** | 선생님 화면 (`EventAlbumSection`, `MediaDetailModal`, `MediaGrid`, `UploadSheet`, `DriveAccountCard`) | 목업의 선생님 화면 | 컴포넌트 테스트(RTL) + 순수 유틸 |
| **S7** | 학부모 화면 (`ParentAlbumList`, `ParentAlbum`, `MediaViewer`, `ChildFaceCard`, 탭·라우트) | 목업의 학부모 화면 | 컴포넌트 테스트 + 필터 순수 함수 |
| **S8** | face-api 지연 로딩·모델 자산·업로드 파이프라인 연결 | 실제 얼굴 인덱싱 | 로딩 실패 시 `skipped` 경로 테스트 |
| **S9** | e2e 스펙 + 브라우저 검증 + 문서 갱신 | e2e 통과, 스크린샷 | 아래 §9 |

## 9. 테스트 계획

### 9.1 단위 (Jest)

- **서버**: 순수 유틸 6개(거리/분류/전이표/검증/파일명/직렬화), 컨트롤러 4개(권한 매트릭스 전 조합, 오류 코드, 트랜잭션 롤백), `googleDrive` (fetch 목: 401→갱신→재시도, `invalid_grant`→`status='error'`, `storageQuotaExceeded` 매핑)
- **클라이언트**: `albumFilter`(토글·칩 조합·날짜 그룹), `mediaUrls`, `imagePrep`(EXIF 파싱·kind 판정), 컴포넌트(그리드 렌더·토글 동작·업로드 검증 표시·뷰어 이동/저장 버튼 노출 규칙·얼굴 등록 동의 게이트)
- 기존 테스트(서버 470 / 클라이언트 335)가 **모두 그대로 통과**해야 한다

### 9.2 e2e (Playwright)

`client/e2e/setup.mjs` 를 확장해 **Drive 없이** 앨범 상태를 만든다: 이벤트에 `driveFolderId='e2e-folder'`, `albumStatus='ready'` 를 직접 UPDATE 하고, `event_media` 를 SQL 로 몇 건 넣고(하나는 학부모 업로더), `media_faces`·`child_face_profiles` 에 **합성 벡터**를 넣어 매칭이 걸리게 한다.

| 스펙 | 시나리오 |
|---|---|
| `parent.spec.mjs` | 사진 탭 → 앨범 카드 → 갤러리 → **우리 아이만 토글** → 개수 감소 확인 → 사진 클릭 → 뷰어 → 저장 버튼 노출 → 미확정 이벤트 앨범 403 안내 |
| `teacher.spec.mjs` | 이벤트 상세 앨범 섹션(폴더 없음 → Drive 미연결 안내) → 폴더 있는 이벤트에서 그리드·필터·숨김·수동 태그 → 학부모 토큰으로 `/api/drive`, `/api/events/:id/album`, `/api/events/:id/media` 403 |

썸네일 이미지는 Drive 를 가리키므로 로드되지 않는다 — **DOM 과 개수만 검증**한다(픽셀 검증 없음).

### 9.3 브라우저 검증 (수동 대체)

빌드된 앱을 로컬 Express 로 띄우고 Playwright 스크립트로 선생님·학부모 화면을 클릭하며 스크린샷을 남긴다(`screenshots/`). 콘솔 에러 0건을 확인한다.

### 9.4 Google Drive — 이번 실행에서 테스트하지 않음

사용자 지시. 다음은 **코드로만** 보장하고 실제 호출은 하지 않는다: OAuth 왕복, 폴더 생성, 공유 설정, 업로드 세션, 파일 조회/휴지통, 용량 조회.
대신 **미연결 상태의 동작**을 전 구간에서 검증한다 — 선생님에게는 "설정에서 연결" 안내, 학부모에게는 업로드 버튼 비활성, API 는 `400 drive_not_connected`.

## 10. 배포 · 스모크 테스트

1. 로컬에서 서버·클라이언트 테스트 + e2e 전부 통과, 브라우저 확인
2. `feat/photo-albums` → **`main` 병합 후 push** (main push = Vercel 프로덕션 자동 배포)
3. 배포 완료 후 **프로덕션 스모크**:
   - `/` 로그인 화면 정상, 기존 화면(학생·수업·이벤트) 회귀 없음
   - 선생님 로그인 → 설정에 **Google Drive 카드**가 보이고 "연결하기" 안내가 뜬다
   - 이벤트 상세 → **사진·영상 섹션**이 "먼저 Google Drive 를 연결해 주세요" 로 뜬다
   - 학부모 계정 → **사진 탭**이 보이고 앨범이 없으면 빈 상태 문구가 뜬다
   - `/api/parent/albums`, `/api/events/:id/album` 이 200/403 을 규칙대로 돌려준다
   - 콘솔·네트워크 500 없음, 기존 API 정상
4. 문제가 있으면 수정 → 테스트 → 다시 push → 재검증

## 11. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | `drive.file` 범위라 앱 밖에서 넣은 파일이 안 보인다 | 화면에 고지. 필요해지면 `drive.readonly`(검수 필요) |
| R-2 | 모델 자산 6.6MB 가 저장소·배포에 부담 | 정적 파일이라 번들과 무관. 업로드/얼굴 등록 화면에서만 로딩 |
| R-3 | 브라우저 얼굴 검출이 기기·형식에 따라 실패 | `skipped` 로 두고 업로드는 성공. 수동 태그·재분석으로 보완 |
| R-4 | 얼굴 벡터 JS 매칭이 규모가 커지면 느려짐 | 선생님 단위로 범위가 좁다. 필요 시 pgvector 로 컬럼만 승격(C-1) |
| R-5 | Drive 미연결 상태로 배포 → 기능 확인 불가 | 미연결 경로를 1급 상태로 구현·테스트(§9.4). 연결에 필요한 것은 §12 |
| R-6 | 다른 세션과 같은 저장소에서 충돌 | **전용 worktree** `rg-manager-photos` 에서 작업하고 main 병합 시점에만 합류 |

## 12. Google 연동에 필요한 것 (사용자 준비물)

구현이 끝난 뒤 **실제로 동작시키려면** 다음이 필요하다. 자세한 절차는 작업 완료 보고에 정리한다.

1. **Google Cloud 프로젝트**에서 **Google Drive API 사용 설정**
2. **OAuth 클라이언트 ID(웹 애플리케이션)** 생성 → `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
3. **승인된 리디렉션 URI** 등록: `https://rg-manager.vercel.app/api/drive/callback` (+ 로컬 `http://localhost:5001/api/drive/callback`)
4. **OAuth 동의 화면**: 외부(External) · 게시(프로덕션). 범위는 `drive.file` 하나뿐이라 **Google 검수 불필요**
5. Vercel 환경변수에 위 두 개 등록 후 재배포
6. 선생님 계정으로 로그인 → 설정 → Google Drive 연결 (선생님 본인의 Google 계정, Drive 용량이 사진 저장 공간이 된다)
