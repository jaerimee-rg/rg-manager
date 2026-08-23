# 대회 사진 · 영상 공유 — 데이터 모델 · API 설계

> 상태: **1차 초안 — 2026-08-23** · 관련: [01-requirements.md](./01-requirements.md) (FR 번호는 그 문서 기준) ·
> 기존 스키마: [parent-portal/02-data-model-api.md](../parent-portal/02-data-model-api.md) (`events`, `event_registrations`, `parent_children`)

## 1. 스키마 (PostgreSQL / Supabase, `server/database.js`)

### 1.0 확장

```sql
CREATE EXTENSION IF NOT EXISTS vector;   -- Supabase 기본 제공(pgvector). 로컬 PostgreSQL 은 `brew install pgvector` 후 동일
```

로컬 DB 에 pgvector 가 없으면 `initDatabase()` 가 **경고만 내고** 얼굴 테이블 생성을 건너뛴다(앨범 업로드·조회는 동작, 인덱싱은 `faceStatus='skipped'`). 서버는 `isFaceIndexAvailable()` 로 분기한다.

### 1.1 `google_drive_accounts` — 선생님 ↔ Google 계정 (FR-210~215)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `userId` | INTEGER NOT NULL UNIQUE → `users(id)` ON DELETE CASCADE | 선생님. 계정당 1개 |
| `googleSub` | TEXT NOT NULL | Google 계정 고유 id (`id_token.sub`) |
| `googleEmail` | TEXT NOT NULL | 설정 화면 표시용 |
| `accessToken` | TEXT NOT NULL | 서버 전용. 클라이언트로 내려보내지 않는다 |
| `refreshToken` | TEXT NOT NULL | `prompt=consent` 로 항상 받는다 |
| `tokenExpiresAt` | TEXT NOT NULL | ISO. 만료 60초 전이면 갱신 |
| `rootFolderId` | TEXT NULL | `RG Manager` 폴더 id (FR-211) |
| `rootFolderName` | TEXT NOT NULL DEFAULT 'RG Manager' | |
| `status` | TEXT NOT NULL DEFAULT 'connected' | `'connected'` / `'error'` (refresh 실패, FR-212) |
| `lastError` | TEXT NULL | 마지막 Drive 오류 메시지(배너용) |
| `connectedAt`, `updatedAt` | TEXT NOT NULL | |

카카오 토큰(`users.kakaoAccessToken` 등)처럼 `users` 에 컬럼을 늘리지 않고 **별도 테이블**로 둔다 — 연결 해제가 행 삭제로 끝나고, 학부모 `users` 행에 빈 컬럼이 생기지 않는다.

### 1.2 `events` — 앨범 컬럼 추가 (FR-220~226, 238)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `driveFolderId` | TEXT NULL | 앨범 폴더 id. NULL = 앨범 없음 |
| `driveFolderName` | TEXT NULL | 선생님이 입력한 이름(표시용, Drive 와 동기화) |
| `driveAccountId` | INTEGER NULL → `google_drive_accounts(id)` ON DELETE SET NULL | 어느 Google 연결로 만들었는지(FR-214). NULL 이 되면 "이전 계정의 앨범" |
| `albumUploadOpen` | BOOLEAN NOT NULL DEFAULT TRUE | 업로드 받기 토글(FR-238) |
| `albumStatus` | TEXT NOT NULL DEFAULT 'none' | `'none'` / `'ready'` / `'missing'`(폴더 404, FR-222) / `'unshared'`(링크 공유 꺼짐, FR-221) |
| `albumCreatedAt`, `albumCheckedAt` | TEXT NULL | 생성 시각, 마지막 [새로고침] |

인덱스: 기존 `("userId", date)` 로 충분. 학부모 앨범 목록은 `driveFolderId IS NOT NULL AND isPublished` 조건을 추가한다.

