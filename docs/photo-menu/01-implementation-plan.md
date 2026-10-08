# 선생님 사진 메뉴 · Google Drive 앨범 — 구현 계획

> 요약과 결정할 것: [README.md](./README.md). 바탕 설계: [../photo-sharing/](../photo-sharing/README.md).
> 이 문서는 photo-sharing 01 의 **FR-240~245(선생님 앨범 화면)** 와 **FR-200~203(누가 보나)** 을 대체한다.
> 업로드 세션, 얼굴 인덱싱, 태그 우선순위, 삭제 규칙은 그대로 둔다.

## 0. 한 줄 요약

새로 짜는 것은 **선생님 화면 3개**(사진 목록, 앨범, 설정 카드 정리)와 **공개 단계 하나**(`albumPublished` 와 공개 범위)다.
여기에 **학부모 이벤트 상세의 사진 칸** 하나가 더해진다.
선생님은 **[사진 올리기] → "어느 이벤트 사진인가요?"** 로 사진을 이벤트에 연결한다. 앨범이 없던 이벤트면 그때 이벤트 이름 폴더가 생긴다.
연결된 사진은 공개하면 학부모 **사진 탭**과 **그 이벤트 상세** 두 곳에 보인다(요청 ⑤).
Drive 연결, 폴더 생성, 업로드 세션, 학부모 갤러리는 이미 동작하는 코드를 그대로 다시 쓴다.

---

## 1. 현재 상태 (2026-10-08 확인)

### 1.1 코드 — 이미 있는 것

| 층 | 파일 | 상태 |
|---|---|---|
| Google OAuth · Drive REST | `server/utils/googleDrive.js`, `server/services/driveAccess.js`, `server/controllers/driveController.js`, `routes/drive.js` | 동작. 범위는 `drive.file` 하나. 토큰 갱신, `status='error'` 처리, 루트 폴더 확보 |
| 앨범 서비스 | `server/services/albumService.js` | 폴더 생성과 링크 공유, 이름 변경, 새로고침(40개씩), 업로드 세션, 완료 검증, 얼굴 저장과 매칭, 휴지통 삭제 |
| 선생님 앨범 API | `server/controllers/albumController.js` (`/api/events/:id/album`, `/media/*`) | 동작. 테스트 있음. **부르는 화면이 없다** |
| 학부모 앨범 API | `server/controllers/parentAlbumController.js` (`/api/parent/albums`, `/api/parent/events/:id/media*`) | 동작 |
| 접근 규칙 | `server/utils/albumAccess.js` (순수 함수) | `canViewAlbum` / `canUpload` / `canDeleteMedia` / `canManageAlbum` |
| 이름 규칙 | `server/utils/mediaValidation.js` | `defaultFolderName` = `YYYY-MM-DD 이벤트명`, `sanitizeFolderName`, 파일 이름 `20260912_하은_IMG_1234.jpg` |
| 설정 카드 | `client/src/pages/Settings/DriveAccountCard.jsx` | 동작. **인라인 스타일과 `alert`/`confirm`** 이라 디자인 시스템 이전 대상 |
| 공용 앨범 컴포넌트 | `client/src/components/album/{MediaGrid,MediaViewer,UploadSheet}.jsx` | 선생님·학부모 공용. `UploadSheet` 는 `apiBase` 만 바꾸면 선생님에게도 쓸 수 있다 |
| 학부모 화면 | `pages/parent/ParentAlbumList.jsx`, `ParentAlbum.jsx`, `ChildFaceCard.jsx`, `ParentEventDetail.jsx` 의 사진 미리보기 | 동작 |
| 선생님 앨범 화면 | ~~`pages/Events/EventAlbumSection.jsx`, `MediaDetailModal.jsx`~~ | **2026-09-01 PR #10 에서 삭제.** git 기록(`e70ae8f^`)에 있다. 디자인 시스템 이전 시기의 인라인 스타일이라 **그대로 되살리지 않고**, 호출 순서와 상태 처리만 참고한다 |

### 1.2 운영 데이터 (Supabase `vrzsommyxtvdqlpoufes`, 읽기 전용 조회)

| 항목 | 값 |
|---|---|
| `google_drive_accounts` | **0** (연결한 선생님 없음) |
| 앨범이 있는 이벤트 (`driveFolderId IS NOT NULL`) | **0** |
| `event_media` | **0** |
| 이벤트 | 22 = 대회 14 · 스페셜 6 · 휴관 2. 전부 선생님 행 소유(관리자 행 소유 0) |
| 계정 | 선생님 행 2 · 학부모 33 · 확정 신청 11 |
| **지금 규칙으로 사진을 볼 학부모가 1명이라도 있는 이벤트** (확정 신청 또는 `competition_students`) | 대회 **9/14**, 스페셜 **2/6** → D-2 의 근거 |

옮길 데이터가 없으므로 **백필도, 옛 앨범과의 호환도 필요 없다.**

### 1.3 보안 상태 — 차단 사항

```
relname                rls    api_grants
google_drive_accounts  false  anon, authenticated, service_role
event_media            false  anon, authenticated, service_role
media_faces            false  anon, authenticated, service_role
media_tags             false  anon, authenticated, service_role
child_face_profiles    false  anon, authenticated, service_role
events (비교)          false  (없음)  ← 앱이 직접 만든 표의 정상 모양
```

앨범 표들은 MCP 로 만들어져 Supabase 기본 권한이 붙었다. 그래서 **공개 REST API 로 읽고 쓸 수 있다.**
지금은 비어 있지만, 선생님이 연결하는 순간 `google_drive_accounts.refreshToken` 이 들어간다. 그 토큰으로 그 선생님 Drive 의 앱 파일을 읽고 쓸 수 있다.
→ **S0 에서 회수한다.** 2026-10-04 에 보고했고 회수 승인을 기다리는 중이다.

### 1.4 Google 설정 상태 (2026-10-08 사용자 확인으로 갱신)

선생님이 설정에서 연결을 눌렀더니 Google 이 `Error 403: access_denied`(**"has not completed the Google verification process … can only be accessed by developer-approved testers"**)를 냈다.
여기서 두 가지를 알 수 있다.

- 운영 Vercel 에 `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` 와 리디렉션 URI 는 **이미 들어가 있다.** 키가 없었다면 Google 로 넘어가지 않는다.
- OAuth 동의 화면이 **테스트(Testing)** 상태다. 테스트 사용자로 등록한 계정만 연결할 수 있다.

선생님이 1명이므로 **당장은 테스트 사용자 등록으로 진행한다**(7일마다 다시 연결). 절차와 나중에 앱을 게시하는 방법은 [02-google-setup.md](./02-google-setup.md) 에 정리했다.
OAuth 클라이언트를 만든 Google 계정은 기록에 없다. 찾는 방법은 02 §0 에 있다.

---

## 2. 요구사항

### 2.1 설정 — Google 계정 연동 (요청 ④)

