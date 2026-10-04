// 추천 상품 — 공개 API (로그인 없음). docs/recommended-shop/02-data-model-api.md §3.2
// 상점이 없거나 비공개면 같은 404 — 어느 쪽인지 알려 주지 않는다(FR-403).
import Shop from '../models/Shop.js';
import ShopCategory from '../models/ShopCategory.js';
import ShopProduct from '../models/ShopProduct.js';
import ShopEvent from '../models/ShopEvent.js';
import { parseId, normalizeVisitorKey } from '../utils/shopValidation.js';
import { toPublicShop, toPublicCategory, toPublicProduct } from '../utils/shopSerializer.js';

const notFound = (res) => res.status(404).json({ error: '페이지를 찾을 수 없습니다.' });

const activeShop = async (publicId) => {
  const shop = await Shop.getByPublicId(String(publicId || ''));
  return shop && shop.isActive ? shop : null;
};

export const getPublicShop = async (req, res) => {
  try {
    const shop = await activeShop(req.params.publicId);
    if (!shop) return notFound(res);

    const [products, categories] = await Promise.all([
      ShopProduct.listPublic(shop.userId),
      ShopCategory.listByUser(shop.userId)
    ]);

    // 칩은 공개 상품이 있는 카테고리만 (FR-431)
    const used = new Set(products.map((p) => p.categoryId).filter((id) => id != null));

    // 숨기기가 바로 반영돼야 하므로 캐시하지 않는다
    res.set('Cache-Control', 'no-store');
    res.json({
      shop: toPublicShop(shop),
      categories: categories.filter((c) => used.has(c.id)).map(toPublicCategory),
      products: products.map(toPublicProduct)
    });
  } catch (error) {
    console.error('공개 상점 조회 오류:', error?.message || error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 방문 기록 — 값은 쿼리스트링에만 싣는다(sendBeacon 은 본문 없이 보낸다) */
export const recordView = async (req, res) => {
  try {
    const shop = await activeShop(req.params.publicId);
    if (!shop) return notFound(res);

    await ShopEvent.recordView(shop.userId, normalizeVisitorKey(req.query.visitorKey));
    res.status(204).end();
  } catch (error) {
    console.error('공개 상점 방문 기록 오류:', error?.message || error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 클릭 기록 — 그 상점의 공개 상품이고 링크가 있을 때만 센다(FR-441) */
export const recordClick = async (req, res) => {
  try {
    const shop = await activeShop(req.params.publicId);
    if (!shop) return notFound(res);

    const productId = parseId(req.params.productId);
    const product = productId ? await ShopProduct.getClickable(productId, shop.userId) : null;
    if (!product) return notFound(res);

    await ShopEvent.recordClick(shop.userId, productId, normalizeVisitorKey(req.query.visitorKey));
    res.status(204).end();
  } catch (error) {
    console.error('공개 상점 클릭 기록 오류:', error?.message || error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
