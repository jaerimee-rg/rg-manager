# 선생님 추천 상품 (공개 상점) — 구현 계획

> 상태: **구현 완료 — 2026-10-04** (브랜치 `feat/recommended-shop`) · 관련: [01-requirements.md](./01-requirements.md), [02-data-model-api.md](./02-data-model-api.md), 목업([선생님](./mockups/teacher-desktop.html) · [학부모](./mockups/parent-desktop.html)) ·
> 기준 브랜치: `feat/recommended-shop` (base `main`)

## 0. 한 줄 요약

목업(`mockups/` — 선생님·학부모 × 데스크톱·모바일)대로 만든다. 목업은 앱의 실제 CSS 와 컴포넌트 DOM 으로 그렸고, 새 스타일은 `ui.css` 의 "추천 상품" 블록에 있다. 서버에 테이블 4개(`shops`·`shop_categories`·`shop_products`·`shop_events`)와
`/api/shop`(선생님) · `/api/shop/public/:publicId`(비로그인) 를 추가하고, 클라이언트에 선생님 **추천 상품** 메뉴(`/products`, 상품·통계·설정 탭)와
공개 페이지 **`/shop/:publicId`** 를 붙인다. 공개 링크·방문자 키·레이트 리밋은 FAQ 공개 채팅의 것을, 이미지 업로드는 FAQ 파일의 것을 그대로 재사용한다.

## 1. 이번에 구현하는 것 / 하지 않는 것

### 1.1 구현

| 영역 | 내용 | FR |
|---|---|---|
| 상점 | 자동 생성(기본 카테고리 포함), 이름·소개·안내문·공개 설정, 공개 링크 복사·미리 보기 | FR-400~404 |
| 상품 | 등록·수정·삭제(타이틀만 필수), 주소 정규화·검증, 이미지 업로드·교체·삭제, 가격, 숨김, 순서 변경, 검색·필터 | FR-410~428 |
| 카테고리 | 추가·이름 변경·삭제(상품은 미분류로)·순서 변경 | FR-420~422 |
| 공개 상점 | 비로그인 화면, 카테고리 칩(`?c=`), 카드 그리드, 빈·오류·비공개 상태 | FR-430~436 |
| 기록 | 방문(세션 1회 + 서버 30분)·클릭(비콘, 10초 중복 제거) | FR-440~445 |
| 통계 | 기간 선택, 요약 타일 4개, 상품별 순위 표, 카테고리별 막대 | FR-450~455 |
| 안전 | 소유자 범위, 공개 화이트리스트, URL 이중 검사, 확장자 기준 이미지, 공개 경로 레이트 리밋 | FR-460~466 |

### 1.2 하지 않는 것

01 §3.2 그대로 — 결제·장바구니, 학부모 포털 탭(Q-2), 카카오 링크 미리보기(Q-5), 상품 설명·다중 이미지, 링크 점검, 관리자 통계.

## 2. 기존 코드 영향

### 2.1 수정하는 기존 파일

| 파일 | 변경 | 무회귀 근거 |
|---|---|---|
| `server/database.js` | `initDatabase()` 끝에 테이블 4개 + 인덱스 5개(02 §1) | 전부 `IF NOT EXISTS`. 기존 테이블 정의·순서 불변. `users` 를 참조하므로 `users` 생성 **뒤**에 둔다 |
| `server/server.js` | ① `shopRoutes` import ② `apiLimiter.skip` 에 `/api/shop/public` 추가 ③ 공개 상점 리미터 2개 등록 ④ `app.use('/api/shop', 공개면 통과·아니면 rejectParents, shopRoutes)` — `/api/chat` 등록과 같은 모양 | 줄 추가뿐. 기존 등록 순서·리미터 값 불변. `skip` 조건은 OR 로 늘리기만 한다 |
| `server/utils/rateLimits.js` | `PUBLIC_SHOP_READ_MAX = 300`, `PUBLIC_SHOP_TRACK_MAX = 120` | 상수 추가만. 기존 테스트가 기존 값을 그대로 고정 |
| `server/middleware/logger.js` | `saveLog` 에 `*_SHOP*` 액션 상세 문구(`상품: {title}` 등) | `else if` 추가만. 알 수 없는 액션은 기존 기본 문구 |
| `client/src/App.jsx` | ① 공개 화면 분기에 `isShopPage = pathname.startsWith('/shop/')` + `<Route path="/shop/:publicId">` ② `navLinks` 에 `추천 상품` ③ 선생님 라우트 `/products`, `/products/stats`, `/products/settings` | 공개 분기 조건을 OR 로 늘리기만 한다. 선생님 경로는 `/products` 라 `/shop/` 판별과 겹치지 않는다(01 §7) |

