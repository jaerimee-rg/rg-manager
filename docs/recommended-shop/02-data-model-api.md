# 선생님 추천 상품 (공개 상점) — 데이터 모델 · API 설계

> 상태: **구현 완료 — 2026-10-04** (브랜치 `feat/recommended-shop`) · 관련: [01-requirements.md](./01-requirements.md) (FR 번호는 그 문서 기준), [03-implementation-plan.md](./03-implementation-plan.md)

## 1. 스키마 (PostgreSQL, `server/database.js`)

`initDatabase()` 끝에 **이 순서로** 추가한다. 기존 규칙 그대로 — 식별자는 camelCase + 큰따옴표, 시각은 `TEXT`(ISO 8601, `new Date().toISOString()`),
전부 `IF NOT EXISTS` 라 몇 번 실행해도 안전하다. 기존 테이블은 건드리지 않는다.

```sql
-- 1) 상점: 선생님당 1개 (FR-400~404)
CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  "publicId" TEXT NOT NULL UNIQUE,          -- generatePublicId(): 128비트, URL-safe 22자
  title TEXT NOT NULL,
  intro TEXT,                               -- 소개 (0~300자)
  notice TEXT,                              -- 하단 안내문 (제휴 고지 등, 0~300자)
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE, -- 공개 ON/OFF
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- 2) 카테고리: 선생님별 목록 (FR-420~422)
CREATE TABLE IF NOT EXISTS shop_categories (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL
);
-- 같은 선생님 안에서 이름 중복 금지 (대소문자·앞뒤 공백 무시)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_categories_user_name
  ON shop_categories ("userId", lower(btrim(name)));

-- 3) 상품 (FR-410~428)
CREATE TABLE IF NOT EXISTS shop_products (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "categoryId" INTEGER REFERENCES shop_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,                      -- 필수, 1~80자
  url TEXT,                                 -- 선택, http/https 만
  price INTEGER,                            -- 선택, 원 단위 0~100,000,000. NULL = 표시 안 함
  "imagePath" TEXT,                         -- 저장소 키 (서버 전용, 공개 응답에 없음)
  "imageUrl" TEXT,                          -- 공개 URL
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,   -- 작을수록 위. 새 상품 = 현재 최소값 - 1
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_products_user
  ON shop_products ("userId", "sortOrder", id DESC);

-- 4) 방문·클릭 기록 (FR-440~445)
CREATE TABLE IF NOT EXISTS shop_events (
  id BIGSERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- 상점 주인 (통계 범위)
  "productId" INTEGER REFERENCES shop_products(id) ON DELETE CASCADE,        -- view 는 NULL
  type TEXT NOT NULL CHECK (type IN ('view', 'click')),
  "visitorKey" TEXT,                        -- 브라우저 난수 키 (최대 100자). IP·UA 는 저장하지 않는다
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_events_user_time
  ON shop_events ("userId", type, "createdAt");
CREATE INDEX IF NOT EXISTS idx_shop_events_product_time
  ON shop_events ("productId", "createdAt") WHERE type = 'click';
```

**왜 이렇게**

- `shops` 를 `chat_channels` 처럼 `userId UNIQUE` 로 둬서 `INSERT … ON CONFLICT ("userId") DO NOTHING` 으로 동시 요청에도 1개만 생긴다(`ChatChannel.create` 와 같은 방식).
- `shop_products."userId"` 를 따로 둔다 — 카테고리 없는 상품도 있으므로 소유자를 카테고리로 거슬러 올라갈 수 없다. 모든 선생님 쿼리는 `WHERE "userId" = $me` 로 시작한다.
- `shop_events."userId"` 는 중복(상품에서도 알 수 있음)이지만 **방문(view) 행에는 상품이 없고**, 통계 요약을 상품 조인 없이 인덱스 한 번으로 세기 위해 둔다.
- 상품 삭제 → 클릭 기록 CASCADE(FR-417·455). 기록을 남기려면 숨김(FR-426). 소프트 삭제를 하지 않는 이유: 목록·공개·통계 쿼리마다 `deletedAt IS NULL` 을 빼먹을 위험이 생기고, 숨김이 이미 그 역할을 한다.
- 시각을 `TEXT` ISO 로 두는 것은 기존 테이블 전체의 규칙이다. `toISOString()` 은 항상 UTC·같은 길이라 **문자열 비교가 시간 비교와 같다**(`"createdAt" >= $since`).
- 이 규모(선생님 1명, 하루 수십~수백 건)에서 `shop_events` 는 몇 년이 지나도 수십만 행이다. 집계 테이블·파티션은 필요 없다.

