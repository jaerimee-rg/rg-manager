// 추천 상품 — 선생님 API (docs/recommended-shop/02-data-model-api.md §3.1)
// 모든 조회·수정은 토큰의 사용자 id 로 범위를 묶는다. 남의 상품·카테고리는 존재 여부도 알려 주지 않는다(404).
import crypto from 'crypto';
import Shop from '../models/Shop.js';
import ShopCategory from '../models/ShopCategory.js';
import ShopProduct from '../models/ShopProduct.js';
import ShopProductImage from '../models/ShopProductImage.js';
import ShopEvent from '../models/ShopEvent.js';
import { getOrCreateShop } from '../services/shopService.js';
import {
  validateProductInput,
  validateCategoryName,
  validateShopSettings,
  parseStatsRange,
  parseId,
  isAllowedImage,
  isSameIdSet,
  MAX_PRODUCTS,
  MAX_CATEGORIES,
  MAX_PRODUCT_IMAGES
} from '../utils/shopValidation.js';
import { toTeacherShop, toTeacherProduct, toTeacherCategory } from '../utils/shopSerializer.js';
import { rankProducts, sumByCategory, toSummary } from '../utils/shopStats.js';
import { MAX_FILE_BYTES, lookupType, sanitizeFilename, toStorageSafeName } from '../utils/faqFileTypes.js';
import { uploadFile, deleteFile, isStorageConfigured } from '../utils/storage.js';

const serverError = (res, label, error) => {
  console.error(`추천 상품 ${label} 오류:`, error?.message || error);
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
};

const productNotFound = (res) => res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
const categoryNotFound = (res) => res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
const invalid = (res, errors) =>
  res.status(400).json({ error: Object.values(errors)[0], fields: errors });

const UNIQUE_VIOLATION = '23505';
const duplicateCategory = (res) => res.status(409).json({ error: '같은 이름의 카테고리가 있어요.' });

const imageNotFound = (res) => res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

/** 상품(들)에 사진을 붙여 선생님 응답 모양으로 — 목록은 사진을 한 번에 읽는다 */
const withImages = async (products) => {
  const images = await ShopProductImage.listByProducts(products.map((p) => p.id));
  return products.map((p) => toTeacherProduct(p, images.get(p.id) || []));
};
const withImagesOne = async (product) => toTeacherProduct(product, await ShopProductImage.listByProduct(product.id));

// 고른 카테고리가 내 것인지 — 남의 카테고리 id 로 상품을 묶지 못하게 한다
const checkCategory = async (categoryId, userId) =>
  categoryId == null || Boolean(await ShopCategory.getOwned(categoryId, userId));

// ── 상점 ──────────────────────────────────────────────────────────

export const getShop = async (req, res) => {
  try {
    const shop = await getOrCreateShop(req.user.id);
    const categories = await ShopCategory.listByUser(req.user.id);
    res.json({
      shop: toTeacherShop(shop),
      categories: categories.map(toTeacherCategory),
      storageReady: isStorageConfigured()
    });
  } catch (error) {
    return serverError(res, '상점 조회', error);
  }
};

export const updateShop = async (req, res) => {
  try {
    const { value, errors } = validateShopSettings(req.body);
    if (errors) return invalid(res, errors);

    await getOrCreateShop(req.user.id);
    const shop = await Shop.update(req.user.id, value);
    res.json({ shop: toTeacherShop(shop) });
  } catch (error) {
    return serverError(res, '상점 저장', error);
  }
};

// ── 상품 ──────────────────────────────────────────────────────────

export const listProducts = async (req, res) => {
  try {
    const products = await ShopProduct.listByUser(req.user.id);
    res.json({ products: await withImages(products) });
  } catch (error) {
    return serverError(res, '상품 목록', error);
  }
};

export const createProduct = async (req, res) => {
  try {
    const { value, errors } = validateProductInput(req.body);
    if (errors) return invalid(res, errors);

    if ((await ShopProduct.countByUser(req.user.id)) >= MAX_PRODUCTS) {
      return res.status(400).json({ error: `상품은 ${MAX_PRODUCTS}개까지 등록할 수 있어요.` });
    }
    if (!(await checkCategory(value.categoryId, req.user.id))) {
      return invalid(res, { categoryId: '카테고리를 다시 골라 주세요' });
    }

    const product = await ShopProduct.create(req.user.id, {
      ...value,
      description: value.description ?? null,
      isVisible: value.isVisible ?? true
    });
    res.status(201).json({ product: toTeacherProduct(product, []) });
  } catch (error) {
    return serverError(res, '상품 등록', error);
  }
};