### 2.2 새로 만드는 파일

**서버**

```
server/utils/shopValidation.js        (순수) normalizeUrl, validateProductInput, validateCategoryName,
                                       validateShopSettings, parseStatsRange, isAllowedImage
server/utils/shopSerializer.js        (순수) toPublicShop, toPublicCategory, toPublicProduct — 화이트리스트
server/utils/shopStats.js             (순수) rankProducts, sumByCategory
server/models/Shop.js                 getByUserId, getByPublicId, create(ON CONFLICT DO NOTHING), update
server/models/ShopCategory.js         listByUser(+productCount), create, rename, delete, reorder, seedDefaults
server/models/ShopProduct.js          listByUser(+clickCount), listPublic, getOwned, create, update,
                                       setVisibility, setImage, delete, reorder, countByUser
server/models/ShopEvent.js            recordView(30분 중복 제거), recordClick(10초 중복 제거),
                                       summary, productStats
server/services/shopService.js        getOrCreateShop (상점 + 기본 카테고리를 한 트랜잭션으로)
server/controllers/shopController.js        선생님 API
server/controllers/publicShopController.js  공개 API (조회·방문·클릭)
server/routes/shop.js                 공개 라우트 먼저, 그다음 verifyToken 라우트. 리터럴(/order)을 /:id 보다 먼저
```

**클라이언트**

```
client/src/utils/shopFormat.js        (순수) formatPrice, parsePriceInput, normalizeUrl(서버와 같은 표),
                                       hostnameOf, visibleCategories, filterByCategory
client/src/utils/shopTracking.js      trackClick, trackViewOnce — sendBeacon → fetch keepalive
client/src/utils/imageResize.js       resizeForUpload(file, 1200) → Blob(JPEG 0.85, 흰 배경) | 원본
                                       (imagePrep.makePreview 의 캔버스 로직을 재사용)
client/src/pages/PublicShop.jsx       공개 상점 (헤더·칩·그리드·상태 화면)
client/src/pages/Shop/ShopManager.jsx       탭 컨테이너 + 공개 링크 카드
client/src/pages/Shop/ProductList.jsx       상품 탭 (DataTable, 순서, 공개 스위치, 검색·필터)
client/src/pages/Shop/ProductFormModal.jsx  등록·수정 모달 (이미지 미리보기·빼기)
client/src/pages/Shop/ShopStats.jsx         통계 탭 (기간 Segmented, Stat 4개, 순위 표, 카테고리 막대)
client/src/pages/Shop/ShopSettings.jsx      설정 탭 (상점 정보 + 카테고리 관리)
client/src/components/shop/ProductCard.jsx  공개 상점 카드 (선생님 미리보기 썸네일에도 사용)
```

## 3. 구현 순서 (단계별 커밋)

각 단계는 그 단계의 테스트까지 통과시킨 뒤 커밋한다.

