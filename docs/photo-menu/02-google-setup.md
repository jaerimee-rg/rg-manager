# Google 계정 연동 설정 — "Access blocked" 오류 해결

> 2026-10-08 작성. 설정 → Google 계정 연결을 누르면 아래 오류가 났다.
>
> ```
> Access blocked: rg-manager.vercel.app has not completed the Google verification process
> … The app is currently being tested, and can only be accessed by developer-approved testers.
> Error 403: access_denied
> ```

## 원인

Google Cloud 의 OAuth 동의 화면(지금 이름은 **Google 인증 플랫폼**)이 **테스트(Testing)** 상태다.
테스트 상태에서는 **테스트 사용자로 등록한 Google 계정만** 연결할 수 있고, 나머지는 위 오류로 막힌다.

이 오류 화면까지 왔다면 나머지 설정은 이미 되어 있다는 뜻이다. 운영 Vercel 의 `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`,
리디렉션 URI, Drive API 가 정상이다. 키가 없었다면 Google 로 넘어가지 않고 설정 화면에서 "연동이 설정되지 않았습니다"가 떴을 것이다.

해결 방법은 둘이다.

| | A. 테스트 사용자로 등록 (**지금 — 선생님 1명**) | B. 앱 게시(프로덕션) |
|---|---|---|
| 걸리는 시간 | 1분 | 1분 (범위가 비민감이라 검수 없음) |
| 연결할 수 있는 사람 | 등록한 계정만 (최대 100명) | Google 계정이 있는 누구나 |
| 연결 유지 | **7일마다 끊긴다.** 다시 연결해야 한다 | 끊기지 않는다 (사용자가 권한을 철회하지 않는 한) |
| 언제 쓰나 | 선생님이 한 명이고 바로 써 봐야 할 때 | 선생님이 늘거나, 매주 다시 연결하는 게 번거로울 때 |

---

## 0. 어느 계정으로 Google Cloud 에 들어가나

**운영 Vercel 의 `GOOGLE_OAUTH_CLIENT_ID` 를 만든 Google Cloud 프로젝트에 권한(소유자·편집자)이 있는 계정**으로 들어간다.
연결하려는 선생님 계정(테스트 사용자로 넣을 주소)과는 **다른 계정일 수 있다.** 들어가는 계정은 "설정을 바꾸는 사람", 테스트 사용자는 "연결하는 사람"이다.

이 저장소와 지난 작업 기록에는 그 계정이 남아 있지 않다(2026-10-08 확인). 다음 순서로 찾는다.

1. **프로젝트 번호 알아내기**: Vercel → `rg-manager` 프로젝트 → Settings → Environment Variables → `GOOGLE_OAUTH_CLIENT_ID` 값을 본다.
   `123456789012-abcd….apps.googleusercontent.com` 에서 **맨 앞 숫자(`-` 앞)가 Google Cloud 프로젝트 번호**다.
2. **후보 계정으로 들어가 보기**: rg-manager 를 만들 때 쓴 개인 Google 계정(Vercel·GitHub·Supabase 를 연 계정)부터 시작한다.
   <https://console.cloud.google.com> → 맨 위 프로젝트 선택 → 목록에 같은 프로젝트 번호가 있는지 본다. 또는 **Google 인증 플랫폼 → 클라이언트(Clients)** 에 같은 클라이언트 ID 가 있는지 본다.
3. 찾은 계정이 다른 사람 것이면, 그 사람이 직접 테스트 사용자를 추가하거나, **IAM 및 관리자 → IAM** 에서 내 계정에 편집자 권한을 준다.
4. **어느 계정에도 없으면** 새로 만드는 편이 빠르다. 내 계정으로 프로젝트 생성 → Google Drive API 사용 → OAuth 클라이언트(웹) 생성
   (리디렉션 URI `https://rg-manager.vercel.app/api/drive/callback`) → Vercel 의 두 값(`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`) 교체 → 재배포.
   운영에는 연결된 선생님이 아직 없어서(연결 0건) 바꿔도 끊기는 사람이 없다.

## A. 테스트 사용자로 등록하기 (지금 할 것)

### 1. Google Cloud Console 에서 등록

1. <https://console.cloud.google.com> 에 **0번에서 찾은 계정**으로 로그인한다.
2. 화면 맨 위 프로젝트 선택에서 **rg-manager 용 프로젝트**를 고른다(OAuth 클라이언트를 만든 프로젝트).
3. 왼쪽 메뉴(☰) → **Google 인증 플랫폼(Google Auth Platform)** → **대상(Audience)** 으로 간다.
   - 예전 화면이라면 **API 및 서비스 → OAuth 동의 화면** 이다. 아래쪽에 같은 "테스트 사용자" 칸이 있다.
4. **게시 상태**가 **테스트(Testing)** 인지 확인한다. 그대로 둔다.
5. **테스트 사용자(Test users)** → **[+ Add users / 사용자 추가]** 를 누른다.
6. 선생님이 연결할 **Google 계정 주소**를 넣는다. 오류 화면 맨 위에 나온 그 주소다. 그리고 **[저장]** 한다.
   - 주소는 **정확히 같아야** 한다. `@gmail.com` 계정이면 그대로 쓴다.