| ID | 요구사항 |
|---|---|
| FR-500 | 선생님은 **설정 > Google 계정** 카드에서 본인 Google 계정을 연결하거나 해제한다. 연결은 **선생님 계정 행(`users.id`)마다 하나**다. 앨범은 항상 **이벤트 주인 행**의 연결을 쓴다 |
| FR-501 | 연결하면 내 드라이브 최상위에 **루트 폴더**(기본 `RG Manager`)가 생긴다. 이름은 카드에서 바꿀 수 있다(D-1: `RG Manager 사진` 등) |
| FR-502 | 카드에는 연결한 이메일, Drive 남은 용량, 상태(정상/끊김)를 보여 준다. 끊기면 **[다시 연결]** 을 띄운다 |
| FR-503 | 서버에 Google 설정이 없으면(`configured:false`) 버튼 대신 "관리자에게 문의해 주세요"를 보여 준다 |
| FR-504 | 해제해도 Drive 의 파일은 남는다. 앱의 앨범은 **조회만** 된다(새 업로드 불가, 기존 규칙). 해제 확인은 `window.confirm` 대신 디자인 시스템 `Modal` 로 바꾼다 |
| FR-505 | 연결 화면에는 "사진은 선생님 Google Drive 용량을 씁니다. 학부모가 올린 사진도 마찬가지예요" 를 한 줄로 알린다 |

### 2.2 사진 메뉴 — 목록과 사진 올리기 `/photos` (요청 ②③⑤)

| ID | 요구사항 |
|---|---|
| FR-510 | 선생님 사이드 메뉴의 **이벤트 관리 바로 아래**에 **사진**(아이콘 `image`)을 둔다 |
| FR-511 | 앨범 카드를 **이벤트 날짜 최근순**으로 보여 준다. 카드에는 썸네일 최대 4장, 이벤트명·날짜, 사진 수·영상 수, **공개 상태 배지(공개 / 비공개)**, 학부모가 올린 수를 넣는다 |
| FR-512 | Google 이 연결되지 않았으면 목록 위에 안내 카드를 띄운다: "사진은 선생님 Google Drive 에 저장돼요. 설정에서 Google 계정을 연결해 주세요" **[설정으로 가기]**. 이때 [사진 올리기]는 막는다. 연결이 끊긴 경우(`status='error'`)도 같다 |
| FR-513 | 목록 위 **[사진 올리기]** 를 누르면 업로드 시트의 첫 단계 **"어느 이벤트 사진인가요?"** 가 뜬다(요청 ⑤). 내 이벤트 중 **대회·스페셜**을 날짜 최근순으로 보여 준다(예정 포함, 휴관일 제외). 앨범이 있는 이벤트에는 사진 수와 공개 상태를, 없는 이벤트에는 "사진 없음"을 붙인다(맨 위 "새 폴더(이벤트) 만들기"와 헷갈리지 않게 — FR-517). 고르면 올라갈 폴더(`RG Manager / 2026-10-12 회장배 대회`)를 보여 준다 |
| FR-514 | 이벤트를 고르고 **[사진 고르기]** 로 파일을 고르면 그 이벤트의 앨범으로 올라간다. 앨범이 없던 이벤트면 **이때 Drive 폴더를 만든다**(이벤트 이름 폴더, 비공개로 시작). 다 올리면 그 앨범 화면으로 간다. 이벤트를 고르지 않고는 올릴 수 없다(D-8) |
| FR-515 | 시트에 **"다 올리면 바로 학부모에게 공개"** 체크를 둔다(기본 꺼짐). 이미 공개된 앨범을 고르면 체크 대신 "공개 중인 앨범이라 올리면 바로 학부모에게 보여요" 를 쓴다(D-7) |
| FR-516 | 앨범이 하나도 없으면 EmptyState 를 보여 준다: "사진을 올릴 때 이벤트를 고르면, 그 이벤트 이름으로 앨범이 생겨요" + [사진 올리기] |
| FR-517 | (요청 ⑥, 배포 뒤 추가) 이벤트 고르기 맨 위에 **"새 폴더 만들기"** 를 둔다. 고르면 **이름(필수, 100자)·날짜(기본 오늘)** 칸과 Drive 에 생길 폴더 이름(`RG Manager / 2026-09-27 가을 소풍`)을 보여 준다. 내 대회·스페셜·폴더가 하나도 없으면 처음부터 이것이 골라져 있다. 만들어지는 것은 **사진 전용 폴더**다 — **이벤트가 아니다.** 저장은 `events` 행 `type='folder'` 로 하지만(앨범 기능을 그대로 쓰려고) **이벤트 관리 목록·학부모 일정(다가오는/지난)·학부모 이벤트 상세·신청에는 나오지 않고**, 이벤트 폼으로 고칠 수도 없다(400 `photo_folder`). 보이는 곳은 선생님 **사진 메뉴**(앨범 카드·올리기 목록에 "폴더" 표시)와, 공개한 뒤의 학부모 **사진 탭**("📁 사진" 배지)뿐이다. 신청한 학생이 없으니 **공개 범위는 언제나 모든 학부모**다(공개 패널에 범위 선택이 없고, `participants` 로 바꾸려 하면 400 `folder_audience`). 앨범은 비공개로 시작한다. 폴더는 **[N개 올리기] 를 누를 때** `POST /api/albums` 로 만든다 — 파일을 고르다 그만두면 빈 폴더가 남지 않게. 같은 이름·날짜의 내 **폴더**가 이미 있으면 새로 만들지 않고 그것을 쓴다(이름이 같은 **이벤트**에는 붙이지 않는다). 업로드가 실패해 다시 올려도 폴더는 하나다 |
| FR-518 | (요청 ⑦⑧, 배포 뒤 추가) **사진 폴더 공유 링크.** 링크는 학부모 앱의 앨범 주소에 **그 앨범 주인 선생님의 학부모 초대 토큰**을 붙인 것이다: `https://<도메인>/parent/photos/<eventId>?invite=<token>`. 서버가 `sharePath` 로 만들어 준다(`services/albumShare.sharePathFor` — 선생님 `GET /api/events/:id/album`, 학부모 `GET /api/parent/events/:id/media` 양쪽). **선생님**: 앨범 화면 머리의 **[공유]** 가 링크를 복사한다. 공개한 앨범만 된다(비공개면 잠기고 "학부모에게 공개한 앨범만 공유할 수 있어요"). 공개 범위가 참가 확정 학부모면 복사 알림에서 알려 준다. **학부모**: 볼 수 있는 앨범 화면의 **제목 줄 오른쪽 위 링크 아이콘**이 같은 링크를 복사한다. **받은 사람**: ① 로그인돼 있고 그 선생님의 학부모면 바로 그 앨범. ② 로그인 전이면 로그인 화면("○○ 선생님이 사진을 공유했어요")을 거쳐 돌아온다(`utils/returnTo`). ③ **처음 온 사람은 그 초대로 가입** → 아이 등록 → 그 앨범. ④ 다른 선생님 쪽으로만 가입한 학부모는 그 초대로 **이 선생님과 연결된 뒤** 열린다. 로그인하면서 온 경우는 서버가 연결한다(로그인 화면이 누가 보냈는지 알린 뒤다). **이미 로그인돼 있던 학부모에게는 먼저 묻는다** — "○○ 선생님이 공유한 사진이에요 · [연결하고 사진 보기] / [취소]". 링크를 눌렀다는 것만으로 연결하지 않는다(연결하면 그 선생님의 학부모 목록에 이름·이메일이 나타나므로 본인이 눌러야 한다). 누르면 `POST /api/parent/teachers`. ⑤ 선생님이 자기 링크를 열면 그 앨범의 관리 화면(`/photos/:id`)으로 간다. **누가 볼 수 있는지는 링크가 아니라 앨범의 공개 여부·공개 범위가 정한다** — 링크로 가입해도 범위 밖이면 "아직 사진을 볼 수 없어요". 링크에 실린 초대는 **soft** 다(OAuth state 의 `s`): 토큰이 죽었어도(선생님이 초대 링크를 새로 만듦) 로그인을 막지 않고, **선생님·관리자 계정만 있는 사람을 학부모로 만들지 않는다**(자기 링크를 눌러 본 선생님이 자기 반 학부모가 되지 않게). 진짜 초대 링크(`/invite/<token>`)의 동작은 그대로다 |
| FR-519 | (요청 ⑨, 배포 뒤 추가) **사진 전용 폴더의 이름·날짜 수정과 삭제.** 대상은 `type='folder'` 뿐이다 — 이벤트 앨범의 이름·날짜는 이벤트 폼이(대회 행 동기화 포함), 삭제는 이벤트 삭제가 맡는다(신청·참가 학생이 걸려 있어 사진 메뉴에서 지우면 안 된다. 이벤트 앨범에 부르면 400 `not_photo_folder`). 앨범 화면 머리의 **[⋯ 폴더 관리]** 메뉴에 둘을 둔다(Drive 폴더가 아직 없는 폴더에도 나온다). **수정**: 창이 지금 이름·날짜로 시작하고 바뀔 Drive 폴더 이름을 미리 보여 준다 → `PATCH /api/albums/:id { title, date }`. 검증은 만들기와 같다. 같은 이름·날짜의 다른 **폴더**가 있으면 409 `folder_exists`. 저장하면 Drive 폴더 이름("날짜 이름")도 따라 바꾼다(`syncFolderName`); Drive 쪽이 실패해도 저장은 끝난 것이라 `driveRenamed:false` 로 알리고 기존 **[폴더 이름 맞추기]** 로 나중에 맞춘다. **삭제**: 확인 창이 무엇이 사라지고 무엇이 남는지 적는다 — "폴더와 사진·영상 N개가 앱(공개 중이면 학부모 화면)에서 사라지고, 되돌릴 수 없어요. Google Drive 의 폴더와 원본 파일은 그대로 남아요." → `DELETE /api/albums/:id`. 행을 지우면 사진 기록·태그·얼굴이 CASCADE 로 함께 사라진다. **Drive 는 건드리지 않는다**(이벤트를 지울 때와 같은 규칙). 지운 뒤 사진 목록으로 돌아가 한 번 알린다. 둘 다 작업 기록에 남는다(`UPDATE_PHOTO_FOLDER` · `DELETE_PHOTO_FOLDER`) |