| 단계 | 내용 | 끝났다는 기준 |
|---|---|---|
| **S1** 스키마 · 순수 함수 | `database.js` DDL, `shopValidation`·`shopSerializer`·`shopStats` + 단위 테스트 | 로컬 Postgres 에서 서버 부팅 → `\d shop_*` 확인, 순수 함수 표 테스트 통과 |
| **S2** 모델 · 서비스 | 모델 4개, `getOrCreateShop`(트랜잭션) | 모델 테스트(풀 목) 통과 |
| **S3** 선생님 API | `shopController` + `routes/shop.js` + `server.js` 등록 + 로그 문구 | 컨트롤러 테스트: 소유자 범위 404, 검증 400, 200개 제한, 이미지 형식·크기·교체 시 이전 파일 삭제, 학부모 403 |
| **S4** 공개 API · 기록 | `publicShopController`, 리미터, 중복 제거 | 비공개·없는 상점 404, 숨김·링크 없음 상품 클릭 404, 화이트리스트 키 고정, 중복 제거 |
| **S5** 선생님 화면 | `ShopManager`·`ProductList`·`ProductFormModal`·`ShopSettings`, nav·라우트 | 컴포넌트 테스트 + 로컬에서 등록→수정→숨김→순서→삭제 확인 |
| **S6** 공개 화면 · 추적 | `PublicShop`·`ProductCard`·`shopTracking`, 공개 분기 | 로그아웃 상태에서 열림, 칩·`?c=`, 카드 클릭 시 비콘 1회, 모바일 360px |
| **S7** 통계 화면 · e2e | `ShopStats`, `e2e/shop.spec.mjs` | 클릭이 통계 순위에 반영되는 e2e 통과, 전체 스위트 통과 |

## 4. 테스트 계획

### 4.1 서버 단위 (Jest, `cd server && npm test`)

| 파일 | 다루는 것 |
|---|---|
| `utils/__tests__/shopValidation.test.js` | `normalizeUrl` 표(스킴 없음·`http`·`javascript:`·`data:`·`mailto:`·공백·2,001자·한글 도메인), 타이틀 경계(0·1·80·81자, 공백만), 가격(`''`·`"32,000"`·`-1`·`1e8+1`·소수), 기간 파싱 |
| `utils/__tests__/shopSerializer.test.js` | 공개 객체의 `Object.keys()` 를 정확히 고정, `imagePath`·`userId`·`isVisible` 미포함 |
| `utils/__tests__/shopStats.test.js` | 동점 순위(1,2,2,4), 링크 없음 맨 뒤, 클릭 0 포함, 카테고리 없음 버킷 |
| `controllers/__tests__/shopController.test.js` | 첫 진입 시 상점·기본 카테고리 생성, 남의 상품·카테고리 404, 남의 `categoryId` 로 등록 400, 순서 변경에 남의 id 섞이면 400, 이미지 svg 400·4MB 초과 413·저장소 미설정 503·교체 시 이전 파일 삭제, 카테고리 삭제 시 `affectedProducts` |
| `controllers/__tests__/publicShopController.test.js` | 비공개·없음 404(같은 본문), 숨김 상품 제외·카테고리 필터링, 클릭: 남의 상점 상품·숨김·링크 없음 404, 정상 204 |
| `utils/__tests__/rateLimits.test.js` (기존 확장) | 새 상수 값 |
| `middleware/__tests__/logger.test.js` (기존 확장) | 새 액션의 상세 문구 |

학부모 차단(`/api/shop` 403)과 공개 경로 통과는 `server.js` 등록 지점에서 일어나 단위 테스트로는 닿지 않으므로 e2e(§4.3 의 7)에서 확인한다.

### 4.2 클라이언트 단위 (Jest + RTL, `cd client && npm test`)

| 파일 | 다루는 것 |
|---|---|
| `utils/__tests__/shopFormat.test.js` | 서버와 **같은 표**로 `normalizeUrl`, `formatPrice`(`0원`, `1,234,000원`, `null` → 빈 값), `hostnameOf`(`www.` 제거), 칩 목록 계산 |
| `utils/__tests__/shopTracking.test.js` | `sendBeacon` 성공 시 fetch 안 함, `false`·미지원 시 `fetch keepalive` 1회, 예외가 밖으로 새지 않음, `trackViewOnce` 세션당 1회 |
| `pages/__tests__/PublicShop.test.js` | 카드 렌더(가격·도메인·이미지 없음), 링크 카드 `target=_blank`·`rel=noopener noreferrer`, 링크 없는 카드는 `<a>` 아님, 칩 → `?c=` 반영, 404 → 비공개 안내, 클릭 시 `trackClick` 호출 |
| `pages/Shop/__tests__/ProductFormModal.test.js` | 타이틀 비우면 저장 안 됨·필드 오류, `javascript:` 거절, 가격 콤마 입력, 이미지 업로드 실패해도 상품 저장 안내 |
| `pages/Shop/__tests__/ShopStats.test.js` | 기간 변경 시 `?days=` 재조회, 빈 상태 문구, 숨김 배지 |

