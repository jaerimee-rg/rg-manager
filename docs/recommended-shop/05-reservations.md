# 3차 — 상품 예약

> 상태: **구현 완료 — 2026-10-04**

## 1. 요청 (2026-10-04)

> 상품 등록시 특정 상품 예약을 받을 수 있게 하고 싶어. 예약 가능하게 토글 또는 체크 박스 넣어줘. 그리고 학부모 상점 페이지에서는
> 해당 상품 누르면 예약 버튼이 하단에 나오고, 학부모 또는 아이 이름과 전화번호 그리고 예약 날짜를 달력에서 선택하게 해줘.
> 그리고 선생님 페이지에서 추천상품 탭 하위에 상품, 통계, 설정에 상품 예약 탭도 추가하고, 예약 요청 오면 추가되도록 하고,
> 예약 상태 변경 가능하도록 해줘. 요청, 확정, 취소 같은 상태 변경하도록 해줘.

## 2. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 켜는 곳 | 상품 등록·수정의 **[예약 받기]** 스위치(`shop_products."isReservable"`, 기본 꺼짐) | "학부모에게 보이기" 와 같은 모양. 수정에서 값을 빼고 보내면 그대로 둔다(공개 여부와 같은 규칙) |
| 학부모 입력 | **이름**(학부모 또는 아이, 30자) · **전화번호** · **예약 날짜** — 셋 다 필수, 로그인 없음 | 요청 그대로. 전화번호는 숫자만 남겨 `010-1234-5678` 모양으로 저장 |
| 날짜 고르기 | 그 자리에 펼쳐지는 **한 달 달력**(`components/ui/Calendar.jsx`, 디자인 시스템에 추가). **오늘(KST)부터 180일 뒤까지** | 브라우저 날짜 칸은 휴대폰마다 모양이 달라 "달력에서 고르기" 가 보장되지 않는다. 너무 먼 날짜는 선생님이 약속하기 어렵다 |
| 예약 버튼 | 상품 상세 아래(모바일은 시트 아래에 붙음). 쇼핑몰 링크도 있으면 **[예약하기]가 위(검정)**, 쇼핑몰은 테두리 버튼 | 둘 다 있을 때 어느 쪽이 주인공인지 분명하게 |
| 예약 폼 | 상세와 **같은 창 안에서** 화면만 바뀐다. 폼에서 Esc·바깥 누르기는 창을 닫지 않고 상품으로 돌아간다 | 창 위에 창을 띄우면 Esc 한 번에 둘 다 닫힌다(사진 자르기와 같은 이유). 쓰던 입력을 잃지 않게 |
| 카드 | 예약 받는 상품은 사진 위에 **"예약 가능"**, 사진·링크가 없어도 누를 수 있다 | 예약하려면 상세를 열어야 한다 |
| 상태 | **요청 → 확정 / 취소**, 어느 쪽으로든 되돌릴 수 있다 | 잘못 누른 것을 고칠 수 있게. 삭제는 두지 않았다(취소로 충분) |
| 학부모 알림 | **없음** — 선생님이 남긴 번호로 직접 연락한다. 보낸 뒤 화면에 "선생님이 확인한 뒤 연락드려요" | 학부모에게 카카오 메시지를 보내지 않는다는 기존 결정(2026-08) |
| 같은 요청 두 번 | 같은 상품·번호·날짜로 아직 '요청' 인 것이 있으면 **새로 만들지 않고** "이미 요청한 예약이에요" | 버튼 연타·다시 보내기로 목록이 지저분해지지 않게 |
| 상품 삭제 | 예약은 **남는다**(`productId` 만 비고, 예약할 때의 상품 이름으로 보인다 — "삭제된 상품") | 이미 받은 예약을 말없이 지우지 않는다 |

## 3. 데이터

```sql
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS "isReservable" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS shop_reservations (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,                 -- 상점 주인(선생님) — 모든 조회의 범위
  "productId" INTEGER,                       -- 상품이 지워지면 NULL
  "productTitle" TEXT NOT NULL,              -- 예약할 때의 상품 이름(상품이 지워졌을 때만 보인다)
  name TEXT NOT NULL,
  phone TEXT NOT NULL,                       -- 010-1234-5678
  "reservedDate" TEXT NOT NULL,              -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled')),
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY ("productId") REFERENCES shop_products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_reservations_user ON shop_reservations ("userId", "createdAt" DESC);
```

## 4. API

| 메서드 · 경로 | 누가 | 설명 |
|---|---|---|
| `POST /api/shop/public/:publicId/products/:productId/reservations` | 누구나(로그인 없음) | 본문 `{ name, phone, date }`. 201 새 예약 / 200 `duplicate: true`. 응답은 **날짜·상태만**(`toPublicReservation`). 닫힌 상점·숨김·남의 상품 **404**, 예약을 끈 상품 **409**, 입력 오류 **400 + fields**. IP(서브넷)당 15분 **20회**(`PUBLIC_SHOP_RESERVE_IP_MAX`) — 방문·클릭 기록 한도와 따로 |
| `GET /api/shop/reservations` | 선생님 | 최근 요청이 위, 500건까지. 이름·전화번호는 상점 주인에게만 |
| `PATCH /api/shop/reservations/:id/status` | 선생님 | `{ status: 'requested' \| 'confirmed' \| 'cancelled' }`. 남의 예약 404, 모르는 상태 400. 로그에는 `예약 ID: 3 → 확정` 만(이름·번호 없음) |
| `GET /api/shop` | 선생님 | 응답에 `requestedReservations`(처리 전 개수) 추가 — 탭 옆 숫자 |

규칙(이름·전화번호·날짜)은 서버 `utils/shopReservation.js` 와 클라이언트 `utils/shopReservation.js` 에 같은 내용이 있고,
두 쪽 테스트가 **같은 전화번호 표**로 확인한다(주소 규칙과 같은 방식). 바꾸면 두 쪽을 함께 바꾼다.

## 5. 화면

- 선생님 `/products/reservations` — 탭 순서 **상품 · 예약 · 통계 · 설정**, 예약 탭 옆 숫자는 처리 전(요청) 개수(없으면 숫자 없음).
  상태 칩(전체·요청·확정·취소 + 개수)으로 거르고, 행마다 **요청 / 확정 / 취소** 세그먼트로 바꾼다(바로 바뀌고, 저장이 실패하면 그 행만
  되돌린다). 전화번호는 `tel:` 링크. 취소한 행은 흐리게 줄을 긋는다. 상품 표에는 예약 받는 상품에 **예약** 배지.
- 학부모 `/shop/:publicId?p=<id>` — 상세 아래 [예약하기] → 폼(이름 · 전화번호(치는 동안 하이픈) · 달력) → [예약 요청 보내기] →
  보낸 내용 확인 화면. 데스크톱은 넓은 창 가운데 한 줄 폼, 보내기 버튼은 창 아래에 붙어 있다.

## 6. 배포

새 컬럼 1개 · 새 표 1개 · 인덱스 1개. 1·2차와 같이 **머지 전에** 운영 DB 에 위 DDL 을 넣고(추가만 하므로 지금 코드와도 맞는다),
`ALTER TABLE shop_reservations OWNER TO rg_app` + `REVOKE ALL ON TABLE shop_reservations, SEQUENCE shop_reservations_id_seq
FROM anon, authenticated, service_role` — 이름·전화번호가 들어가는 표라 공개 REST API 로 새면 안 된다.
옮기기(백필)는 없다.