### 2.3 사진 메뉴 — 앨범 `/photos/:eventId`

| ID | 요구사항 |
|---|---|
| FR-520 | 머리에는 이벤트명·날짜, Drive 폴더 이름과 **[Drive 에서 열기]**(새 탭), 사진·영상 수와 총용량을 둔다 |
| FR-521 | **공개 패널**에는 지금 상태를 한 줄로 쓴다. 비공개면 "학부모에게 보이지 않아요", 공개면 "참가 확정 학부모 7명이 볼 수 있어요" 처럼 쓰고, 버튼은 **[학부모에게 공개]** / **[비공개로 전환]** 을 둔다 |
| FR-522 | **공개 범위**는 "참가 확정 학부모"(기본)와 "모든 학부모" 중에 고른다(D-2). "참가 확정" 범위인데 볼 수 있는 학부모가 0명이면 경고를 띄운다: "확정된 학생이 없어 아무도 볼 수 없어요 — 모든 학부모에게 공개할까요?" |
| FR-523 | 앨범 화면의 **[사진 올리기]** 는 이벤트 고르기 단계 없이 **이 앨범(이벤트)으로 바로** 올린다. 기존 `UploadSheet` 를 쓴다. 한 번에 30개, 사진 25MB, 영상 500MB, 브라우저에서 Drive 로 직접 전송하고 진행률을 보여 준다. 비공개 상태에서도 선생님은 올릴 수 있다 |
| FR-524 | 그리드 필터는 **전체 / 선생님 / 학부모 / 숨김**이다. 누르면 `MediaViewer` 가 열린다 |
| FR-525 | **선택 모드**에서 **숨기기 / 다시 보이기 / 삭제**를 한다. 삭제는 Drive 휴지통으로 보내므로 30일 안에 복구할 수 있다. 숨긴 사진은 공개 앨범에서도 학부모에게 보이지 않는다 |
| FR-526 | **학부모 업로드 받기** 토글(기존 `albumUploadOpen`, 기본 ON)을 둔다. 비공개일 때는 꺼진 것처럼 흐리게 보여 주고 "공개하면 적용돼요" 를 붙인다 |
| FR-527 | 앨범에 이상이 있으면(폴더가 사라짐, 링크 공유 꺼짐, Google 연결 끊김) 배너와 **[새로고침]** 을 띄운다. 읽기는 계속되고 **Drive 를 거치는 올리기 · 지우기만** 막는다. 공개 · 공개 범위 · 숨기기는 앱 안의 일이라 열어 둔다 — 급히 비공개로 돌려야 할 때 막히면 안 된다(구현 중 정함) |
| FR-529 | 공개 패널에 **"공개하면 보이는 곳"** 을 적는다: 학부모 **사진 탭**, 그리고 **'회장배 리듬체조 대회' 이벤트 상세**. 사진이 이벤트에 연결돼 있다는 것을 선생님이 여기서 확인한다 |
| FR-528 | 얼굴 태그 관리(확인 필요, 태그 없음, 다시 매칭, 미분석 재분석)는 **이번 범위 밖**이다. 업로드할 때 브라우저가 얼굴 특징값을 뽑아 저장하는 것은 기존대로 계속하므로, 학부모의 "우리 아이 사진만 보기"는 동작한다 |

### 2.4 이벤트 화면 (요청 ③)

| ID | 요구사항 |
|---|---|
| FR-530 | **이벤트 관리 목록과 이벤트 폼에는 사진 입구를 두지 않는다.** [사진] 버튼도, 사진 섹션도 넣지 않는다 |
| FR-531 | 이벤트 **제목이나 날짜**를 고치면 앨범 폴더 이름이 새 이름으로 바뀐다(D-3). Drive 호출이 실패해도 이벤트 저장은 성공하고 서버 로그만 남긴다(`competitionMirror` 와 같은 규칙) |
| FR-532 | 휴관일에는 앨범을 만들 수 없다(기존). 이벤트를 삭제하면 앱에서 앨범도 사라지지만 **Drive 폴더는 남는다.** 앨범이 있는 이벤트의 삭제 확인 문구에 "Drive 의 사진 폴더는 그대로 남아요" 를 덧붙인다 |

### 2.5 학부모