export const updateProduct = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return productNotFound(res);

    const { value, errors } = validateProductInput(req.body);
    if (errors) return invalid(res, errors);

    const existing = await ShopProduct.getOwned(id, req.user.id);
    if (!existing) return productNotFound(res);
    if (!(await checkCategory(value.categoryId, req.user.id))) {
      return invalid(res, { categoryId: '카테고리를 다시 골라 주세요' });
    }

    const product = await ShopProduct.update(id, req.user.id, {
      ...value,
      description: value.description === undefined ? existing.description ?? null : value.description,
      isVisible: value.isVisible ?? existing.isVisible !== false
    });
    res.json({ product: await withImagesOne(product) });
  } catch (error) {
    return serverError(res, '상품 수정', error);
  }
};

export const setProductVisibility = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return productNotFound(res);
    if (typeof req.body?.isVisible !== 'boolean') {
      return res.status(400).json({ error: '공개 여부가 올바르지 않아요.' });
    }

    const product = await ShopProduct.setVisibility(id, req.user.id, req.body.isVisible);
    if (!product) return productNotFound(res);
    res.json({ product: await withImagesOne(product) });
  } catch (error) {
    return serverError(res, '공개 변경', error);
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return productNotFound(res);

    // 사진 행은 상품과 함께 지워지므로(FK CASCADE) 저장소 경로를 먼저 읽어 둔다
    const paths = await ShopProductImage.listPathsOwned(id, req.user.id);
    const product = await ShopProduct.delete(id, req.user.id);
    if (!product) return productNotFound(res);

    // 행은 이미 지웠다. 저장소 파일 정리가 실패해도 화면에 유령이 남지 않는다.
    const results = await Promise.all(paths.map((path) => deleteFile(path)));
    res.json({ message: '상품이 삭제되었습니다.', storageDeleted: results.every(Boolean) });
  } catch (error) {
    return serverError(res, '상품 삭제', error);
  }
};

export const reorderProducts = async (req, res) => {
  try {
    const owned = await ShopProduct.listIdsByUser(req.user.id);
    if (!isSameIdSet(req.body?.ids, owned)) {
      return res.status(400).json({ error: '순서를 저장하지 못했어요. 새로고침 후 다시 시도해 주세요.' });
    }
    await ShopProduct.reorder(req.user.id, req.body.ids);
    res.json({ ok: true });
  } catch (error) {
    return serverError(res, '상품 순서', error);
  }
};

/**
 * 상품 사진 — 한 장씩 맨 뒤에 붙인다(상품마다 MAX_PRODUCT_IMAGES 장).
 * 본문은 파일 바이트 그대로(express.raw), 파일명은 쿼리스트링 — FAQ 파일 업로드와 같다.
 * 브라우저가 정사각형으로 잘라 줄인 JPEG 를 보낸다(GIF 는 그대로일 수 있다).
 */
export const addProductImage = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return productNotFound(res);

    const product = await ShopProduct.getOwned(id, req.user.id);
    if (!product) return productNotFound(res);

    if (!isStorageConfigured()) {
      return res.status(503).json({ error: '이미지 저장소가 설정되지 않았습니다. 서버 환경변수를 확인해 주세요.' });
    }

    const filename = sanitizeFilename(req.query.filename || '');
    if (!filename) return res.status(400).json({ error: '파일 이름이 필요합니다.' });
    if (!isAllowedImage(filename)) {
      return res.status(400).json({ error: 'jpg · png · webp · gif 이미지만 올릴 수 있어요.' });
    }

    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: '파일 내용이 비어 있습니다.' });
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({
        error: `이미지가 너무 큽니다. ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있어요.`
      });
    }

    // 이미 찼으면 저장소에 쓰기 전에 거절한다(최종 판단은 아래 append 의 잠금 안에서 한 번 더)
    const full = () => res.status(409).json({ error: `사진은 ${MAX_PRODUCT_IMAGES}장까지 올릴 수 있어요.` });
    if ((await ShopProductImage.countByProduct(id)) >= MAX_PRODUCT_IMAGES) return full();

    const storagePath = `shop/${req.user.id}/${crypto.randomUUID()}/${toStorageSafeName(filename)}`;
    const imageUrl = await uploadFile(storagePath, buffer, lookupType(filename).mime);
    let result;
    try {
      result = await ShopProductImage.append(id, req.user.id, { imagePath: storagePath, imageUrl }, MAX_PRODUCT_IMAGES);
    } catch (error) {
      await deleteFile(storagePath);
      throw error;
    }
    if (result.error) {
      // 올리는 사이에 상품이 지워졌거나 장 수가 찼다 — 방금 올린 파일이 고아가 되지 않게 치운다
      await deleteFile(storagePath);
      return result.error === 'notFound' ? productNotFound(res) : full();
    }

    const updated = await ShopProduct.touch(id, req.user.id);
    if (!updated) {
      // 붙인 직후 상품이 지워졌다 — 사진 행은 함께 지워졌으니 파일만 치운다
      await deleteFile(storagePath);
      return productNotFound(res);
    }
    res.status(201).json({ image: { id: result.image.id, url: result.image.imageUrl }, product: await withImagesOne(updated) });
  } catch (error) {
    return serverError(res, '이미지 업로드', error);
  }
};