### 1.3 `event_media` — 사진 · 영상 (FR-230~239, 290~291)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `eventId` | INTEGER NOT NULL → `events(id)` ON DELETE CASCADE | |
| `driveFileId` | TEXT NULL UNIQUE | 업로드 중엔 NULL, `complete` 뒤 채움 |
| `kind` | TEXT NOT NULL | `'image'` / `'video'` (MIME 으로 결정) |
| `originalName` | TEXT NOT NULL | 사용자 파일명(200자) |
| `driveName` | TEXT NOT NULL | `YYYYMMDD_업로더_원본명` (FR-233) |
| `mimeType` | TEXT NOT NULL | |
| `size` | BIGINT NOT NULL | 바이트 |
| `width`, `height` | INTEGER NULL | 사진: 축소본 기준이 아니라 **원본**(EXIF/Drive `imageMediaMetadata`). 영상: Drive `videoMediaMetadata` |
| `durationMs` | INTEGER NULL | 영상만 |
| `takenAt` | TEXT NOT NULL | ISO. EXIF `DateTimeOriginal` 또는 업로드 시각(FR-236) |
| `uploaderUserId` | INTEGER NULL → `users(id)` ON DELETE SET NULL | |
| `uploaderRole` | TEXT NOT NULL | `'teacher'` / `'parent'` (사용자 삭제 뒤에도 "학부모" 표시용) |
| `uploaderStudentId` | INTEGER NULL → `students(id)` ON DELETE SET NULL | 학부모 업로드 시 파일명에 쓴 자녀(FR-233) |
| `status` | TEXT NOT NULL DEFAULT 'uploading' | `'uploading'` / `'ready'` / `'missing'` / `'deleted'` |
| `isHidden` | BOOLEAN NOT NULL DEFAULT FALSE | 선생님 숨김(FR-244) |
| `faceStatus` | TEXT NOT NULL DEFAULT 'pending' | `'pending'` / `'done'` / `'none'` / `'failed'` / `'skipped'` (FR-251) |
| `faceCount` | INTEGER NOT NULL DEFAULT 0 | |
| `faceAnalyzedAt` | TEXT NULL | |
| `faceError` | TEXT NULL | 실패 사유(선생님 화면 툴팁) |
| `uploadSessionUri` | TEXT NULL | resumable 세션(재개·정리용). `ready` 가 되면 NULL 로 |
| `createdAt`, `updatedAt` | TEXT NOT NULL | |

인덱스: `("eventId", status, "isHidden", "takenAt" DESC, id DESC)` (갤러리 커서), `("uploaderUserId")`, `("eventId", "faceStatus")` (재분석 대상), `(status, "createdAt")` (24시간 정리).

### 1.4 `media_faces` — 사진 속 얼굴 벡터 (FR-250~255)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `mediaId` | INTEGER NOT NULL → `event_media(id)` ON DELETE CASCADE | |
| `box` | TEXT NOT NULL | JSON `{ "x":0.41, "y":0.22, "w":0.08, "h":0.11 }` — **상대 좌표(0~1)** 라 원본·축소본 어느 크기에도 그릴 수 있다 |
| `score` | REAL NOT NULL | 검출 점수 |
| `descriptor` | `vector(128)` NOT NULL | face-api FaceRecognitionNet 임베딩 |
| `createdAt` | TEXT NOT NULL | |

인덱스: `("mediaId")`. 벡터 인덱스는 **처음엔 없음** — 선생님 1명의 앨범 합계가 수만 얼굴을 넘으면 `CREATE INDEX … USING hnsw (descriptor vector_l2_ops)` 추가. 얼굴 **이미지는 저장하지 않는다**.

### 1.5 `child_face_profiles` — 자녀 기준 얼굴 (FR-260~265)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `studentId` | INTEGER NOT NULL → `students(id)` ON DELETE CASCADE | 프로필은 **학생 단위** |
| `teacherUserId` | INTEGER NOT NULL → `users(id)` ON DELETE CASCADE | 매칭 범위 한정(같은 선생님) |
| `parentUserId` | INTEGER NULL → `users(id)` ON DELETE CASCADE | 올린 학부모. 선생님이 올리면 NULL |
| `createdBy` | TEXT NOT NULL | `'parent'` / `'teacher'` |
| `storagePath` | TEXT NULL | Supabase `child-faces/{teacherId}/{studentId}/{uuid}.jpg`. 선생님이 앨범 얼굴에서 추가(FR-282)하면 NULL |
| `descriptor` | `vector(128)` NOT NULL | |
| `consentAt` | TEXT NULL | 동의 체크 시각(학부모 업로드 시 NOT NULL 로 검증) |
| `createdAt` | TEXT NOT NULL | |

인덱스: `("studentId")`, `("teacherUserId")`. 제약: 학생당 최대 5행, 학부모당 최대 3행 — 애플리케이션에서 검사.

