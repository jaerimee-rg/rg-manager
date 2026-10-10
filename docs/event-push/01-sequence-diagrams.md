# 새 일정 브라우저 알림 — 시퀀스 다이어그램

[← README](./README.md)

네 장면으로 나눈다. 모두 실제 코드 순서 그대로다(2026-10-10, PR #72 기준).

1. [알림 켜기 (구독)](#1-알림-켜기-구독) — 학부모가 내 정보에서 스위치를 켤 때
2. [선생님 저장 → 발송](#2-선생님-저장--발송) — [학부모에게 알림 보내기] 를 체크하고 저장할 때
3. [전달 → 표시 → 누르기](#3-전달--표시--누르기) — 푸시 서버가 기기에 전하고, 학부모가 알림을 누를 때
4. [끄기 · 자동 정리](#4-끄기--자동-정리)
5. [환경별 분기](#5-환경별-분기--카드가-무엇을-보여-주나) · [결과 안내 문구](#6-선생님-화면의-결과-안내)

---

## 1. 알림 켜기 (구독)

학부모가 **내 정보** 를 열면 카드가 서버 설정을 읽고, 켤 수 있는 브라우저면 **서비스 워커를 미리 등록**해 둔다.
아이폰은 "사용자가 누른 그 순간" 에만 권한을 물을 수 있어서, 누른 뒤에 등록부터 하면 늦다.

```mermaid
sequenceDiagram
  autonumber
  actor P as 학부모
  participant C as 내 정보 카드<br/>EventPushCard
  participant B as 브라우저<br/>Push API
  participant PS as 푸시 서버<br/>FCM · APNs · Mozilla
  participant API as 우리 서버<br/>/api/parent/push
  participant DB as DB<br/>push_subscriptions

  P->>C: 내 정보 열기
  C->>API: GET /api/parent/push
  API-->>C: configured, publicKey (VAPID 공개키)
  alt 서버에 VAPID 키가 없음
    C-->>P: 카드를 그리지 않는다
  else 카카오톡 · 아이폰 사파리 탭 · 지원 안 하는 브라우저
    C-->>P: 스위치 대신 안내 (5. 환경별 분기)
  else 켤 수 있는 브라우저
    C->>B: serviceWorker.register('/sw.js') — 미리 등록
    B-->>C: registration
    C->>B: pushManager.getSubscription()
    opt 이미 켜져 있던 기기
      C->>API: POST /subscriptions (같은 구독을 다시 저장 — 계정이 바뀌었으면 이 계정으로)
    end
    C-->>P: 스위치 (켜짐 · 꺼짐)
  end

  P->>C: 스위치 켜기 (탭)
  C->>B: Notification.requestPermission()
  B->>P: "알림을 허용할까요?"
  P-->>B: 허용
  C->>B: pushManager.subscribe(userVisibleOnly, applicationServerKey = VAPID 공개키)
  B->>PS: 구독 등록 (브라우저가 정한 푸시 서버 — 우리는 가입하지 않는다)
  PS-->>B: endpoint (이 기기 전용 주소) — 공개키에 묶어 둔다
  B->>B: 암호화 키 생성 p256dh · auth (짝이 되는 비밀은 기기 안에만)
  B-->>C: PushSubscription (endpoint, keys)
  C->>API: POST /api/parent/push/subscriptions
  API->>API: normalizeSubscription — https · 허용된 푸시 호스트 · 키 길이
  alt 목록에 없는 호스트 · 틀린 키
    API-->>C: 400 (호스트는 로그에 남긴다)
    C->>B: subscription.unsubscribe() — 기기에만 남지 않게
    C-->>P: "알림을 켜지 못했어요"
  else 통과
    API->>DB: INSERT … ON CONFLICT (endpoint) DO UPDATE userId = 지금 학부모
    API-->>C: subscribed true
    C-->>P: "알림을 켰어요" — 스위치 켜짐
  end
```

- 권한을 **거절**하면 구독하지 않고 카드에 "알림이 차단돼 있어요 · 브라우저 설정에서 허용" 이 뜬다.
- 저장이 실패하면 기기 구독도 푼다 — 화면에는 "켜짐" 인데 알림은 안 오는 상태를 만들지 않으려고.
- 구독 주소를 허용 목록으로 거르는 이유: 서버가 나중에 그 주소로 POST 를 보내기 때문에, 아무 주소나 받으면 서버를 다른 곳을 두드리는 데 쓸 수 있다.

## 2. 선생님 저장 → 발송

체크하고 저장한 경우에만 보낸다. 서버는 **이벤트를 먼저 저장(COMMIT)** 한 뒤 보내고, **다 보낼 때까지 기다렸다가** 응답한다 —
Vercel 은 응답을 보내는 순간 인스턴스를 얼려서, 뒤로 미룬 발송은 나가지 않는다. 발송이 실패해도 저장은 그대로다.

```mermaid
sequenceDiagram
  autonumber
  actor T as 선생님
  participant F as 이벤트 폼<br/>EventForm
  participant EC as 이벤트 API<br/>eventController
  participant EP as 발송<br/>eventPush.js
  participant DB as DB
  participant WP as web-push<br/>라이브러리
  participant PS as 푸시 서버
  participant L as 이벤트 목록<br/>EventList

  T->>F: [학부모에게 알림 보내기] 체크 + 저장
  F->>EC: POST /api/events (수정은 PUT) notifyParents = true
  EC->>DB: BEGIN · INSERT events · COMMIT
  EC->>EP: notifyParentsOfEvent(event) — await
  alt 비공개 이벤트 · 사진 폴더 · VAPID 키 없음
    EP-->>EC: skipped (private · not_event · not_configured)
  else 보낼 수 있음
    EP->>DB: 이벤트 주인 선생님과 연결된 학부모의 구독<br/>push_subscriptions JOIN parent_teachers (role = parent)
    DB-->>EP: 기기 목록 (학부모 1명이 여러 기기일 수 있다)
    EP->>EP: eventPushMessage — web_push 8030, notification(title, body, navigate, tag)
    loop 기기마다 동시에 (Promise.allSettled, 한 곳당 5초)
      EP->>WP: sendNotification(구독, 내용, TTL 3일 · topic event-id · vapidDetails)
      WP->>WP: 내용 암호화 — 그 기기의 p256dh · auth (aes128gcm)
      WP->>WP: VAPID JWT 서명 — 비밀키, aud = 푸시 서버 주소
      WP->>PS: HTTPS POST endpoint (암호문 + Authorization vapid)
      PS->>PS: 서명을 구독 때 받은 공개키로 확인 · 보관
      alt 받음
        PS-->>WP: 201 Created
      else 없는 구독 (알림을 끄거나 브라우저 데이터를 지운 기기)
        PS-->>WP: 404 · 410
      else 그 밖의 실패 · 시간 초과
        PS-->>WP: 5xx · 응답 없음
      end
    end
    EP->>DB: 404 · 410 이었던 구독 삭제
    EP-->>EC: recipients(받은 학부모 수), sent, failed, removed
  end
  EC-->>F: 201 이벤트 + notification
  F->>L: 목록으로 이동 (router state 로 결과 문구)
  L-->>T: "학부모 3명에게 알림을 보냈어요" (4초)
```

- 체크하지 않은 저장은 `notification` 이 없고 응답 모양도 예전과 같다.
- 받는 사람 = **이벤트를 만든 선생님** 과 연결된 학부모(`parent_teachers`) — 학부모 일정에 그 이벤트가 보이는 사람과 같다.
  관리자가 남의 이벤트를 고쳐 보내도 그 선생님의 학부모에게 간다.
- `topic` · `tag` 가 `event-<id>` 라 같은 이벤트를 다시 보내면 **쌓이지 않고 바뀐다**. 휴대폰이 꺼져 있으면 푸시 서버가 **3일(TTL)** 까지 보관한다.

## 3. 전달 → 표시 → 누르기

푸시 서버는 기기와 늘 연결돼 있다(안드로이드는 구글 플레이 서비스, 아이폰은 APNs). 그래서 **탭 · 브라우저가 닫혀 있어도** 온다.

```mermaid
sequenceDiagram
  autonumber
  participant PS as 푸시 서버
  participant OS as 휴대폰 · PC<br/>운영체제
  participant B as 브라우저
  participant SW as 서비스 워커<br/>sw.js
  actor P as 학부모
  participant App as 앱 화면

  PS->>OS: 열려 있는 연결로 전달 (꺼져 있었으면 켜질 때)
  OS->>B: 브라우저 깨우기 — 탭이 닫혀 있어도
  B->>B: 복호화 (기기 안의 비밀로만 풀린다)
  B->>SW: push 이벤트 — notification JSON
  SW->>SW: sameOriginUrl(navigate) — 경로만 남겨 우리 사이트로 고정
  SW->>B: showNotification(제목, 내용, tag event-id, 아이콘, data.url)
  B->>OS: 알림 표시
  OS-->>P: "새 일정 · 서울시장배 대회 / 10월 12일(월) 10:00 · 올림픽공원 / 지금 신청할 수 있어요"
  Note over B,SW: 아이폰 iOS 18.4+ 는 Declarative Web Push 형식(web_push 8030)이라<br/>서비스 워커가 실패해도 브라우저가 같은 내용으로 직접 띄운다

  P->>OS: 알림 누름
  OS->>B: 알림 클릭
  B->>SW: notificationclick
  SW->>SW: 알림 닫기 · 열 주소 = 우리 사이트의 /parent/events/id
  alt 이 앱 창이 이미 열려 있음
    SW->>App: focus() + navigate(/parent/events/id)
  else 열린 창이 없음 · 창을 옮기지 못함
    SW->>App: clients.openWindow(/parent/events/id)
  end
  App-->>P: 이벤트 상세 (신청 버튼)
```

- 서비스 워커는 **푸시와 클릭만** 다룬다. 화면 파일을 가로채거나 캐시하지 않아서 앱 동작에는 영향이 없다.
- 알림 내용에 다른 사이트 주소가 와도 **경로만 남겨 우리 사이트에서** 연다(`sameOriginUrl`). 다른 사이트의 창은 쓰지 않는다.

## 4. 끄기 · 자동 정리

```mermaid
sequenceDiagram
  autonumber
  actor P as 학부모
  participant C as 내 정보 카드
  participant B as 브라우저
  participant PS as 푸시 서버
  participant API as 우리 서버
  participant DB as DB
  participant EP as 발송 eventPush.js

  rect rgba(236, 233, 226, 0.6)
    Note over P,DB: 학부모가 스위치를 끈다
    P->>C: 스위치 끄기
    C->>B: pushManager.getSubscription()
    C->>API: DELETE /api/parent/push/subscriptions (endpoint)
    API->>DB: DELETE WHERE userId = 나 AND endpoint = 이 기기
    API-->>C: removed true
    C->>B: subscription.unsubscribe()
    B->>PS: 구독 해제
    C-->>P: "이 기기의 알림을 껐어요"
  end

  rect rgba(236, 233, 226, 0.6)
    Note over P,EP: 학부모가 브라우저 설정에서 알림을 막거나 데이터를 지웠다 (우리 서버는 모른다)
    P->>B: 사이트 알림 차단 · 데이터 삭제
    B->>PS: 구독이 사라짐
    EP->>PS: 다음 이벤트 알림 발송
    PS-->>EP: 410 Gone
    EP->>DB: 그 구독 삭제 — 다음부터 보내지 않는다
  end
```

- 지우기는 **내 구독만** 지운다 — 다른 학부모의 endpoint 를 보내도 `userId` 가 달라 지워지지 않는다.
- 같은 기기에서 다른 학부모 계정으로 들어와 내 정보를 열면 구독이 **그 계정으로 옮겨 간다**(1번의 "다시 저장").

## 5. 환경별 분기 — 카드가 무엇을 보여 주나

`client/src/utils/pushNotifications.js:pushEnvironment`

```mermaid
flowchart TD
  A[내 정보 열기] --> K{서버에 VAPID 키?}
  K -- 없음 --> H[카드 숨김]
  K -- 있음 --> U{User-Agent 에 KAKAOTALK?}
  U -- 예 --> KT[카카오톡 안내<br/>브라우저로 열기 버튼]
  U -- 아니오 --> S{serviceWorker · PushManager · Notification<br/>모두 있음?}
  S -- 예 --> R{서비스 워커 등록 성공?}
  R -- 예 --> D{권한이 denied?}
  D -- 예 --> DN[차단 안내<br/>브라우저 설정에서 허용]
  D -- 아니오 --> SW[켜기 · 끄기 스위치]
  R -- 아니오 --> UN[이 브라우저에서는 받을 수 없어요]
  S -- 아니오 --> I{아이폰 · 아이패드?}
  I -- 아니오 --> UN
  I -- 예 --> ST{홈 화면 앱으로 열었나?}
  ST -- 아니오 --> IOS[홈 화면에 추가 안내<br/>공유 → 홈 화면에 추가 → 아이콘으로 열기]
  ST -- 예 --> UPD[iOS 16.4 이상으로 업데이트 안내]
```

## 6. 선생님 화면의 결과 안내

저장 응답의 `notification` → `notifyResultMessage` → 이벤트 목록에 4초 동안.

| `notification` | 안내 |
|---|---|
| `recipients > 0` | 학부모 N명에게 알림을 보냈어요 |
| `recipients = 0`, `failed = 0` | 알림을 켠 학부모가 아직 없어요 · 학부모가 내 정보에서 알림을 켜면 받을 수 있어요 |
| `recipients = 0`, `failed > 0` | 학부모 알림을 보내지 못했어요 · 잠시 뒤 다시 해 주세요 |
| `skipped: not_configured` | 알림 기능이 아직 준비되지 않아 학부모 알림은 보내지 못했어요 |
| `skipped: private` | 비공개 이벤트라 학부모 알림은 보내지 않았어요 |
| `skipped: error` | 학부모 알림을 보내지 못했어요 |
| 없음 (체크 안 함) | 안내 없이 목록으로 |

`recipients` 는 **푸시 서버가 받은** 기기가 하나라도 있는 학부모 수다. 화면에 떴는지 · 읽었는지는 알 수 없다.
