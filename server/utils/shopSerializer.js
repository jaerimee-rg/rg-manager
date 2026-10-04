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

export const toPublicProduct = (product) => ({
  id: product.id,
  title: product.title,
  url: product.url ?? null,
  imageUrl: product.imageUrl ?? null,
  price: product.price ?? null,
  categoryId: product.categoryId ?? null
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

/** 선생님 화면용 상품 — 저장소 경로(imagePath)는 서버에만 둔다 */
export const toTeacherProduct = (product) => ({
  id: product.id,
  title: product.title,
  url: product.url ?? null,
  price: product.price ?? null,
  categoryId: product.categoryId ?? null,
  imageUrl: product.imageUrl ?? null,
  isVisible: product.isVisible !== false,
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