### 1.6 `media_tags` — 미디어 ↔ 학생 (FR-270~275)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | SERIAL PK | |
| `mediaId` | INTEGER NOT NULL → `event_media(id)` ON DELETE CASCADE | |
| `studentId` | INTEGER NOT NULL → `students(id)` ON DELETE CASCADE | |
| `source` | TEXT NOT NULL | `'face'` / `'candidate'` / `'manual'` / `'parent_confirmed'` / `'excluded'` |
| `distance` | REAL NULL | 자동 매칭 최소 거리(`face`·`candidate`) |
| `faceId` | INTEGER NULL → `media_faces(id)` ON DELETE SET NULL | 어느 얼굴과 맞았는지(선생님 오버레이) |
| `createdByUserId` | INTEGER NULL → `users(id)` ON DELETE SET NULL | `manual`·`parent_confirmed`·`excluded` 의 주체 |
| `createdAt`, `updatedAt` | TEXT NOT NULL | |

제약: `UNIQUE ("mediaId", "studentId")` — 미디어 × 학생 1행, 출처는 우선순위(FR-271)에 따라 **승격만** 된다. 인덱스: `("studentId", source)`, `("mediaId")`.

**출처 전이 규칙** (순수 함수 `nextTagSource(current, incoming)`)

| 현재 \ 들어옴 | `face` | `candidate` | `manual` | `parent_confirmed` | `excluded` |
|---|---|---|---|---|---|
| (없음) | face | candidate | manual | parent_confirmed | excluded |
| `candidate` | face | candidate(거리 갱신) | manual | parent_confirmed | excluded |
| `face` | face(거리 갱신) | **face 유지** | manual | parent_confirmed | excluded |
| `parent_confirmed` | 유지 | 유지 | manual | 유지 | excluded(본인 또는 선생님만) |
| `manual` | 유지 | 유지 | 유지 | 유지 | excluded(선생님만) |
| `excluded` | **유지** | **유지** | manual(선생님이 되살림) | parent_confirmed(학부모가 되살림) | 유지 |

재매칭은 `face`/`candidate` 만 계산해 이 규칙으로 합친다. 자동 매칭 결과가 임계값 밖으로 나간 기존 `face`/`candidate` 행은 삭제한다(`manual` 등은 그대로).

### 1.7 기타

- `app_settings` 키 추가: `face_match_threshold` (`'0.50'`), `face_candidate_threshold` (`'0.60'`), `face_min_size_px` (`'40'`). 읽기는 `aiSettings.js` 와 같은 패턴(DB > env > 기본값, 실패해도 기본값).
- `notification_settings` 의 `NOTIFICATION_EVENTS` 에 `{ eventType: 'ALBUM_UPLOAD', label: '앨범 업로드 알림', description: '학부모가 앨범에 사진·영상을 올리면 하루 한 번 묶어 알립니다.' }` (FR-295).
- Supabase Storage 버킷 `child-faces` — **비공개**. `utils/storage.js` 의 `uploadFile(path, buffer, type, { bucket })` 로 버킷 파라미터 추가, `createSignedUrl(path, expiresIn)` 추가.

## 2. Google Drive 연동 방식