## 2. 순수 함수 (단위 테스트 대상)

DB·요청을 모르는 함수로 분리해 경계값을 표로 테스트한다. 클라이언트에 같은 규칙이 필요한 것(`normalizeUrl`, 가격)은 **양쪽에 같은 이름으로** 두고 같은 표로 테스트한다(공유 패키지가 없는 이 저장소의 기존 방식 — `defaultParentName()` 과 같다).

**`server/utils/shopValidation.js`**

| 함수 | 규칙 |
|---|---|
| `normalizeUrl(raw)` | `null/''` → `null`. trim → 스킴 없고 `도메인.tld/…` 꼴이면 `https://` 접두 → `new URL()` 파싱 실패, `protocol` 이 `http:`/`https:` 가 아니거나 호스트가 없거나 2,000자 초과면 `{ error }`. 성공 시 `URL.href` |
| `validateProductInput(body)` | `title`(trim 1~80), `url`(위), `price`(`null`/`''` → `null`, `"32,000"` 허용 → 정수 0~1e8), `categoryId`(정수 또는 `null`), `isVisible`(불리언, 기본 true) → `{ value }` 또는 `{ errors: { field: message } }` |
| `validateCategoryName(name)` | trim 1~20 |
| `validateShopSettings(body)` | `title` 1~40, `intro`·`notice` 0~300, `isActive` 불리언 |
| `parseStatsRange(days, now)` | `'7'`·`'30'`·`'90'` → `since` ISO, `'all'` → `null`, 그 외 → `'30'` 기본 |
| `isAllowedImage(filename)` | `faqFileTypes.lookupType()` 결과가 `kind === 'image'` 일 때만(png/jpg/jpeg/gif/webp, svg 없음) |

**`server/utils/shopSerializer.js`** — 공개 응답 화이트리스트 (FR-435, 461)

```js
toPublicShop(shop)       → { title, intro, notice }
toPublicCategory(c)      → { id, name }
toPublicProduct(p)       → { id, title, url, imageUrl, price, categoryId }
```

테스트가 `Object.keys()` 를 **정확히** 고정한다 — `shop_products` 에 컬럼이 늘어도 공개 응답으로 새지 않는다(앨범의 `toParentMedia` 와 같은 방식).

**`server/utils/shopStats.js`**

| 함수 | 규칙 |
|---|---|
| `rankProducts(rows)` | 링크 있는 상품 먼저 → 클릭 수 ↓ → 클릭한 방문자 수 ↓ → 타이틀 `localeCompare(_, 'ko')` ↑. `rank` 는 동점이면 같은 순위(1,2,2,4) |
| `sumByCategory(rows, categories)` | 카테고리별 클릭 합계(카테고리 순서대로, 카테고리 없음은 맨 뒤 `{ id: null, name: '카테고리 없음' }`), 0 인 카테고리 포함 |

## 3. REST API

### 3.1 선생님 — `/api/shop` (`verifyToken`, `server.js` 에서 `rejectParents`)