| ID | 요구사항 |
|---|---|
| FR-540 | **사진** 탭(`/parent/photos`)에는 **공개된 앨범** 중 **공개 범위에 드는** 것만 나온다. 이벤트가 비공개(`isPublished=false`)이면 앨범도 보이지 않는다(기존) |
| FR-541 | 선생님이 비공개로 돌리면 목록, 갤러리, 이벤트 상세 사진 칸에서 **바로 사라진다.** 주소로 직접 들어오면 403 `album_private` 와 "선생님이 아직 공개하지 않은 앨범이에요" 를 돌려준다 |
| FR-542 | 학부모는 **공개 + 업로드 받기 ON + 범위 안**일 때만 올린다. 올리는 곳은 **사진 탭의 앨범 화면 [＋ 올리기]** 하나뿐이고, 이벤트 상세에는 업로드가 없다(D-4) |
| FR-543 | 학부모가 올린 사진은 바로 보인다(D-5). 선생님은 숨기거나 지울 수 있다 |
| FR-544 | 학부모는 **자기가 올린 것만** 지운다(기존 `canDeleteMedia`) |
| FR-545 | 학부모 **이벤트 상세**(`/parent/events/:id`)에 그 이벤트에 연결된 사진을 **바로 보여 준다**(요청 ⑤). 조건은 사진 탭과 같다(공개 + 범위 안). 최근 사진 **6장(3×2)** 과 **"사진 44장 모두 보기 →"**(사진 탭의 그 앨범으로)를 둔다. 사진을 누르면 그 앨범 갤러리에서 그 사진이 크게 열린다. 숨긴 사진은 빠지고, 업로드 버튼은 없다(D-4) |

---

## 3. 설계 결정

### 3.1 저장소 — Google 포토가 아니라 Google Drive 로 한다

| 기준 | Google Drive (`drive.file`) | Google 포토 (Library API) |
|---|---|---|
| 학부모에게 보여 주기 | 폴더 링크 공유(보기 전용) + Drive 썸네일 주소로 앱 갤러리를 그린다. **이미 구현됨** | 2025-03-31 부터 **공유 앨범 API(share/join 등)가 403**이다. 앱이 선생님 토큰으로 매번 `baseUrl` 을 받아야 하고, 그 주소는 **60분 뒤 만료**된다 |
| 업로드 경로 | 서버가 **resumable 세션 URI** 만 만들고, 브라우저가 Drive 에 **직접** PUT 한다. 영상 500MB 까지 된다 | 업로드 엔드포인트가 선생님 Bearer 토큰을 요구한다. 브라우저 직행이 되는지는 **확인되지 않았다.** 서버를 거치면 Vercel 본문 4.5MB 제한 때문에 **영상을 올릴 수 없다** |
| Google 검수 | `drive.file` 은 **비민감 범위**라 검수가 필요 없다 | Library API 는 OAuth 검수 대상 |
| 앱이 볼 수 있는 범위 | 앱이 만든 파일만 | 2025-03-31 부터 앱이 올린 항목만 (같다) |
| 용량 | 선생님 Google 계정 15GB 를 나눠 쓴다 | 같다 |
| 지금 코드 | 그대로 쓴다 | 업로드·검증·학부모 화면을 다시 짜야 한다 |