| 항목 | 선택 | 비고 |
|---|---|---|
| 범위 | `https://www.googleapis.com/auth/drive.file` | 앱이 만든 파일·폴더만 접근. Google OAuth 검수 **불필요**(비민감 범위). 앱 밖에서 폴더에 넣은 파일은 **보이지 않는다**(R-1) |
| 라이브러리 | 없음 — `fetch` 로 REST 직접 호출 | `googleapis` SDK 는 번들이 크다(수십 MB). 기존 `storage.js`·`kakaoMessage.js` 와 같은 방식 |
| 토큰 | `google_drive_accounts`. `getValidAccessToken(userId)` 가 만료 60초 전이면 `https://oauth2.googleapis.com/token` 로 갱신. `invalid_grant` → `status='error'` | |
| 폴더 생성 | `POST /drive/v3/files { name, mimeType:'application/vnd.google-apps.folder', parents:[rootFolderId] }` | 루트는 `parents` 없이 |
| 링크 공유 | `POST /drive/v3/files/{id}/permissions { type:'anyone', role:'reader' }` — 폴더에 1회. 하위 파일은 상속 | `drive.file` 로 앱이 만든 폴더에 허용 |
| 업로드 세션 | `POST /upload/drive/v3/files?uploadType=resumable` + 헤더 `Authorization`, `X-Upload-Content-Type`, `X-Upload-Content-Length`, **`Origin: <APP_URL>`**, 본문 `{ name, parents:[folderId] }` → 응답 `Location` = 세션 URI | `Origin` 을 넣어야 브라우저의 `PUT` 에 CORS 허용 헤더가 붙는다. 세션 URI 자체가 자격 증명이라 브라우저는 토큰이 필요 없다 |
| 검증 | `GET /drive/v3/files/{id}?fields=id,name,mimeType,size,parents,trashed,imageMediaMetadata,videoMediaMetadata` | `complete` 때 부모 폴더·크기 확인 |
| 썸네일 | `https://drive.google.com/thumbnail?id={id}&sz=w400` / `w1600` (링크 공유된 파일) | 비공식 엔드포인트지만 오래 안정적. 대안: `files.get(fields=thumbnailLink)` (수 시간 만료) — [새로고침] 때 갱신하는 방식으로 전환 가능 |
| 원본·재생 | `https://drive.google.com/file/d/{id}/view`, `…/preview`(iframe) | |
| 삭제 | `PATCH /drive/v3/files/{id} { trashed: true }` | 영구 삭제(`DELETE`)는 쓰지 않는다(FR-281 복구 가능) |
| 용량 | `GET /drive/v3/about?fields=storageQuota` | 설정·앨범 섹션 표시(NFR-7) |
| 재분석 입력 | `GET https://drive.google.com/thumbnail?id={id}&sz=w1600` (JPEG) 또는 `files.get?alt=media` | HEIC 도 JPEG 로 받을 수 있다(FR-234) |

## 3. 업로드 시퀀스 (FR-232)

```mermaid
sequenceDiagram
  participant B as 브라우저(학부모/선생님)
  participant S as 서버(Vercel)
  participant D as Google Drive
  participant P as Supabase Postgres

  B->>S: POST /api/…/media/uploads { files:[{name,mimeType,size}] }
  S->>S: 권한(소유/확정, uploadOpen), validateUpload, buildDriveName
  S->>D: POST upload?uploadType=resumable (선생님 토큰, Origin)
  D-->>S: 201 Location: <sessionUri>
  S->>P: INSERT event_media(status='uploading', uploadSessionUri)
  S-->>B: [{ mediaId, sessionUri, driveName }]
  loop 8MB 청크 (3개 파일 병렬)
    B->>D: PUT sessionUri  Content-Range: bytes a-b/size
    D-->>B: 308 Resume Incomplete | 200 {id,name,mimeType,size}
  end
  B->>B: 사진이면 축소본(1600px JPEG) + EXIF takenAt
  B->>S: POST /api/…/media/:mediaId/complete (multipart: driveFileId, takenAt, preview.jpg)
  S->>D: GET files/{id}?fields=parents,size,mimeType,…
  S->>S: 부모 폴더 = 앨범 폴더, size 일치 확인
  S->>S: face-api 검출·임베딩 (축소본, 메모리)
  S->>P: UPDATE event_media(status='ready', faceStatus, faceCount); INSERT media_faces
  S->>P: 매칭 SQL → media_tags upsert (FR-270)
  S-->>B: { media, faceStatus, faceCount, myChildTags }
```

끊김 재개: 브라우저가 `PUT sessionUri` + `Content-Range: bytes */size` 로 현재 오프셋을 묻고 이어서 보낸다. 새로고침으로 세션 URI 를 잃으면 `GET /api/…/media?status=uploading&mine=1` 로 `uploadSessionUri` 를 되찾는다(24시간 내).

## 4. 서버 구성

