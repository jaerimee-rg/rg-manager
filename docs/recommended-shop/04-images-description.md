# 2차 — 사진 여러 장 · 자르기 · 상세 설명 · 상품 상세

> 상태: **구현 완료 — 2026-10-04** (목업: [mockups/images-desktop.html](./mockups/images-desktop.html) · [images-mobile.html](./mockups/images-mobile.html))

## 1. 요청 (2026-10-04)

> 각 상품마다 여러개의 이미지를 등록할 수 있게 해주고, 이미지 순서도 바꿀 수 있게 해줘. 그리고 제품 클릭하면 카로젤로 이미지 전환
> 가능하게 하고, 데스크탑에서는 메인 이미지와 다른 이미지는 작게 아래에 보여지도록 해줘. 그리고 다른 이미지 클릭하면 해당 이미지를
> 메인 이미지칸에 보여지도록 해줘.

> 제품 등록할때 상세 설명 입력할 수 있게 해주고, 제품 제목 밑에 상세 설명이 보이게 수정해줘.

> 현재 상점에서 사진 사이즈에 따라서 상점에서 카드 사이즈 및 가격 및 다른 섹션 위치가 동일하게 안보이는데, 이미지 사이즈는 고정해서
> crop해서 보이도록 해줘. 이미지 등록시에 크롭되는 이미지를 미리보기 형태에서 수정할 수 있도록 해줘.

(사진 붙여 넣기 — "이미지가 clipboard에 있을때 paste하면 이미지에 자동으로 추가" — 도 같은 묶음으로 들어갔다.)

## 2. 정한 것

| 항목 | 결정 | 이유 |
|---|---|---|
| 사진 수 | 상품마다 **최대 10장**, 첫 장이 **대표 사진**(목록 카드·선생님 표·통계 썸네일) | 상품 페이지에 충분하고, 저장소·화면 부담이 작다 |
| 순서 | 사진 아래 **‹ ›** (모든 기기), 데스크톱은 **끌어다 놓기**도 | 휴대폰에서는 끌기보다 버튼이 확실하다 |
| 카드 누르기 | 쇼핑몰로 바로 가지 않고 **상품 상세**(주소 `?p=<id>`) | 사진·설명을 보고 나서 쇼핑몰로 간다. 뒤로 가기로 닫히고, 주소를 보내면 상세가 바로 열린다 |
| 클릭 통계 | **쇼핑몰 버튼을 누른 것만** 센다 — 상세를 연 것은 세지 않는다 | "어떤 상품 링크가 많이 클릭됐는지" 의 뜻을 그대로. 상세 열람을 세려면 `shop_events.type` 을 늘려야 한다(DB 변경) |
| 상세(모바일) | 바텀시트, 사진은 **밀어서**(스크롤 스냅) 넘기고 **점**과 `1 / 4` | 작은 사진 줄은 휴대폰에서 공간만 차지한다 |
| 상세 닫기(모바일) | 시트를 **아래로 끌어내리면** 닫힌다(본문이 맨 위일 때). 140px 넘게 내리거나 빠르게 튕기면 닫히고, 덜 내리면 제자리 | 휴대폰 바텀시트의 익숙한 동작. 옆으로 밀기(사진 넘기기)·위로 스크롤은 그대로 둔다 |
| 상세(데스크톱) | 넓은 모달, 왼쪽 **큰 사진 + 아래 작은 사진**(누르면 큰 칸에), ‹ › · ←/→ 키 | 요청 그대로 |
| 누를 수 없는 카드 | **사진도 링크도 없는** 상품만 | 상세에서 더 볼 것이 없다. 링크가 없어도 사진이 있으면 상세가 열린다 |
| 상세 설명 | 선택, **1,000자**, 줄바꿈 유지, **글자로만**(링크·서식 없음). 카드에는 제목 아래 2줄 미리보기, 상세에는 제목 바로 아래 전체 | 요청 그대로. 글자로만 그려서 XSS 걱정이 없다 |
| 카드 줄 맞춤 | 사진 칸은 크기와 상관없이 **정사각형**(사진은 잘려 보임), 가격·도메인은 **카드 맨 아래** | 원인은 `aspect-ratio` 칸 안의 세로로 긴 사진이 칸을 밀어내던 것(세로 사진 하나로 카드가 247px → 1,318px). 사진을 절대 위치로 바꿔 칸이 사진에 밀리지 않게 했다 |
| 자르기 | 새로 넣은 사진마다 **[자르기]** — 정사각형 칸에서 끌어서 위치, 막대(1~3배)로 확대. **브라우저가 그 범위를 정사각형 JPEG(최대 1,200px)로 잘라 올린다** | 카드·상세가 모두 정사각형이라 보이는 그대로 저장하는 편이 단순하다(자르기 값을 DB 에 두고 화면마다 다시 계산할 필요가 없다) |
| 이미 올린 사진 | 다시 자르지 않는다 — 빼고 새로 넣는다 | 원본을 남기지 않으므로. 1차 때 올린 정사각형이 아닌 사진은 가운데가 보인다 |
| GIF | 자르기를 바꾸지 않으면 원본 그대로(움직임 유지), 바꾸면 정지 JPEG | 캔버스는 GIF 를 그리지 못한다 |
| 붙여 넣기 | 창 어디서든 ⌘V/Ctrl+V → **맨 뒤에 추가**. 글자 칸에 글자+사진이 함께 오면(엑셀 셀 등) 글자가 먼저 | 1차의 "사진 바꾸기"에서 바뀜 |