선생님이 포토 앱에서도 보고 싶다면 Google 포토 웹의 **업로드 → Google Drive** 로 직접 가져오면 된다(수동, 앱 밖의 일).
참고: [Updates to the Google Photos APIs (Google Developers Blog)](https://developers.googleblog.com/en/google-photos-picker-api-launch-and-library-api-updates/)

### 3.2 폴더 구조와 이름

```
내 드라이브/
└─ RG Manager/                      ← 루트. 연결할 때 생성, 설정에서 이름 변경 (FR-501)
   ├─ 2026-10-12 회장배 대회/        ← 앨범 = 이벤트 1개 (FR-514)
   │   ├─ 20261012_선생님_IMG_0012.jpg
   │   └─ 20261012_하은_IMG_1234.MOV ← 학부모 업로드: 확정된 자녀 이름이 들어간다 (기존 buildDriveName)
   └─ 2026-11-02 스페셜 클래스/
```

- 이름은 `defaultFolderName(event)` = `YYYY-MM-DD 이벤트명`(D-3)이고 100자에서 자른다. `\ / : * ? " < > |` 와 제어 문자는 `sanitizeFolderName` 이 막는다.
  **이벤트 제목에 이런 문자가 있으면 지금은 폴더를 만들 수 없다.** 그래서 앨범을 만들 때는 거절하지 않고 **해당 문자를 공백으로 바꾸는** `folderNameFromEvent()` 를 새로 둔다.
- 선생님이 이름을 직접 입력하는 칸은 두지 않는다. 이름은 언제나 이벤트에서 나온다(요청 ①). 이미 있는 `PATCH .../album {folderName}` 은 API 에만 남긴다.
- Drive 에서 폴더 이름을 직접 바꿔도, 이벤트를 다시 고치면 이벤트 기준으로 덮어쓴다. 이 점은 문서와 화면 도움말에 적는다.

### 3.3 공개 모델 — 앱 공개와 Drive 링크 공유는 다른 스위치다

| 스위치 | 무엇을 막나 | 언제 바뀌나 |
|---|---|---|
| `events."albumPublished"` (**신규**) | 앱이 학부모에게 앨범과 사진 주소를 **주는지** | 선생님이 [공개] 또는 [비공개로 전환]을 누를 때 |
| Drive 폴더 링크 공유 (`anyone · reader`) | 썸네일 주소가 로그인 없이 **열리는지** | 폴더를 만들 때 한 번 켠다(기존). 꺼지면 `albumStatus='unshared'` |

- 비공개 앨범도 Drive 에서는 링크 공유 상태다. 그래야 **선생님 화면의 썸네일이 뜬다**(선생님 브라우저가 같은 Google 계정에 로그인돼 있다는 보장이 없다).
  비공개 동안 폴더 id 와 파일 id 는 **학부모 응답에 한 글자도 실리지 않는다.** id 는 추측할 수 없는 값이다.
- "공개할 때만 링크 공유를 켜는" 안도 검토했다. 그러려면 선생님 썸네일을 서버가 대신 받아 주는 프록시가 필요하다. Vercel 함수 비용이 들고 영상 재생도 막혀서 **이번에는 채택하지 않는다**(§11 R-1).

### 3.4 누가 보고 누가 올리나 — `albumAccess` 를 넓힌다

`canViewAlbum` 과 `canUpload` 에 `albumPublished` 와 `audience` 를 더한다. 둘 다 **순수 함수**라 표 그대로 단위 테스트한다.

| 보는 사람 | 앨범 없음 | 비공개 | 공개 · 범위=참가 | 공개 · 범위=전체 |
|---|---|---|---|---|
| 이벤트 주인 선생님 | `no_album` | 보기·올리기 | 보기·올리기 | 보기·올리기 |
| 연결된 학부모, 자녀 확정 | `no_album` | ✗ `album_private` | 보기 + 올리기\* | 보기 + 올리기\* |
| 연결된 학부모, 자녀 미확정 | `no_album` | ✗ `album_private` | ✗ `not_confirmed` | 보기 + 올리기\* |
| 연결 안 된 학부모 | 404 | 404 | 404 | 404 (기존 `parentScope`) |

\* 올리기는 여기에 더해 `albumUploadOpen`, `albumStatus≠missing`, 선생님 Drive `connected`, `foreignAccount=false` 를 모두 만족해야 한다(기존 `canUpload` 순서 유지).
판정 순서는 `no_album → not_published(이벤트) → album_private → 범위` 다. 비공개 앨범은 **확정 여부를 묻기 전에** 막는다.

학부모 쪽 업로드 파일 이름(`buildDriveName`)에 쓰는 자녀 이름은 지금 "확정된 자녀"에서 고른다.
범위가 "전체"이면 확정된 자녀가 없을 수 있으므로, 이때는 **연결된 첫 자녀 → 없으면 '학부모'** 로 정한다.

### 3.5 폴더 이름 동기화 (FR-531)

`eventController.updateEvent` 가 커밋한 **뒤에** `albumService.syncFolderName(ownerId, before, after)` 를 부른다.

- 앨범이 없거나, `folderNameFromEvent(before) === folderNameFromEvent(after)` 면 아무것도 하지 않는다.
- Drive `files.update {name}` → `events.driveFolderName` 을 갱신한다. 실패하면 `console.error` 만 남기고 **응답은 성공으로 돌려준다.**
- 다음에 앨범 화면을 열면 `driveFolderName` 과 기대 이름이 다른지 보고 **[폴더 이름 맞추기]** 를 띄운다(재시도 수단).

---

## 4. 데이터 모델

`server/database.js` 의 앨범 블록에 추가한다(전부 `IF NOT EXISTS`, nullable 이 아니면 기본값이 있으므로 옛 코드와도 호환된다).

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumPublished"   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumAudience"    TEXT    NOT NULL DEFAULT 'participants'; -- participants | all
ALTER TABLE events ADD COLUMN IF NOT EXISTS "albumPublishedAt" TEXT;   -- ISO 문자열 (albumCreatedAt 과 같은 모양)
```

- `Event.updateAlbum` 의 허용 목록에 세 칸을 더한다.
- `albumAudience` 값 검증은 컨트롤러에서 한다(`participants|all` 외에는 400). DB CHECK 는 다른 칸과 맞춰 두지 않는다.
- 백필은 하지 않는다. 운영 앨범은 0개다(§1.2). 로컬 DB 에 예전 앨범이 있으면 비공개가 되는데, 개발 데이터라 괜찮다.
- 새 표가 없으므로 OWNER/REVOKE 처리도 필요 없다. 칸은 표 주인(`rg_app`)의 권한을 따른다.

---

## 5. API

### 5.1 신규 — 선생님 사진 목록 `GET /api/albums`

`routes/albums.js` + `controllers/albumListController.js`. **`server.js` 에서 `rejectParents` 를 거는 목록에 반드시 넣는다**(CLAUDE.md: 새 선생님 라우터 규칙).
`/api/events/albums` 로 두지 않는 이유는 `events` 라우터의 `/:id` 와 순서 다툼을 피하기 위해서다.

```jsonc
// GET /api/albums  (verifyToken, 선생님 = 자기 이벤트, 관리자 = 기존 Event 범위 규칙)
{
  "drive": { "configured": true, "connected": true, "status": "connected", "email": "t@gmail.com", "rootFolderName": "RG Manager" },
  "albums": [
    { "eventId": 31, "title": "회장배 대회", "date": "2026-10-12", "type": "competition",
      "folderName": "2026-10-12 회장배 대회", "albumStatus": "ready",
      "published": false, "audience": "participants", "publishedAt": null,
      "counts": { "images": 42, "videos": 3, "fromParents": 5, "hidden": 1 },
      "previews": ["<driveFileId>", "..."] }
  ],
  "targets": [   // [사진 올리기] 첫 단계 — 대회·스페셜 전부(앨범 유무와 상관없이), 날짜 최근순
    { "eventId": 35, "title": "스페셜 클래스", "date": "2026-11-02", "type": "special",
      "folderName": "2026-11-02 스페셜 클래스", "hasAlbum": false, "published": false, "count": 0 },
    { "eventId": 31, "title": "회장배 대회", "date": "2026-10-12", "type": "competition",
      "folderName": "2026-10-12 회장배 대회", "hasAlbum": true, "published": true, "count": 45 }
  ]
}
```

- 미리보기는 `EventMedia.summaries` 를 다시 쓴다(이벤트 여러 개를 한 번에 읽으므로 N+1 이 없다).
- **`POST /api/albums` `{ title, date }`** (FR-517) — 사진 전용 폴더(`createPhotoFolder` → `Event.createForPhotos`: `type='folder'`, `registrationOpen=false`, `albumAudience='all'`). 응답은 `{ created, target }` 이고 `target` 은 위 `targets` 한 줄과 같은 모양이다(`type:'folder'`). 새로 만들면 201, 같은 이름·날짜의 내 폴더가 있으면 200 `created:false`. 이름 없음·100자 초과·날짜 형식/없는 날짜는 400. Drive 폴더는 만들지 않는다 — 첫 업로드의 `ensureAlbum` 이 만든다.
- **폴더를 이벤트에서 빼는 곳**(FR-517): `Event.getAll`(이벤트 관리) · `listUpcomingForParent`/`listPastForParent`(학부모 일정) · `getPublishedForParent`(학부모 이벤트 상세·신청 — 기본값이 제외, 학부모 앨범 화면만 `{ includeFolders: true }`). `listForPhotos` · `listWithAlbumsForParent` 에는 남는다.
- `drive` 블록은 Google 을 부르지 않고 DB 만 읽는다(용량은 앨범 화면에서만 부른다). 목록이 Drive 장애 때문에 느려지지 않게 하기 위해서다.

### 5.2 변경 — 선생님 앨범 `/api/events/:id/album`

| 메서드 | 변경 |
|---|---|
| `POST` | body 없이 불러도 된다. 이름은 `folderNameFromEvent(event)`. **비공개로 만든다.** 응답에 `published:false` 를 넣는다 |
| `PATCH` | `published`(bool), `audience`(`participants`/`all`)를 받는다. 공개로 바꿀 때 `albumStatus='missing'` 이면 400 `album_missing`. 처음 공개할 때만 `albumPublishedAt` 을 찍는다 |
| `GET` | `published`, `audience`, `publishedAt`, `expectedFolderName`, **`viewerCounts: { participants, all }`** 를 더한다. 이 값이 공개 패널 문구(FR-521)와 0명 경고(FR-522)에 쓰인다 |
| `POST /media/uploads` | **선생님이 앨범 없는 이벤트로 올리면 먼저 폴더를 만든다**(`albumService.ensureAlbum` — 있으면 그대로, 없으면 `createAlbumFolder` 후 비공개). 휴관일이면 400. 학부모 경로(`/api/parent/...`)는 지금처럼 앨범이 있어야 한다 |

"다 올리면 바로 공개"(FR-515)는 서버에 따로 두지 않는다. 클라이언트가 업로드를 다 마친 뒤 `PATCH {published:true}` 를 한 번 더 부른다.
업로드가 하나도 성공하지 못하면 부르지 않는다.

`viewerCounts` 는 학부모 **계정 수**다. `participants` 는 이 이벤트의 확정·참가 학생에 연결된 학부모, `all` 은 이 선생님과 연결된(`parent_teachers`) 학부모를 센다.

### 5.3 변경 — 이벤트 수정 `PUT /api/events/:id`

커밋 뒤에 `syncFolderName` 을 부른다(§3.5). 응답 모양은 바꾸지 않는다.

### 5.4 변경 — 학부모 `/api/parent/*`

| 지점 | 변경 |
|---|---|
| `Event.listWithAlbumsForParent` | `AND e."albumPublished"` 를 더한다 |
| `parentAlbumController.listAlbums` | 확정 필터를 `audience` 에 맞춘다(`all` 이면 건너뛴다) |
| `parentAlbumController.loadAlbumContext` (갤러리·업로드·완료·확인·삭제가 모두 거침) | `canViewAlbum({ albumPublished, audience, ... })` |
| `parentController.getEvent` 의 `album` 블록 | 공개 + 범위 안일 때만 `available:true`. 비공개면 `album:null` 이다. 앨범이 있다는 사실도 알리지 않는다. **`items` 를 더한다**: 숨김을 뺀 최근 6개를 `toParentMedia` 그대로(FR-545). 지금의 `previews`(썸네일 주소 4개)는 `items` 로 대체한다 |
| 업로드 파일 이름의 자녀 | §3.4 마지막 문단 |

`mediaSerializer.toParentMedia` 의 화이트리스트는 **바꾸지 않는다.** 필드 목록을 고정한 테스트가 그대로 지켜야 한다.

---

## 6. 화면

디자인 시스템 규칙(`docs/design-system/README.md`)을 따른다. `components/ui` 를 먼저 쓰고, 색과 숫자는 토큰으로만 쓰고, 반응형은 CSS 가 맡는다.

### 6.1 메뉴와 라우트

- `client/src/App.jsx` `navLinks` 의 `이벤트 관리` 다음에 `{ path: '/photos', label: '사진', icon: 'image' }` 를 넣는다.
- 라우트는 `/photos` → `PhotoAlbums`, `/photos/:eventId` → `PhotoAlbum` 이다(둘 다 `ProtectedRoute`).
- 관리자 사이드바에는 이번에 넣지 않는다. 관리자는 "이 계정으로 로그인"(FR-388)으로 선생님 화면을 본다.

### 6.2 `/photos` — 사진 목록

```
┌ 사진 ★★★ ─────────────────────────────────── [⇪ 사진 올리기] ┐
│ ⚠ 사진은 선생님 Google Drive 에 저장돼요.                     │  ← 미연결일 때만 (Callout)
│   설정에서 Google 계정을 연결해 주세요.        [설정으로 가기] │
├───────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐         │  ← Card 그리드
│ │ ▢▢            │ │ ▢▢            │ │  (사진 없음)   │         │    모바일 1열 · 태블릿 2열
│ │ ▢▢            │ │ ▢▢            │ │               │         │    데스크탑 3~4열
│ │ 회장배 대회    │ │ 스페셜 클래스  │ │ 가을 대회      │         │
│ │ 10.12 · 42장  │ │ 11.02 · 8장   │ │ 11.20 · 0장   │         │
│ │ [공개]  학부모 5│ │ [비공개]      │ │ [비공개]      │         │  ← Badge
│ └───────────────┘ └───────────────┘ └───────────────┘         │
└───────────────────────────────────────────────────────────────┘
[⇪ 사진 올리기] → Modal(모바일 바텀시트) 1단계 "어느 이벤트 사진인가요?":
   ○ ＋ 새 폴더 만들기              이벤트가 없을 때       ← FR-517: 고르면 이름·날짜 칸 (사진 전용 폴더, 이벤트 아님)
   ○ 11.20 (금) 전국 꿈나무 대회   [예정] 사진 없음
   ● 10.12 (월) 회장배 대회        사진 45 · 공개
   ○ 10.05 (월) 가을 공개 수업      사진 0 · 비공개
   ○ 08.30 (일) 여름 합동 공연      사진 없음
   올라갈 폴더: RG Manager / 2026-10-12 회장배 대회
   (비공개 앨범이면) □ 다 올리면 바로 학부모에게 공개
   (공개 앨범이면)   공개 중인 앨범이라 올리면 바로 학부모에게 보여요   [사진 고르기]
→ 2단계: 파일별 진행률(기존 UploadSheet). 다 올리면 그 앨범 화면으로
```

### 6.3 `/photos/:eventId` — 앨범

```
┌ ← 회장배 대회 · 2026-10-12 ─────────────────────────────────┐
│ 📁 RG Manager / 2026-10-12 회장배 대회   [Drive 에서 열기]   │
│ 사진 42 · 영상 3 · 1.8GB   Drive 남은 용량 9.1GB             │
├ 공개 ────────────────────────────────────────────────────────┤
│ ● 비공개 — 학부모에게 보이지 않아요                          │
│ 공개 범위  (•) 참가 확정 학부모 (7명)  ( ) 모든 학부모 (33명) │
│ [학부모에게 공개]                                             │
│ 공개하면 보이는 곳: 학부모 사진 탭 · '회장배 대회' 이벤트 상세  │
│ 학부모 업로드 받기  [ON]  (공개하면 적용돼요)                 │
├──────────────────────────────────────────────────────────────┤
│ 전체 42 · 선생님 37 · 학부모 5 · 숨김 1      [선택] [＋ 사진 올리기] │
│ ▢ ▢ ▢ ▢ ▢ ▢                                                  │  ← MediaGrid
│ ▢ ▢ ▢ ▢ ▢ ▢                                                  │
└──────────────────────────────────────────────────────────────┘
선택 모드 → 하단 바: [숨기기] [다시 보이기] [삭제]  (삭제는 확인 Modal)
```

공개로 바꾸면 패널이 이렇게 바뀐다: `● 공개 — 참가 확정 학부모 7명이 볼 수 있어요 · 10월 13일 공개 [비공개로 전환]`.

### 6.4 설정 카드

`DriveAccountCard.jsx` 의 기능(연결, 결과 플래시 `?drive=`, 루트 폴더 이름 변경, 해제)은 그대로 둔다. 바꾸는 것은 다음과 같다.
- 인라인 스타일을 `Card` · `Callout` · `Badge` · `Button` · `Field` · `Input` 으로 바꾼다.
- `alert` 는 토스트나 Callout 으로, `window.confirm` 은 `Modal` 로 바꾼다.
- 제목은 **"Google 계정 (사진 저장)"**, 연결하면 **"사진 메뉴로 가기"** 링크를 띄운다.

### 6.5 학부모 화면

화면 코드는 거의 그대로다. 서버가 비공개 앨범을 주지 않는 것으로 끝난다.
- `ParentAlbum` 이 403 `album_private` 를 받으면 "선생님이 아직 공개하지 않은 앨범이에요" EmptyState 와 [사진 목록으로] 를 보여 준다(링크를 갖고 있던 학부모를 위한 처리).
- **이벤트 상세의 "사진 · 영상" 칸**(`ParentEventDetail.jsx`)은 지금의 미리보기 카드(썸네일 4장 + 앨범 열기)를
  **사진 6장 그리드 + "사진 N장 모두 보기"** 로 바꾼다(FR-545). 사진을 누르면 `/parent/photos/:eventId?open=<mediaId>` 로 가서 그 사진이 크게 열린다.
  서버가 `album:null` 을 주면(비공개·범위 밖·앨범 없음) 칸 자체를 그리지 않는다. 업로드 버튼은 두지 않는다(D-4).

---

## 7. 파일 영향

| 구분 | 파일 | 변경 |
|---|---|---|
| 서버 수정 | `server/database.js` | §4 칸 3개 |
| | `server/models/Event.js` | `updateAlbum` 허용 목록, `listWithAlbumsForParent` 공개 조건, `listAlbumsForTeacher` · `listAlbumCandidates` 추가 |
| | `server/utils/albumAccess.js` | `canViewAlbum` · `canUpload` 에 공개·범위 규칙, `album_private` 사유 문구 |
| | `server/utils/mediaValidation.js` | `folderNameFromEvent()` (금지 문자를 공백으로 바꿈) |
| | `server/services/albumService.js` | `syncFolderName()`, `countViewers()` |
| | `server/controllers/albumController.js` | POST 기본 이름·비공개, PATCH `published`/`audience`, GET 추가 필드 |
| | `server/controllers/parentAlbumController.js`, `parentController.js` | 공개·범위 판정, 업로드 이름의 자녀 고르기 |
| | `server/controllers/eventController.js` | 수정 후 `syncFolderName` |
| | `server/server.js` | `app.use('/api/albums', rejectParents, albumRoutes)` |
| 서버 신규 | `server/routes/albums.js`, `server/controllers/albumListController.js` | §5.1 |
| 클라이언트 수정 | `client/src/App.jsx` | 메뉴와 라우트 |
| | `client/src/pages/parent/ParentEventDetail.jsx` | 사진 칸을 6장 그리드 + 모두 보기로(FR-545) |
| | `client/src/components/album/UploadSheet.jsx` | 앞에 "이벤트 고르기" 단계를 붙일 수 있게(`target` 이 없으면 1단계부터), "다 올리면 바로 공개" 체크 |
| | `client/src/pages/Settings/DriveAccountCard.jsx` | 디자인 시스템 이전(§6.4) |
| | `client/src/pages/parent/ParentAlbum.jsx` | `album_private` 처리 |
| | `client/src/styles/ui.css` | `.ui-album-card`, `.ui-publish-panel` 등 블록(토큰만 사용) |
| 클라이언트 신규 | `client/src/pages/Photos/PhotoAlbums.jsx`, `PhotoAlbum.jsx`, `UploadTargetStep.jsx`(이벤트 고르기), `PublishPanel.jsx` | §6.2~6.3 |
| | `client/src/pages/Photos/albumState.js` | 순수 함수: 배지 문구, 공개 패널 문구, 0명 경고, 버튼 활성 조건 |
| 문서 | `CLAUDE.md` "Event Photo Albums" | "There is no teacher-facing album screen right now" 문단을 사진 메뉴와 공개 규칙 설명으로 바꾼다 |
| 그대로 | `components/album/*`, `utils/driveUpload.js`, `utils/faceClient.js`, `mediaSerializer.js`, `pages/Events/*` | 이벤트 화면은 **건드리지 않는다**(FR-530). 삭제 확인 문구 한 줄(FR-532)만 예외 |

---

## 8. 구현 순서

워크트리는 `rg-manager-gdrive-photos`, 브랜치는 이 문서의 `docs/photo-menu-plan` 다음에 `feat/photo-menu` 를 쓴다. PR 은 하나로 내고 base 는 `main` 이다.

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **S0 선행** | (a) **운영 앨범 표 5개 권한 회수**: `REVOKE ALL ON TABLE … FROM anon, authenticated, service_role` 를 표와 `_id_seq` 모두에 적용한다. **사용자 승인을 받고 MCP 로 실행한다.** (b) 선생님 Google 계정을 **테스트 사용자로 등록**한다([02 A](./02-google-setup.md#a-테스트-사용자로-등록하기-지금-할-것), 사용자 작업) | (a) `api_grants` 가 비었는지 다시 조회. (b) 설정에서 연결되고 내 드라이브에 `RG Manager` 폴더가 생김 |
| S1 규칙 | 스키마 3칸, `albumAccess` 공개·범위, `folderNameFromEvent` | §3.4 표 전체가 단위 테스트로 고정됨 |
| S2 서버 | `GET /api/albums`, POST/PATCH/GET 변경, 이벤트 수정 동기화, 학부모 판정 | 컨트롤러 테스트 통과(Drive 는 목) |
| S3 설정 카드 | `DriveAccountCard` 디자인 시스템 이전 | 기존 연결 흐름이 바뀌지 않음 |
| S4 사진 목록 | 메뉴, `/photos`, [사진 올리기] 1단계(이벤트 고르기) | 미연결 안내, 이벤트 목록, 앨범 없는 이벤트로 올리면 폴더가 생기고 그 앨범으로 이동 |
| S5 앨범 화면 | 공개 패널, 업로드, 그리드, 선택 동작, 이상 배너 | 공개/비공개 전환이 학부모 쪽에 반영됨 |
| S6 학부모 | `album_private` 처리, **이벤트 상세 사진 칸**, e2e | §9.3 통과 |
| S7 마무리 | CLAUDE.md, 스크린샷, PR | §9 전부 통과, PR 설명에 결과 첨부 |

---

## 9. 테스트 계획

### 9.1 서버 단위 (Jest, `cd server && npm test`)

- `albumAccess`: §3.4 표의 칸마다 한 케이스씩 넣고, 판정 순서(`not_published` 가 `album_private` 보다 먼저)를 확인한다.
- `folderNameFromEvent`: 금지 문자, 제어 문자, 100자 자르기, 빈 제목을 확인한다.
- `albumListController`: 다른 선생님의 이벤트가 섞이지 않는지, 휴관일이 후보에서 빠지는지, 앨범이 있는 이벤트가 후보에서 빠지는지 본다.
- `albumController`: POST 가 비공개로 만들고 이름을 이벤트에서 가져오는지, PATCH `audience` 검증(400), `missing` 앨범의 공개 거부를 본다.
- `eventController.updateEvent`: 제목이 바뀌면 rename 을 한 번 부르는지, 이름이 같으면 부르지 않는지, Drive 실패에도 200 인지 본다.
- `parentAlbumController` · `parentController.getEvent`: 비공개면 목록에서 빠지고 403 `album_private` 와 `album:null` 이 나오는지, `all` 범위면 미확정 학부모도 보는지 본다.
- 기존 `toParentMedia` 필드 고정 테스트는 **그대로 통과**해야 한다.

### 9.2 클라이언트 단위 (Jest, `cd client && npm test`)

- `albumState.js`: 배지, 공개 패널 문구(인원 수 포함), 0명 경고, 버튼 활성 조건(Drive 끊김, 앨범 missing)을 순수 함수 테스트로 확인한다.
- `PhotoAlbums` · `PhotoAlbum` · `UploadTargetStep`: fetch 를 목으로 두고 렌더링한다. 미연결 안내, 이벤트 0개, 앨범 없는 이벤트의 "새 폴더" 표시, "바로 공개" 체크 뒤 `PATCH` body, 공개 전환 요청 body 를 확인한다.
- `ParentEventDetail`: `album.items` 가 있으면 6장 그리드와 "모두 보기", `album:null` 이면 사진 칸이 없음.
- 내비게이션 테스트에 `사진` 이 이벤트 관리 다음에 있는지 넣는다.

### 9.3 e2e (Playwright, `client/e2e/`)

`setup.mjs` 픽스처에 **가짜 앨범**을 넣는다. 이벤트 1개에 `driveFolderId='e2e-folder'` 를 주고 `event_media` 3행을 넣는다. Google 은 부르지 않는다.
공개 전환은 DB 만 바꾸므로 Google 없이 끝까지 돈다.

1. 선생님: 사이드 메뉴 **사진** → 목록에 픽스처 앨범과 **비공개** 배지가 보인다.
2. 선생님: Drive 미연결 안내와 [설정으로 가기] → `/settings` 의 Google 계정 카드가 보인다.
3. 학부모(확정 자녀): `/parent/photos` 에 앨범이 **없다.**
4. 선생님: 앨범 → [학부모에게 공개] → 배지가 **공개**로 바뀐다.
5. 학부모: `/parent/photos` 에 앨범이 **있고** 사진 3장이 보인다.
6. 선생님: [비공개로 전환] → 학부모 새로고침 시 목록에서 사라지고, 직접 주소는 "아직 공개하지 않은 앨범" 이다.
7. 학부모: 공개된 상태에서 **이벤트 상세**(`/parent/events/<id>`)에 사진 칸과 "모두 보기"가 있고, 비공개로 돌리면 칸이 사라진다(FR-545).
8. 이벤트 관리 화면에 사진 버튼이나 섹션이 **없다**(FR-530 회귀 방지).
9. 실제 업로드: `E2E_GOOGLE_DRIVE=1` 일 때만 돈다(기본 skip). 테스트용 Google 계정 토큰이 필요하다.

실행 조건은 메모와 TESTING.md 를 따른다: `JWT_SECRET=local-dev-secret`, 레이트리밋 상향, 매번 `test:e2e:setup`.

### 9.4 실제 Google 스모크 (수동, 머지 후 운영)

prod 테스트 선생님 계정(12번)으로 한다.
1. 설정에서 연결한다.
2. 사진 → [사진 올리기] → 앨범이 없는 지난 이벤트 하나를 고른다(폴더가 이때 생기는지 확인).
3. 사진 2장과 짧은 영상 1개를 올리고, Drive 폴더에 `YYYYMMDD_선생님_*.jpg` 가 생겼는지 본다.
4. 공개한다.
5. 연결된 학부모 계정으로 사진 탭에서 보이는지, 학부모 업로드가 되는지 본다.
6. 비공개로 돌려 사라지는지 본다.
7. 테스트 사진을 삭제(휴지통)하고, 연결을 해제할지 정한다.

---

## 10. 배포 순서

메모 "스키마 배포 함정" 의 순서를 따른다(PR #21·#23 에서 무사히 끝난 방식).

1. **머지 전**: MCP `apply_migration` 으로 §4 의 `ALTER TABLE events ADD COLUMN IF NOT EXISTS …` 3줄을 넣는다.
   표 주인이 `rg_app` 이라 칸 권한도 따라간다. `\d events` 로 확인하고, 옛 코드로 운영 `/api/parent/events` 가 200 인지 본다.
2. S0(a) 권한 회수가 끝났는지 다시 조회한다.
3. 머지한다(= Vercel 운영 배포).
4. `GET /api/albums` 의 content-type 이 `text/html`(옛 코드의 SPA 폴백)에서 `application/json` 401 로 바뀔 때까지 10초마다 curl 한다. 보통 60초쯤 걸린다.
5. §9.4 스모크를 한다.

---

## 11. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | Drive 폴더가 "링크가 있는 모든 사용자 보기" 상태라, 링크가 새면 비공개 앨범도 열린다 | id 는 추측할 수 없고 비공개 동안 학부모 응답에 실리지 않는다. 더 막으려면 썸네일 프록시를 붙이고 "공개 시에만 공유" 로 바꾼다(2차) |
| R-2 | refresh token 이 평문이고, 지금은 공개 API 권한도 붙어 있다 | **S0 권한 회수는 필수다.** 평문 저장 자체는 2차에서 `GOOGLE_TOKEN_KEY` 로 AES-GCM 암호화 |
| R-3 | 지금 동의 화면이 **테스트 상태**라 refresh token 이 **7일 뒤 만료**되어 매주 끊긴다(선생님 1명이라 일부러 이렇게 시작한다) | 끊기면 읽기는 계속되고 쓰기만 멈추며, 설정의 [다시 연결]로 복구된다(기존 `status='error'` 처리). 번거로우면 **앱 게시**로 바꾼다. `drive.file`·`openid`·`email` 만 쓰므로 검수가 필요 없다([02 B](./02-google-setup.md#b-앱-게시하기-나중에--7일-만료를-없앨-때)) |
| R-4 | 학부모 업로드도 **선생님 Drive 15GB** 를 쓴다. 영상 하나가 최대 500MB 다 | 앨범 화면에 남은 용량을 보여 준다(기존 quota). 부족하면 `quota` 오류 문구(기존). 업로드 받기 토글로 끌 수 있다 |
| R-5 | `drive.file` 범위라 선생님이 **Drive 에서 직접 넣은 사진은 앱에 안 보인다** | 앨범 화면 도움말에 적는다. 2차에서 Google Picker 로 "Drive 에서 가져오기"(선택한 파일만 권한을 받으므로 역시 검수가 필요 없다) |
| R-6 | 한 사람이 관리자 행과 선생님 행을 함께 가진다. 관리자 행으로 연결하면 소용이 없다 | 앨범은 이벤트 주인(선생님 행)의 연결을 쓴다. 설정 카드는 선생님 화면에만 있다. 관리자 설정에는 넣지 않는다 |
| R-7 | Drive 에서 폴더 이름을 직접 바꾸면 이벤트 수정 때 덮어쓴다 | 의도한 동작이다(이름은 이벤트 기준). 도움말에 적는다 |
| R-8 | 다른 세션과 같은 체크아웃에서 충돌한다 | 전용 워크트리 `rg-manager-gdrive-photos` 를 쓴다 |

---

## 12. Google 연동에 필요한 것 (사용자 준비물)

1~4 는 **이미 되어 있다**(§1.4). 남은 것은 3번의 게시 상태 하나다. 지금은 테스트 상태에 테스트 사용자를 등록해 쓰고,
게시는 나중에 한다 → [02-google-setup.md](./02-google-setup.md). 아래는 처음부터 다시 만들 때를 위한 전체 목록이다.

1. Google Cloud Console → 프로젝트 → **Google Drive API 사용 설정**
2. **OAuth 클라이언트 ID**(유형: 웹 애플리케이션)
   - 승인된 리디렉션 URI: `https://rg-manager.vercel.app/api/drive/callback`, 로컬은 `http://localhost:5001/api/drive/callback`
   - 결과값 → `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
3. **OAuth 동의 화면**: 사용자 유형 **외부**, 범위는 `drive.file`, `openid`, `email`. **테스트 상태**면 테스트 사용자만 연결되고 토큰이 7일마다 끊긴다. **프로덕션으로 게시**하면 둘 다 풀린다(R-3)
4. Vercel 운영 환경변수에 2번의 두 값을 넣고 재배포한다(`GOOGLE_OAUTH_REDIRECT_URI` 는 기본값이 `APP_URL` 기준이라 보통 필요 없다)
5. 선생님 계정 → 설정 → **Google 계정 연결** → 본인 Google 계정으로 동의

---

## 13. 이번 범위 밖 (2차 후보)

- 선생님 얼굴 태그 관리 화면(확인 필요, 태그 없음, 다시 매칭, 재분석). API 는 있다.
- 학부모 업로드 승인제(D-5).
- Google Picker 로 Drive 의 기존 사진 가져오기(R-5).
- 썸네일 프록시와 "공개 시에만 Drive 링크 공유"(R-1).
- refresh token 암호화 저장(R-2).
- 공개 알림. 학부모는 카카오 메시지를 받지 않으므로(2026-08 결정) 사진 탭의 "새 사진" 점 표시 정도.
- ~~이벤트에 묶이지 않은 앨범(예: "2026 봄 연습")~~ → 사진 전용 폴더로 들어갔다(FR-517, D-8). 폴더 이름·날짜 고치기와 지우기도 들어갔다(FR-519).
- **이벤트 연결 바꾸기**: 잘못 고른 이벤트에 올린 사진을 다른 이벤트로 옮기기(Drive `files.update` 로 부모 폴더 변경). 이번에는 지우고 다시 올린다.