```
server/
  utils/
    googleDrive.js        # OAuth URL/토큰 교환·갱신, createFolder, shareAnyoneReader, renameFile,
                          # createResumableSession, getFile, trashFile, getStorageQuota, fetchThumbnail — fetch 직접
    faceIndex.js          # loadModels(1회), detectFaces(jpegBuffer) → [{box, score, descriptor}]
                          # @vladmandic/face-api + @tensorflow/tfjs(wasm) + jpeg-js. 모델: server/models-face/
    faceMatch.js          # 순수: classifyDistance, nextTagSource, mergeMatches
    albumAccess.js        # 순수: isConfirmedParent, canUpload, canDeleteMedia
    mediaValidation.js    # 순수: validateUpload, buildDriveName, sanitizeFolderName, kindFromMime
    mediaSerializer.js    # 순수: toParentView(media, myStudentIds) — 다른 자녀 태그·얼굴·업로더 식별 제거
    storage.js            # (수정) bucket 파라미터, createSignedUrl
  controllers/
    driveAccountController.js   # 선생님 Drive 연결
    eventAlbumController.js     # 폴더 생성/이름/토글/통계/새로고침 (선생님)
    eventMediaController.js     # 업로드 세션·complete·목록·bulk·태그·재분석·재매칭 (선생님 + 학부모 공용 로직)
    childFaceController.js      # 자녀 기준 얼굴
  routes/
    drive.js              # /api/drive/*            rejectParents
    eventMedia.js         # /api/events/:id/album, /api/events/:id/media   rejectParents
    parentMedia.js        # /api/parent/albums, /api/parent/events/:id/media, /api/parent/children/:id/faces   requireRole('parent')
  middleware/
    albumAccess.js        # requireEventOwner(선생님), requireConfirmedParent(학부모) → req.album = { event, account, myStudentIds }
  models-face/            # ssd_mobilenetv1, face_landmark_68, face_recognition (≈7MB)
```

- `faceIndex.js` 는 모듈 로드 시가 아니라 **첫 호출**에 모델을 올린다(콜드스타트에 다른 API 가 느려지지 않게). pgvector 가 없거나 모델이 없으면 `skipped`.
- `complete` 는 인덱싱을 **같은 요청**에서 하되 `Promise.race` 로 8초를 넘기면 `faceStatus='pending'` 으로 응답하고 재분석 대상으로 남긴다(Hobby 10초 한도).
- `mediaSerializer.toParentView` 는 **허용 목록** 방식으로 필드를 고른다(새 컬럼이 생겨도 학부모에게 새지 않도록). 테스트에서 스냅샷으로 고정.

## 5. 핵심 판정 로직 (순수 함수, 테스트 대상)

```js
// utils/albumAccess.js
// registrations: event_registrations rows of this event, competitionStudentIds: Set, children: parent_children rows (linked)
isConfirmedParent({ registrations, competitionStudentIds, children }) → boolean       // FR-200
canUpload({ role, isOwner, isConfirmed, album: { albumUploadOpen, albumStatus, accountStatus } })
  → { ok: boolean, reason?: 'not_confirmed'|'upload_closed'|'drive_error'|'album_missing'|'foreign_account' }
canDeleteMedia({ role, userId, media }) → boolean                                     // 선생님 전체 / 학부모 본인 것

// utils/mediaValidation.js
validateUpload({ name, mimeType, size }) → { ok, kind?: 'image'|'video', reason?: 'type'|'size'|'name' }   // FR-231
buildDriveName({ date: '2026-09-05', uploaderLabel: '김하은', originalName: 'IMG_1234.jpg' }) → '20260905_김하은_IMG_1234.jpg'
sanitizeFolderName(input) → { ok, name?, reason? }                                    // FR-220: 공백 trim, 금지 문자, 1~100자

// utils/faceMatch.js
classifyDistance(d, { match: 0.5, candidate: 0.6 }) → 'face' | 'candidate' | null      // FR-270
nextTagSource(current, incoming, actor) → source | 'delete' | 'keep'                   // §1.6 표
mergeMatches(existingTags, newMatches) → { upsert: [...], delete: [...] }              // 재매칭 결과 적용 계획

// utils/mediaSerializer.js
toParentView(media, { myStudentIds, myUserId }) → {
  id, kind, thumbnailUrl, previewUrl, originalUrl, takenAt, width, height, durationMs,
  uploader: 'teacher' | 'me' | 'parent',           // 다른 학부모 이름 없음
  myTags: [{ studentId, name, source }],            // 내 자녀만, candidate 포함
  // faces, other tags, driveName, uploaderUserId 는 제거
}
```

**매칭 SQL** — 사진 1장 인덱싱 직후 (같은 선생님의 모든 기준 얼굴과 비교):