### 4.3 e2e (Playwright, `client/e2e/shop.spec.mjs`)

로컬 Postgres + 빌드된 앱(CLAUDE.md *Running the e2e suite* 절차, `JWT_SECRET=local-dev-secret`, 레이트 리밋 상향).

1. 선생님: `/products` → [상품 등록] → **타이틀만** 저장 → 목록에 보임
2. 선생님: 두 번째 상품 — 주소·카테고리(기구)·가격 입력, 이미지는 저장소 미설정 환경이면 안내 문구 확인
3. **새 브라우저 컨텍스트(세션 없음)** 로 공개 링크 → 두 상품 보임, "기구" 칩 → 하나만, 새로고침해도 유지
4. 링크 카드 클릭 → 새 탭 열림(`context.waitForEvent('page')`) → 선생님 통계 탭에서 그 상품 클릭 1
5. 선생님이 상품 숨김 → 공개 페이지 새로고침 시 사라짐, 통계에는 "숨김"
6. 공개 OFF → 공개 링크 "지금은 볼 수 없는 페이지예요"
7. 학부모 세션으로 `/api/shop` 403 (API 레벨)

### 4.4 실행 중인 앱에서 확인

로컬 서버 + 클라이언트를 띄워 데스크톱·모바일(360px) 폭에서 목업과 비교: 공개 상점 그리드 2/3/4열, 등록 모달(모바일 바텀시트), 통계 표의 모바일 카드 모양.
가능하면 실제 휴대폰 카카오톡 인앱 브라우저에서 공개 링크를 한 번 열어 본다(로그인 화면으로 튕기지 않는지).

## 5. 배포 체크리스트 — **머지 전에 DDL 먼저**