### 2. 앱에서 다시 연결

1. 선생님 계정으로 rg-manager 에 로그인한다 → **설정** → **Google Drive / Google 계정** 카드 → **[Google 계정 연결하기]**.
2. Google 화면에서 **방금 등록한 계정**을 고른다.
3. "Google에서 확인하지 않은 앱" 경고가 나오면 **[계속]** 을 누른다. 테스트 상태 앱이라 나올 수 있는 화면이다.
4. 권한 화면에서 **허용** → 설정 화면으로 돌아와 "Google 계정을 연결했습니다"가 뜨면 끝이다.
   - 내 드라이브에 **`RG Manager`** 폴더가 새로 생긴 것으로도 확인할 수 있다.

### 3. 7일마다 다시 연결하기 (테스트 상태의 제약)

테스트 상태에서 받은 연결(refresh token)은 **7일 뒤 만료**된다. 만료되면 앱이 이렇게 동작한다(이미 구현된 처리, `services/driveAccess.js`).

- 토큰 갱신이 `invalid_grant` 로 실패한다 → 연결 상태가 **`error`(연결 끊김)** 로 바뀐다.
- **이미 올린 사진은 그대로 보인다.** 학부모 화면도 계속 보인다(Drive 링크 공유로 읽기 때문). Drive 의 파일도 지워지지 않는다.
- **새 사진 올리기, 지우기, 앨범 만들기만 멈춘다.** 설정 카드와 앨범 화면에 "연결이 끊어졌어요 [다시 연결]" 이 뜬다.
- 선생님이 **설정 → [다시 연결]** 을 누르고 2번 과정을 다시 하면 그때부터 다시 7일이다. 앨범·사진·폴더는 그대로 이어진다.

> 매주 다시 연결하는 게 번거로우면 아래 **B** 로 바꾼다. B 로 바꾼 뒤 **한 번만 다시 연결**하면 그다음부터는 끊기지 않는다.

### 안 될 때

| 증상 | 확인할 것 |
|---|---|
| 등록했는데도 같은 `access_denied` | 등록한 주소와 Google 화면에서 고른 계정이 같은지, 저장을 눌렀는지. 다른 프로젝트에 등록하지 않았는지(1-2) |
| 회사·학교 Google 계정(Workspace) | 그 조직 관리자가 외부 앱을 막아 둘 수 있다 → 개인 `@gmail.com` 계정으로 연결 |
| 고급 보호 프로그램에 가입한 계정 | Google 이 대부분의 외부 앱을 막는다 → 다른 계정으로 연결 |
| `Error 400: redirect_uri_mismatch` | OAuth 클라이언트의 승인된 리디렉션 URI 에 `https://rg-manager.vercel.app/api/drive/callback` 이 있는지 |
| 설정 화면으로 돌아왔는데 "권한을 다 받지 못했습니다" | 권한 화면의 체크를 끄지 말고 다시 연결 (앱이 매번 동의를 다시 받도록 되어 있다) |

---

## B. 앱 게시하기 (나중에 — 7일 만료를 없앨 때)

1. 같은 화면 **Google 인증 플랫폼 → 데이터 액세스(Data Access)** 에서 범위가 **이 세 개뿐인지** 먼저 확인한다.
   - `.../auth/drive.file`, `openid`, `.../auth/userinfo.email`
   - 앱 코드(`server/utils/googleDrive.js`)가 요청하는 것도 이 셋뿐이다. 모두 **비민감 범위**라 게시할 때 **Google 검수가 필요 없다.**
   - `.../auth/drive`(전체) 같은 **민감 범위가 목록에 있으면 지운다.** 남아 있으면 검수(개인정보처리방침, 시연 영상, 며칠~몇 주) 대상이 된다.
2. **대상(Audience)** → 게시 상태 옆 **[앱 게시 / Publish app]** → 확인. 상태가 **프로덕션(In production)** 으로 바뀐다.
3. **선생님이 설정에서 한 번 다시 연결**한다. 테스트 상태 때 받은 연결은 7일 만료가 그대로 남아 있으므로, 새로 받아야 만료 없는 연결이 된다.
4. 테스트 사용자 목록은 더 이상 쓰이지 않는다(지워도 되고 둬도 된다).

참고로, 동의 화면에 앱 이름 대신 `rg-manager.vercel.app` 이 보이는 것은 **브랜드 인증**을 하지 않아서다. 동작과는 상관없다.
"JR 리듬체조" 이름과 로고를 띄우고 싶을 때만 브랜드 인증을 한다(홈페이지와 개인정보처리방침 주소가 필요하다).

## 출처

- [OAuth App Verification Help Center — 비민감 범위만 쓰면 검수 필수 아님, 브랜드 인증](https://support.google.com/cloud/answer/13463073)
- [Google Cloud 도움말 — 게시 상태(테스트 / 프로덕션)](https://support.google.com/cloud/answer/15549945)
- [Google Health API 설정 문서 — 테스트 상태의 refresh token 은 7일 뒤 만료](https://developers.google.cn/health/setup?hl=en)