## 3. 데이터

```sql
ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS shop_product_images (
  id SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "imagePath" TEXT NOT NULL,     -- 저장소 경로 shop/{userId}/{uuid}/{ascii}, 서버에만
  "imageUrl" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,  -- 0 이 대표
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_product_images_product ON shop_product_images ("productId", "sortOrder", id);
```

**1차 사진 옮기기** — `shop_products."imagePath"/"imageUrl"` 에 있던 사진을 사진 표로 옮기고 옛 칸을 비운다.
옮기기와 비우기를 **한 문장**(`WITH legacy AS (UPDATE … RETURNING prev.…) INSERT …`)으로 해서, 몇 번을 돌아도 겹치지 않고
나중에 그 사진을 지워도 되살아나지 않는다. 바깥 `WHERE` 에도 `"imagePath" IS NOT NULL` 을 둬서 두 인스턴스가 동시에 부팅해도
뒤 문장이 행 잠금을 기다린 뒤 이미 비워진 행을 건너뛴다. 배포 사이에 1차 화면이 옛 칸에 새 사진을 써도 다음 부팅에 맨 뒤로 옮겨진다.
옛 칸(`imagePath`, `imageUrl`)은 남겨 두지만 2차 코드는 읽지도 쓰지도 않는다.

## 4. API

| 메서드 | 경로 | 내용 |
|---|---|---|
| POST · PUT | `/api/shop/products[/:id]` | 본문에 `description`(선택). **PUT 에서 빼면 기존 설명을 지킨다**(`isVisible` 과 같은 규칙) |
| GET | `/api/shop/products` | 상품마다 `images: [{id, url}]`(순서대로), `imageUrl`(대표), `description` |
| POST | `/api/shop/products/:id/images?filename=` | 파일 바이트(raw) 한 장을 **맨 뒤에** 붙인다 → `201 { image, product }`. 10장이면 **409**(올린 파일은 치운다). 상품 행을 잠가 동시에 올려도 넘지 않는다 |
| PUT | `/api/shop/products/:id/images/order` | `{ ids }` — 그 상품 사진 **전부를 한 번씩**. 빠지거나 섞이면 400 |
| DELETE | `/api/shop/products/:id/images/:imageId` | 행을 지우고 저장소 파일도 지운다. 남의 상품·사진은 404 |
| DELETE | `/api/shop/products/:id` | 사진 경로를 먼저 읽고 상품을 지운 뒤(행은 CASCADE) 파일을 모두 지운다 |
| GET | `/api/shop/public/:publicId` | 상품: `id · title · description · url · images(주소 배열) · price · categoryId` — 저장소 경로·사진 id 는 나가지 않는다(화이트리스트 테스트) |

옛 `POST/DELETE /api/shop/products/:id/image`(한 장)는 없앴다.

## 5. 저장 흐름 (상품 폼)