| 메서드 · 경로 | 요청 | 응답 | 비고 |
|---|---|---|---|
| `GET /api/shop` | — | `{ shop: { id, publicId, title, intro, notice, isActive }, categories: [{ id, name, sortOrder, productCount }], storageReady }` | 상점이 없으면 기본 카테고리와 함께 만든다(FR-400, 트랜잭션) |
| `PUT /api/shop` | `{ title, intro, notice, isActive }` | `{ shop }` | `logAction('UPDATE_SHOP')` |
| `GET /api/shop/products` | — | `{ products: [{ id, title, url, price, categoryId, imageUrl, isVisible, sortOrder, clickCount, createdAt, updatedAt }] }` | `clickCount` = 누적 클릭(목록에서 한눈에) |
| `POST /api/shop/products` | `{ title, url?, price?, categoryId?, isVisible? }` | `201 { product }` | 200개 제한(FR-418), `categoryId` 는 내 것만(아니면 400) |
| `PUT /api/shop/products/order` | `{ ids: [3, 1, 2] }` | `{ ok: true }` | 내 상품 id 전부·중복 없음일 때만. **`/:id` 보다 먼저 등록** |
| `PUT /api/shop/products/:id` | `POST` 와 같음 | `{ product }` | 남의 상품 → 404. `isVisible` 을 빼면 **기존 값을 유지**(숨긴 상품이 몰래 다시 공개되지 않게). 등록은 빼면 공개 |
| `PATCH /api/shop/products/:id/visibility` | `{ isVisible }` | `{ product }` | 목록 스위치용 |
| `DELETE /api/shop/products/:id` | — | `{ message, storageDeleted }` | 저장소 이미지 삭제 시도 후 행 삭제(기록 CASCADE) |
| `POST /api/shop/products/:id/image?filename=…` | **raw 바이트**(`express.raw`, ≤ 4MB) | `{ product }` | 형식은 확장자로. 새 파일 업로드 성공 **후** 이전 파일 삭제. 저장소 미설정 503 |
| `DELETE /api/shop/products/:id/image` | — | `{ product }` | |
| `GET /api/shop/categories` | — | `{ categories }` | 상품 수 포함(숨긴 상품도 센다) |
| `POST /api/shop/categories` | `{ name }` | `201 { category }` | 20개 제한, 중복 409 |
| `PUT /api/shop/categories/order` | `{ ids }` | `{ ok: true }` | `/:id` 보다 먼저 |
| `PUT /api/shop/categories/:id` | `{ name }` | `{ category }` | 중복 409 |
| `DELETE /api/shop/categories/:id` | — | `{ message, affectedProducts }` | 상품은 `categoryId=NULL` |
| `GET /api/shop/stats?days=7\|30\|90\|all` | — | §6 참고 | 기본 30 |

### 3.2 공개 — `/api/shop/public/:publicId` (인증 없음)

| 메서드 · 경로 | 응답 | 비고 |
|---|---|---|
| `GET /api/shop/public/:publicId` | `{ shop: { title, intro, notice }, categories: [{ id, name }], products: [{ id, title, url, imageUrl, price, categoryId }] }` | 상점 없음·비공개 → **404** `{ error: '페이지를 찾을 수 없습니다.' }`. 공개 상품만, `sortOrder` 순. 카테고리는 공개 상품이 있는 것만. `Cache-Control: no-store`(숨김이 즉시 반영) |
| `POST /api/shop/public/:publicId/view?visitorKey=…` | `204` | 같은 visitorKey 30분 안 중복은 기록하지 않고 204 |
| `POST /api/shop/public/:publicId/products/:productId/click?visitorKey=…` | `204` / `404` | 그 상점의 **공개 + 링크 있는** 상품만. 10초 안 중복은 기록하지 않고 204 |

기록 요청은 **본문을 쓰지 않는다** — 값은 경로와 쿼리에만 싣는다. `sendBeacon` 으로 JSON 본문을 보내면 `Content-Type` 이 CORS 안전 목록 밖이라 브라우저마다 동작이 갈리고, 쿼리만 쓰면 `visitorKeyGenerator`(이미 `req.query.visitorKey` 를 읽는다)도 그대로 동작한다.