```sql
SELECT p."studentId", MIN(f.descriptor <-> p.descriptor) AS distance,
       (ARRAY_AGG(f.id ORDER BY f.descriptor <-> p.descriptor))[1] AS "faceId"
FROM media_faces f
JOIN child_face_profiles p ON p."teacherUserId" = $teacherId
WHERE f."mediaId" = $mediaId
GROUP BY p."studentId"
HAVING MIN(f.descriptor <-> p.descriptor) <= $candidateThreshold;
```

기준 얼굴 1장 등록 직후 (그 학생 ↔ 선생님의 모든 앨범, FR-262):

```sql
SELECT f."mediaId", MIN(f.descriptor <-> p.descriptor) AS distance,
       (ARRAY_AGG(f.id ORDER BY f.descriptor <-> p.descriptor))[1] AS "faceId"
FROM child_face_profiles p
JOIN media_faces f ON TRUE
JOIN event_media m ON m.id = f."mediaId" AND m.status = 'ready'
JOIN events e ON e.id = m."eventId" AND e."userId" = $teacherId
WHERE p."studentId" = $studentId
GROUP BY f."mediaId"
HAVING MIN(f.descriptor <-> p.descriptor) <= $candidateThreshold;
```

결과를 `classifyDistance` → `mergeMatches` 로 `media_tags` 에 반영한다. 수만 얼굴까지는 순차 스캔으로 수백 ms 안쪽이다.

## 6. REST API

공통: JWT 필수. 👩‍🏫 = 선생님(`rejectParents` + 이벤트 소유 검사), 👪 = 학부모(`requireRole('parent')` + `requireConfirmedParent`). 오류 형식은 기존과 동일 `{ error }`.

### 6.1 Drive 연결 👩‍🏫 (`/api/drive`)

| 메서드 · 경로 | 설명 | 응답 |
|---|---|---|
| `GET /account` | 연결 상태 | `{ connected, email, rootFolderName, status, lastError, quota: { used, limit } }` |
| `GET /connect` | Google 동의 화면으로 302 (`state` = JWT 에 묶인 10분 난수) | |
| `GET /callback?code&state` | 토큰 교환 → `google_drive_accounts` upsert → 루트 폴더 확보 → `302 /settings?drive=connected` (실패 `?drive=error`) | |
| `PATCH /account` | `{ rootFolderName }` → Drive 이름 변경 | `{ rootFolderName }` |
| `DELETE /account` | revoke + 행 삭제. 앨범의 `driveAccountId` 는 SET NULL | `204` |

### 6.2 앨범 · 미디어 👩‍🏫 (`/api/events/:id/album`, `/api/events/:id/media`)

| 메서드 · 경로 | 설명 | 응답 |
|---|---|---|
| `GET /album` | 앨범 상태·통계 | `{ albumStatus, driveFolderId, driveFolderName, folderUrl, albumUploadOpen, foreignAccount, counts: { images, videos, hidden, untagged, candidates, unanalyzed }, totalSize, drive: { status, quota } }` |
| `POST /album` | `{ folderName }` → 루트 아래 폴더 생성 + 링크 공유 (FR-220~221). 400 `drive_not_connected` / `closure_event` / `already_exists` | `{ driveFolderId, driveFolderName, folderUrl }` |
| `PATCH /album` | `{ folderName?, albumUploadOpen? }` | `{ … }` |
| `POST /album/refresh` | 폴더 존재·공유 확인, 미디어 100개 단위 존재 확인, 영상 메타 보충 (FR-284) | `{ albumStatus, missing, updated }` |
| `GET /media?filter=all\|uploader:<userId>\|untagged\|candidates\|unanalyzed\|hidden&cursor=&limit=60` | 선생님용 목록 — 태그 전체·얼굴 박스 포함 | `{ items: [...], nextCursor }` |
| `GET /media/:mediaId` | 상세(얼굴·태그·업로더 실명) | |
| `POST /media/uploads` | `{ files: [{ name, mimeType, size }] }` (≤30) → 세션 생성 (FR-232 ①) | `{ items: [{ mediaId, sessionUri, driveName } \| { name, error }] }` |
| `POST /media/:mediaId/complete` | 본문 = 축소본 **raw JPEG 바이트**(`express.raw`, ≤1MB — FAQ 파일 업로드와 같은 방식, base64 금지), 메타는 쿼리 `?driveFileId=&takenAt=`. 축소본이 없으면 빈 본문 → 검증 + 인덱싱 + 매칭 | `{ media, faceStatus, faceCount, tags }` |
| `POST /media/bulk` | `{ action: 'hide'\|'show'\|'delete'\|'tag'\|'untag', mediaIds, studentIds? }` | `{ affected }` |
| `POST /media/:mediaId/tags` | `{ studentId, faceId?, addAsProfile?: boolean }` → `manual` (+ FR-282 프로필 추가) | `{ tag }` |
| `DELETE /media/:mediaId/tags/:studentId` | → `excluded` | `204` |
| `POST /media/reanalyze` | `{ batch: 5 }` → `failed/skipped(image)/pending` 5장 처리 (FR-252) | `{ processed, failed, remaining }` |
| `POST /media/rematch` | 앨범 전체 재매칭 (FR-274) | `{ added, candidates, removed }` |
| `DELETE /media/:mediaId` | 휴지통 이동 + 삭제 | `204` |