export const deleteProductImage = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);
    if (!id) return productNotFound(res);
    if (!imageId) return imageNotFound(res);

    const image = await ShopProductImage.delete(imageId, id, req.user.id);
    if (!image) return imageNotFound(res);

    // 행을 먼저 지웠다 — 저장소 정리가 실패해도 화면에는 남지 않는다
    await deleteFile(image.imagePath);
    const updated = await ShopProduct.touch(id, req.user.id);
    if (!updated) return productNotFound(res);
    res.json({ product: await withImagesOne(updated) });
  } catch (error) {
    return serverError(res, '이미지 삭제', error);
  }
};

/** 사진 순서 — 그 상품의 사진 전부를 한 번씩 담아야 한다. 첫 장이 대표 사진이 된다. */
export const reorderProductImages = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return productNotFound(res);

    const product = await ShopProduct.getOwned(id, req.user.id);
    if (!product) return productNotFound(res);

    const owned = (await ShopProductImage.listByProduct(id)).map((image) => image.id);
    if (!isSameIdSet(req.body?.ids, owned)) {
      return res.status(400).json({ error: '사진 순서를 저장하지 못했어요. 새로고침 후 다시 시도해 주세요.' });
    }

    await ShopProductImage.reorder(id, req.body.ids);
    const updated = await ShopProduct.touch(id, req.user.id);
    res.json({ product: await withImagesOne(updated) });
  } catch (error) {
    return serverError(res, '사진 순서', error);
  }
};

// ── 카테고리 ──────────────────────────────────────────────────────

export const listCategories = async (req, res) => {
  try {
    const categories = await ShopCategory.listByUser(req.user.id);
    res.json({ categories: categories.map(toTeacherCategory) });
  } catch (error) {
    return serverError(res, '카테고리 목록', error);
  }
};

export const createCategory = async (req, res) => {
  try {
    const { value, error } = validateCategoryName(req.body?.name);
    if (error) return res.status(400).json({ error });

    if ((await ShopCategory.countByUser(req.user.id)) >= MAX_CATEGORIES) {
      return res.status(400).json({ error: `카테고리는 ${MAX_CATEGORIES}개까지 만들 수 있어요.` });
    }

    const category = await ShopCategory.create(req.user.id, value);
    res.status(201).json({ category: toTeacherCategory(category) });
  } catch (error) {
    if (error?.code === UNIQUE_VIOLATION) return duplicateCategory(res);
    return serverError(res, '카테고리 추가', error);
  }
};

export const renameCategory = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return categoryNotFound(res);

    const { value, error } = validateCategoryName(req.body?.name);
    if (error) return res.status(400).json({ error });

    const category = await ShopCategory.rename(id, req.user.id, value);
    if (!category) return categoryNotFound(res);
    res.json({ category: toTeacherCategory(category) });
  } catch (error) {
    if (error?.code === UNIQUE_VIOLATION) return duplicateCategory(res);
    return serverError(res, '카테고리 이름 변경', error);
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return categoryNotFound(res);

    const result = await ShopCategory.delete(id, req.user.id);
    if (!result) return categoryNotFound(res);
    res.json({ message: '카테고리가 삭제되었습니다.', affectedProducts: result.affectedProducts });
  } catch (error) {
    return serverError(res, '카테고리 삭제', error);
  }
};

export const reorderCategories = async (req, res) => {
  try {
    const owned = await ShopCategory.listIdsByUser(req.user.id);
    if (!isSameIdSet(req.body?.ids, owned)) {
      return res.status(400).json({ error: '순서를 저장하지 못했어요. 새로고침 후 다시 시도해 주세요.' });
    }
    await ShopCategory.reorder(req.user.id, req.body.ids);
    res.json({ ok: true });
  } catch (error) {
    return serverError(res, '카테고리 순서', error);
  }
};

// ── 통계 ──────────────────────────────────────────────────────────

export const getStats = async (req, res) => {
  try {
    const { range, since } = parseStatsRange(req.query.days);
    const [summaryRow, productRows, categories] = await Promise.all([
      ShopEvent.summary(req.user.id, since),
      ShopEvent.productStats(req.user.id, since),
      ShopCategory.listByUser(req.user.id)
    ]);

    res.json({
      range,
      since,
      summary: toSummary(summaryRow),
      products: rankProducts(productRows, categories),
      categories: sumByCategory(productRows, categories)
    });
  } catch (error) {
    return serverError(res, '통계', error);
  }
};