## 4. 공개 응답 예시

```json
{
  "shop": { "title": "이재림 선생님 추천 상품", "intro": "수업에서 쓰는 용품이에요.\n사이즈는 문의 주세요.", "notice": null },
  "categories": [ { "id": 3, "name": "기구" }, { "id": 1, "name": "발레복" } ],
  "products": [
    { "id": 12, "title": "사사키 리본 6m (핑크)", "url": "https://www.coupang.com/vp/products/123", "imageUrl": "https://<ref>.supabase.co/storage/v1/object/public/faq-files/shop/9/5b1…/ribbon.jpg", "price": 32000, "categoryId": 3 },
    { "id": 10, "title": "연습용 반슈즈", "url": null, "imageUrl": null, "price": null, "categoryId": null }
  ]
}
```

## 5. 클릭 기록 방식 — 비콘 vs 리다이렉트

| | **A. 직접 링크 + 비콘 (채택)** | B. 서버 리다이렉트 `/api/shop/go/:id` → 302 |
|---|---|---|
| 이동 속도 | 즉시(상품 사이트로 바로) | 우리 서버를 한 번 거침 — Vercel 콜드스타트면 1~2초 빈 화면 |
| 기록 정확도 | `sendBeacon` 은 페이지 이동·탭 전환 중에도 전송을 보장. 미지원 시 `fetch keepalive` | 서버를 반드시 거치므로 가장 정확 |
| 링크 길게 눌러 복사 | 상품 주소가 복사된다 | 우리 주소가 복사된다 |
| JS 꺼짐 | 기록 안 됨(이동은 됨) | 기록됨 |
| 오픈 리다이렉트 위험 | 없음 | 저장된 주소로만 보내면 없지만 신경 쓸 곳이 하나 늘어난다 |

학부모가 체감하는 이동 속도와 링크 복사 동작을 우선해 **A** 를 쓴다. JS 가 꺼진 브라우저는 이 SPA 자체가 동작하지 않으므로 A 의 약점은 실질적으로 없다.

클라이언트(`client/src/utils/shopTracking.js`):

```js
export const trackClick = (publicId, productId) => {
  const url = `/api/shop/public/${encodeURIComponent(publicId)}/products/${productId}/click`
    + `?visitorKey=${encodeURIComponent(getVisitorKey())}`;
  try {
    if (navigator.sendBeacon?.(url)) return;
  } catch { /* 아래로 */ }
  fetch(url, { method: 'POST', keepalive: true }).catch(() => {});   // 실패해도 이동은 계속
};
```

`visitorKey` 는 공개 채팅이 쓰는 `utils/visitorStorage.js:getVisitorKey()`(localStorage + 쿠키 이중 저장)를 그대로 쓴다 — 같은 브라우저라면 채팅과 상점이 같은 방문자로 묶인다(어느 쪽에도 사람 정보는 없다).

## 6. 통계 쿼리 (FR-450~455)

`$1 = userId`, `$2 = since`(ISO, `'all'` 이면 `NULL`).

```sql
-- 요약 타일 (인덱스 idx_shop_events_user_time 한 번)
SELECT
  COUNT(*)                     FILTER (WHERE type = 'view')  AS views,
  COUNT(DISTINCT "visitorKey") FILTER (WHERE type = 'view')  AS visitors,
  COUNT(*)                     FILTER (WHERE type = 'click') AS clicks,
  COUNT(DISTINCT "visitorKey") FILTER (WHERE type = 'click') AS "clickVisitors"
FROM shop_events
WHERE "userId" = $1 AND ($2::text IS NULL OR "createdAt" >= $2);

-- 상품별 (클릭 0 상품도 나오도록 상품 기준 LEFT JOIN)
SELECT p.id, p.title, p."imageUrl", p."isVisible", p."categoryId",
       (p.url IS NOT NULL) AS "hasUrl",
       COUNT(e.id)                  AS clicks,
       COUNT(DISTINCT e."visitorKey") AS visitors,
       MAX(e."createdAt")           AS "lastClickedAt"
FROM shop_products p
LEFT JOIN shop_events e
  ON e."productId" = p.id AND e.type = 'click'
 AND ($2::text IS NULL OR e."createdAt" >= $2)
WHERE p."userId" = $1
GROUP BY p.id;
```