### 6.3 학부모 👪 (`/api/parent/*`)

| 메서드 · 경로 | 설명 | 응답 |
|---|---|---|
| `GET /albums` | 확정 + 앨범 있음 + 공개 이벤트, 최근순 | `{ items: [{ eventId, title, date, counts: { images, videos, mine }, previews: [thumbnailUrl×4], uploadOpen }] }` |
| `GET /events/:id/media?filter=all\|mine\|video\|uploaded&studentId?&cursor&limit=60` | `toParentView` 로 직렬화. `mine` = 내 자녀 태그(face/manual/parent_confirmed), 응답에 `candidates` 묶음 별도 | `{ items, candidates: [...], nextCursor, hiddenMineCount }` |
| `POST /events/:id/media/uploads` | 6.2 와 동일 본문. `canUpload` 검사(403 이유 코드) | 동일 |
| `POST /events/:id/media/:mediaId/complete` | 동일. 본인이 만든 `mediaId` 만 | `{ media(parent view), faceStatus, faceCount, myTags }` |
| `DELETE /events/:id/media/:mediaId` | 본인 것만 | `204` |
| `POST /events/:id/media/:mediaId/confirm` | `{ studentId, confirmed: true\|false }` → `parent_confirmed` / `excluded` (내 자녀만) | `{ tag }` |
| `GET /children/:childId/faces` | 프로필 목록(서명 URL 10분) | `{ items: [{ id, url, createdAt, mine }], max: 3 }` |
| `POST /children/:childId/faces` | 본문 raw JPEG(≤1MB) + 쿼리 `?consent=true` → 얼굴 1개 검사 → 저장(Storage 키는 ASCII 만: `{teacherId}/{studentId}/{uuid}.jpg`) → 즉시 매칭 | `{ profile, matched: { albums, photos } }`, 400 `no_face` / `multiple_faces` / `limit` / `consent_required` |
| `DELETE /children/:childId/faces/:profileId` | 본인 것만 (FR-263 규칙) | `204` |

`GET /api/parent/me`(학부모 포털 MVP)의 자녀 항목에 `faceProfileCount` 를 추가해 "얼굴 등록 안내" 여부를 결정한다.

## 7. 프론트 라우트 · 컴포넌트

| 경로 | 컴포넌트 | 비고 |
|---|---|---|
| `/settings` | `Settings` + `DriveAccountCard` | FR-210 카드 추가 |
| `/events/edit?id=`, `/events/:id/registrations` | `EventAlbumSection` | 폴더 없음/있음 두 상태. 내부: `AlbumStats`, `AlbumToolbar`, `MediaGrid`(공용), `MediaViewer`(공용), `FaceOverlay`, `TagPopover`, `BulkActionBar` |
| `/parent/photos` | `ParentAlbumList` | 학부모 포털 탭 "사진" 추가 |
| `/parent/photos/:eventId` | `ParentAlbum` | 칩 필터, `CandidateStrip`, `MediaGrid`, `UploadSheet`, `MediaViewer` |
| `/parent/me` | `ChildFaceCard` | 자녀별 얼굴 등록 |
| 공용 `utils/` | `driveUpload.js`(resumable PUT·청크·재개·동시 3개), `imagePreview.js`(축소본·EXIF 회전·`takenAt` 추출, `exifr` 사용), `mediaUrls.js`(썸네일/원본/프리뷰 URL) | 순수 로직은 vitest |

## 8. 마이그레이션 순서