`initDatabase()` 는 fire-and-forget 이라 Vercel 에서 DDL 이 실행되지 않은 채 새 코드만 뜰 수 있다(2026-08-30 PR #7 에서 실제로 prod 가 500).
이번 변경은 **새 테이블만** 만들고 기존 쿼리는 새 테이블을 읽지 않으므로 앱 전체가 죽지는 않지만, 추천 상품 화면은 테이블이 없으면 500 이다. 그래서:

1. **머지 전**: 02 §1 의 DDL 을 prod(Supabase)에 그대로 실행 → `ALTER TABLE shops, shop_categories, shop_products, shop_events OWNER TO rg_app` (각각) →
   `REVOKE ALL … FROM anon, authenticated, service_role`(테이블·시퀀스 — SQL 에디터/MCP 는 `postgres` 로 돌아 Supabase 기본 권한이 붙는다) → `\d shop_*` 로 확인.
   **2026-10-04 적용 완료** (MCP `recommended_shop_tables`, `recommended_shop_revoke_public_api_grants`).
   테이블이 먼저 생겨도 옛 코드는 읽지 않으므로 안전하다.
2. PR: `cd server && npm test`, `cd client && npm test`, e2e 통과 결과를 본문에 첨부.
3. 머지(= prod 배포) 후: `GET /api/shop/public/<없는id>` → 404 JSON, 선생님 계정으로 `/products` 진입 → 상점 생성 확인, 공개 링크를 시크릿 창으로 열기, 카드 클릭 → 통계 반영.
4. 테스트로 만든 상품·기록은 지운다(선생님 12번 테스트 계정을 쓰면 실제 상점과 섞이지 않는다).

## 6. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| 클릭 부풀림(연타·봇·새로고침) | 통계 왜곡 | 10초 중복 제거, 방문 30분 중복 제거, visitor 기준 레이트 리밋, **고유 방문자 수**를 함께 보여 줘 판단 근거를 준다 |
| 선생님 본인 미리 보기 클릭 집계 | 소규모일 때 왜곡 | 통계 화면에 안내(FR-445). 필요하면 미리 보기 링크에 `?preview=1` → 기록 생략(Q-6) |
| 제휴 링크 고지 누락 | 공정위 지침 위반 소지 | 하단 안내문 입력란과 예시 문구 제공(Q-4) |
| 상품 페이지가 사라짐(링크 깨짐) | 학부모 불편 | 선생님이 수정·숨김. 자동 점검은 범위 밖 |
| `sendBeacon` 미지원·차단 | 클릭 누락 | `fetch keepalive` 대체. 그래도 실패하면 이동만 된다(기록보다 이동 우선) |
| 저장소 이미지 고아 파일 | 저장 공간 | 교체·상품 삭제 시 지운다. 선생님 계정 삭제 시에는 남는다(FAQ 파일과 같은 기존 한계, 경로가 난수라 노출 위험 없음) |
| 카카오톡 미리보기가 앱 기본 제목으로 뜸 | 링크 신뢰도 | 2차(Q-5) |
| 공개 링크 유출 | 의도된 공개 페이지라 영향 작음 | 공개 OFF 로 즉시 차단. 링크 재발급은 필요해지면 추가 |

## 7. 구현 결과 (2026-10-04)

계획대로 S1~S7 을 마쳤다. 계획과 달라진 점·확인한 것만 적는다.

| 항목 | 내용 |
|---|---|
| 상품 검색 | `koreanSearch` 의 혼합 초성 매칭은 "리본" 이 "발레복"(ㅂㄹㅂ)에도 걸려 상품 목록에는 너무 넓었다. `shopFormat.matchProductTitle` — 글자 포함, 또는 **초성만 친 경우** 초성 포함 — 으로 좁혔다 |
| 이미지 축소 | GIF 는 움직임이 사라지지 않게 그대로 보낸다. 다시 인코딩한 결과가 원본보다 크면 원본을 보낸다 |
| 카테고리 목록 API | 설정 탭 새로고침용으로 `GET /api/shop/categories` 를 더했다(02 §3.1 반영) |
| 코드 리뷰 반영 | ① 기록 경로에 IP 기준 상한 추가(visitorKey 를 바꿔 가며 한도를 피하지 못하게) ② 수정에서 `isVisible` 을 빼면 기존 값 유지 ③ 가운데 버튼(auxclick)으로 새 탭에 열어도 클릭으로 셈 ④ 사진을 올리는 사이 상품이 지워지면 올린 파일을 치우고 404 ⑤ 통계 기간을 바꾸면 이전 기간 숫자를 지우고 다시 읽음 ⑥ `coupang.com:8080/x` 처럼 포트가 붙은 주소를 스킴으로 오인하던 것 수정. 동시에 들어온 같은 방문자의 두 비콘이 둘 다 기록될 수 있는 것(`INSERT … WHERE NOT EXISTS` 가 원자적이지 않음)은 통계 용도라 그대로 둔다 |
| 테스트 | 서버 51 스위트 · 1022 테스트, 클라이언트 57 스위트 · 705 테스트 모두 통과. e2e 는 `shop` 프로젝트 5개 추가 — 전체 70개 중 69개 통과 |
| e2e 실패 1건 (이번 변경과 무관) | `teacher.spec.mjs` "이벤트 수정 화면에는 사진·영상 섹션이 없다" — `setup.mjs` 의 픽스처 대회 날짜가 `2026-09-12` 로 고정돼 있어 2026-09-13 부터 이벤트 목록 기본 화면(다가오는 일정)에서 사라진다. 변경 전 코드에서도 같은 화면이 "지난 일정 2건" 으로 숨겨져 있음을 확인했다 |
| 실제 DB 확인 | 로컬 Postgres 에 새 스키마를 만들고 모든 엔드포인트를 호출해 확인 — 403(학부모)·404(남의 상품)·중복 클릭 무시·비공개 404·카테고리 삭제 시 상품 유지·409(같은 이름) |
| 확인하지 못한 것 | **이미지 업로드의 실제 Supabase 저장** — 로컬에 `SUPABASE_SECRET_KEY` 가 없어 503 안내까지만 확인했다(단위 테스트는 경로·MIME·교체 순서를 검증). 배포 후 실제 사진 한 장으로 확인할 것 |