1. 상품 정보 저장(POST/PUT) — 실패하면 여기서 멈춘다.
2. 목록에서 뺀 사진을 지운다(DELETE).
3. 새 사진을 **한 장씩** 정사각형으로 잘라(`utils/imageCrop.js:cropToSquare`) 올린다 — Vercel 요청 4.5MB 한도. 버튼에 `사진 올리는 중 2/3`, 칸마다 기다리는 중 · 올리는 중 · 올리지 못함.
4. 서버는 새 사진을 맨 뒤에 붙이므로, 선생님이 정한 순서와 다르면 `PUT …/images/order`.
5. 사진 하나가 실패해도 상품과 나머지는 저장되고, 닫은 뒤 토스트로 알린다(1차 FR-414 원칙).

자르기는 같은 창에서 화면만 바꾼다(`사진 자르기` → [취소]/[적용], Esc 는 자르기만 취소) — 창 위에 창을 띄우면 Esc 한 번에 둘 다 닫히기 때문이다.

## 6. 파일

- 서버: `models/ShopProductImage.js`(새), `controllers/shopController.js`, `controllers/publicShopController.js`, `utils/shopSerializer.js`, `utils/shopValidation.js`(`parseDescription`, `MAX_PRODUCT_IMAGES`), `models/ShopEvent.js`(통계 썸네일 = 대표 사진), `routes/shop.js`, `middleware/logger.js`(`DELETE_SHOP_IMAGE`), `database.js`
- 클라이언트: `utils/productImages.js` · `utils/imageCrop.js`(새, 순수 함수), `pages/Shop/ProductImagesField.jsx` · `ImageCropper.jsx`(새), `ProductFormModal.jsx`, `components/shop/ProductGallery.jsx` · `ProductDetail.jsx`(새), `ProductCard.jsx`, `pages/PublicShop.jsx`, `components/ui/Modal.jsx`(`header={false}`), `Icon.jsx`(`crop`), `styles/ui.css`
- e2e: `client/e2e/fake-storage.mjs`(새 — 가짜 Supabase Storage), `client/e2e/shop.spec.mjs`

## 7. 테스트

- 단위: 자르기 계산(원본 밖으로 나가지 않음 · 끌기 방향 · 확대), 사진 목록 규칙(10장 · 형식 · 순서 · 저장 계획), 설명 규칙(서버·클라이언트 같은 표), 컨트롤러(사진 추가·409·404·순서·삭제·상품 삭제 시 파일), 공개 화이트리스트, 폼(여러 장·순서·끌기·빼기·자르기·실패·붙여 넣기), 공개 상점(카드→상세·작은 사진·키·닫기), 캐러셀.
- e2e(가짜 저장소로 **진짜 업로드**): 여러 장 고르기 + 붙여 넣기 + 끌어서 자르기 + 순서 → 서버에 정사각형으로, 정한 순서·색으로 올라갔는지 픽셀까지 확인 / 세로로 긴 사진이 있어도 카드 사진 칸·가격 줄이 맞는지 / 데스크톱 상세(작은 사진·←) / 휴대폰 상세(밀어 넘기기·점·뒤로 가기).
- 로컬 DB 에서 1차 사진 옮기기 SQL 을 두 번 돌려 겹치지 않는 것, 옮긴 뒤 옛 칸에 다시 쓴 사진이 맨 뒤로 가는 것을 확인했다.

## 8. 배포

머지 **전에** 운영 DB 에 §3 의 DDL 과 옮기기 문장을 넣는다(`server/database.js` 와 같은 문장). 그다음
`ALTER TABLE shop_product_images OWNER TO rg_app` 과 `REVOKE ALL ON TABLE shop_product_images, shop_product_images_id_seq FROM anon, authenticated, service_role`
(MCP·SQL 편집기는 `postgres` 로 돌아 공개 API 권한이 붙는다 — CLAUDE.md *Deployment*). 머지 뒤 운영에서 사진 한 장을 실제로 올려 본다.

**되돌릴 때(1차 코드로 롤백)** — 옮기기 문장이 옛 칸을 비웠으므로 1차 화면에는 사진이 안 보인다. 사진 표는 그대로이니
대표 사진만 옛 칸에 다시 채운다(2차를 다시 올리면 부팅 때 이 값이 맨 뒤 사진으로 한 번 더 옮겨지므로, 다시 올리기 전에 옛 칸을 비울 것):

```sql
UPDATE shop_products p
SET "imagePath" = i."imagePath", "imageUrl" = i."imageUrl"
FROM (
  SELECT DISTINCT ON ("productId") "productId", "imagePath", "imageUrl"
  FROM shop_product_images
  ORDER BY "productId", "sortOrder", id
) i
WHERE p.id = i."productId";
```