1. `CREATE EXTENSION IF NOT EXISTS vector` (실패 시 경고 후 계속).
2. `google_drive_accounts` 생성.
3. `events` 에 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` 6개.
4. `event_media`, (pgvector 있으면) `media_faces`, `child_face_profiles`, `media_tags` 생성 + 인덱스.
5. `app_settings` 기본값 3개 `INSERT … ON CONFLICT DO NOTHING`, `NOTIFICATION_EVENTS` 에 `ALBUM_UPLOAD`.
6. Supabase 대시보드: 버킷 `child-faces`(비공개) 생성 — 코드가 아니라 1회 수동(또는 `storage.ensureBucket`).
7. Google Cloud: OAuth 클라이언트(웹) 생성, 리디렉션 URI `https://<도메인>/api/drive/callback` + 로컬 `http://localhost:5001/api/drive/callback`, Drive API 사용 설정, OAuth 동의 화면 **프로덕션 게시**(범위 `drive.file` 만 — 검수 없음).

모두 멱등이며 `initDatabase()` 에서 매 부팅 실행.

## 9. 환경변수

| 변수 | 설명 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Drive 연결용 OAuth 클라이언트 |
| `GOOGLE_OAUTH_REDIRECT_URI` | 기본값 `${APP_URL}/api/drive/callback` (`utils/appUrl.js` 재사용) |
| `SUPABASE_FACE_BUCKET` | 기본 `child-faces` |
| `FACE_INDEX_ENABLED` | 기본 `true`. `false` 면 인덱싱 생략(`skipped`) — 로컬에서 모델 없이 개발할 때 |
| `FACE_MODELS_DIR` | 기본 `server/models-face` |

기존 `SUPABASE_URL`/`SUPABASE_SECRET_KEY`(또는 `SUPABASE_SERVICE_ROLE_KEY`)·`DATABASE_URL` 은 그대로 쓴다. `GOOGLE_API_KEY`(이전 §10.3 안)는 **필요 없다**.

## 10. 리스크 · 대안

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | `drive.file` 은 앱이 만든 파일만 본다 → 선생님이 Drive 에서 폴더에 직접 넣은 사진은 앱에 안 보인다 | 섹션에 "사진은 앱에서 올려 주세요" 고지. 필요해지면 `drive.readonly` 추가(민감 범위 → Google 검수 + 앱 도메인 검증 필요) |
| R-2 | Drive 썸네일 URL(`/thumbnail?id=`)은 비공식 | `files.get(thumbnailLink)` 로 전환 가능하게 `mediaUrls.js` 한 곳에서만 만든다. 링크 공유가 꺼지면 둘 다 깨지므로 FR-221 경고 |
| R-3 | Vercel 함수 시간 제한(Hobby 10초) 안에 인덱싱이 못 끝남 | 축소본 ≤1MB, 8초 타임아웃 후 `pending` 유지 → 재분석 배치. 예비안: 브라우저에서 face-api 로 descriptor 를 계산해 `complete` 에 보내고 서버는 저장만(§10.3 예비안 유지) |
| R-4 | 선생님 Drive 무료 용량(15GB)이 영상으로 빨리 찬다 | 남은 용량 표시·경고(NFR-7), 영상 500MB 상한, 선생님에게 Google One 안내 |
| R-5 | Google OAuth 동의 화면이 "테스트" 상태면 테스트 사용자만 연결 가능 | 마이그레이션 7: 프로덕션 게시. `drive.file` 만이라 검수 없이 게시 가능 |
| R-6 | 브라우저가 HEIC 를 디코드 못 해 축소본이 없다 | `skipped` → 재분석에서 Drive JPEG 썸네일 사용(FR-234) |
| R-7 | 같은 선생님에 학생이 많고 형제·쌍둥이가 있으면 오매칭 | 후보 구간(0.5~0.6)과 [맞아요/아니에요]·선생님 수동 태그로 보정. 임계값은 설정으로 조정 |
| R-8 | 얼굴 벡터는 생체정보일 수 있다 | 벡터·위치만 저장, 동의 문구, 삭제 연쇄. 실서비스 전 법적 검토(NFR-5) |
| R-9 | resumable 세션 URI 유출 시 제3자가 그 파일을 대신 올릴 수 있다 | HTTPS, 업로더에게만 1회 전달, `complete` 때 크기·MIME·부모 폴더 검증, 24시간 정리 |