정렬·순위·카테고리 합계는 `shopStats.js` 순수 함수가 한다(§2). 응답:

```json
{
  "range": "30",
  "since": "2026-09-04T03:00:00.000Z",
  "summary": { "views": 124, "visitors": 41, "clicks": 87, "clickVisitors": 29 },
  "products": [
    { "rank": 1, "id": 12, "title": "사사키 리본 6m (핑크)", "imageUrl": "…", "categoryId": 3, "categoryName": "기구",
      "isVisible": true, "hasUrl": true, "clicks": 31, "visitors": 18, "lastClickedAt": "2026-10-03T11:20:00.000Z" }
  ],
  "categories": [ { "id": 3, "name": "기구", "clicks": 52 }, { "id": null, "name": "카테고리 없음", "clicks": 0 } ]
}
```

중복 방지가 들어간 클릭 기록(경쟁 상황에서 드물게 2건이 들어갈 수 있으나 통계 목적에는 문제없다):

```sql
INSERT INTO shop_events ("userId", "productId", type, "visitorKey", "createdAt")
SELECT $1, $2, 'click', $3, $4
WHERE NOT EXISTS (
  SELECT 1 FROM shop_events
  WHERE "productId" = $2 AND type = 'click' AND "visitorKey" = $3 AND "createdAt" > $5   -- $5 = 지금 - 10초
);
```

## 7. 레이트 리밋 (`server/utils/rateLimits.js`, `server.js`)

| 리미터 | 대상 | 키 | 한도 |
|---|---|---|---|
| `publicShopReadLimiter` | `GET /api/shop/public/*` | `visitorKeyGenerator` (visitorKey, 없으면 IP 서브넷) | 15분 300 |
| `publicShopTrackLimiter` | `POST /api/shop/public/*` | 같음 | 15분 120 |
| `publicShopTrackIpLimiter` | `POST /api/shop/public/*` (위와 **둘 다** 통과) | IP 서브넷 | 15분 600 — visitorKey 는 클라이언트가 보내는 값이라 바꿔 가며 보내면 칸이 새로 생긴다. 같은 와이파이의 학부모 여럿이 써도 넉넉한 값 |
| 기존 `apiLimiter` | `skip` 에 `/api/shop/public` 추가 | — | — |

공개 GET 은 페이지를 열 때 1번이라 300 은 넉넉하다. 한도를 넘긴 기록 요청은 429 를 받지만 클라이언트는 응답을 보지 않으므로 이동에는 영향이 없다.

## 8. 프론트 라우트

| 경로 | 컴포넌트 | 위치 |
|---|---|---|
| `/shop/:publicId` | `pages/PublicShop.jsx` | `App.jsx` 의 **공개 화면 분기**(`/chat/`, `/invite/` 와 같은 곳 — 인증 확인 전에 그린다) |
| `/products` · `/products/stats` · `/products/settings` | `pages/Shop/ShopManager.jsx` (`initialTab`) | 선생님 트리, `ProtectedRoute`. `navLinks` 에 `{ path: '/products', label: '추천 상품', icon: '🛍️' }` 추가 |

## 9. 환경변수

새로 필요한 것 **없음**. 이미지 저장은 기존 `SUPABASE_SECRET_KEY`·`SUPABASE_STORAGE_BUCKET`(기본 `faq-files`)을 쓰고, 경로를 `shop/` 로 나눈다.
키가 없는 환경(로컬 등)에서는 `storageReady:false` → 등록 모달의 이미지 칸이 "이미지 저장소가 설정되지 않았어요" 로 바뀌고, 상품 자체는 등록된다.
