// 공개 상점 응답 화이트리스트 (FR-435 · 461).
// 로그인 없이 누구나 받는 응답이라 필요한 필드만 골라 담는다 — shop_products 에 컬럼이 늘어도
// 여기에 적지 않으면 나가지 않는다. 테스트가 필드 목록을 고정한다.

export const toPublicShop = (shop) => ({
  title: shop.title,
  intro: shop.intro ?? null,
  notice: shop.notice ?? null
});

export const toPublicCategory = (category) => ({
  id: category.id,
  name: category.name
});

/** images: 그 상품의 사진 행(순서대로). 공개 응답에는 주소만 — 저장소 경로·id 는 나가지 않는다 */
export const toPublicProduct = (product, images = []) => ({
  id: product.id,
  title: product.title,
  description: product.description ?? null,
  url: product.url ?? null,
  images: images.map((image) => image.imageUrl),
  price: product.price ?? null,
  categoryId: product.categoryId ?? null,
  isReservable: product.isReservable === true
});

/** 선생님 화면용 상점 — 공개 링크(publicId)를 포함한다 */
export const toTeacherShop = (shop) => ({
  id: shop.id,
  publicId: shop.publicId,
  title: shop.title,
  intro: shop.intro ?? null,
  notice: shop.notice ?? null,
  isActive: shop.isActive !== false
});

export const toTeacherImage = (image) => ({ id: image.id, url: image.imageUrl });

/**
 * 선생님 화면용 상품 — 저장소 경로(imagePath)는 서버에만 둔다.
 * imageUrl 은 대표 사진(첫 장) — 목록·통계 썸네일용.
 */
export const toTeacherProduct = (product, images = []) => ({
  id: product.id,
  title: product.title,
  description: product.description ?? null,
  url: product.url ?? null,
  price: product.price ?? null,
  categoryId: product.categoryId ?? null,
  imageUrl: images[0]?.imageUrl ?? null,
  images: images.map(toTeacherImage),
  isVisible: product.isVisible !== false,
  isReservable: product.isReservable === true,
  sortOrder: product.sortOrder ?? 0,
  clickCount: Number(product.clickCount ?? 0),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt
});

export const toTeacherCategory = (category) => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sortOrder ?? 0,
  productCount: Number(category.productCount ?? 0)
});

/**
 * 선생님 화면용 예약 — 학부모가 남긴 이름·전화번호는 상점 주인에게만 간다.
 * 공개 응답에는 이 함수를 쓰지 않는다(toPublicReservation).
 */
export const toTeacherReservation = (reservation) => ({
  id: reservation.id,
  productId: reservation.productId ?? null,
  productTitle: reservation.productTitle,
  imageUrl: reservation.imageUrl ?? null,
  name: reservation.name,
  phone: reservation.phone,
  reservedDate: reservation.reservedDate,
  status: reservation.status,
  createdAt: reservation.createdAt,
  updatedAt: reservation.updatedAt
});

/** 학부모에게 돌려주는 예약 확인 — 날짜와 상태만 (이름·전화번호는 되돌려 보내지 않는다) */
export const toPublicReservation = (reservation) => ({
  reservedDate: reservation.reservedDate,
  status: reservation.status
});
