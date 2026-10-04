import express from 'express';
import {
  getShop,
  updateShop,
  listProducts,
  createProduct,
  updateProduct,
  setProductVisibility,
  deleteProduct,
  reorderProducts,
  uploadProductImage,
  deleteProductImage,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
  getStats
} from '../controllers/shopController.js';
import { getPublicShop, recordView, recordClick } from '../controllers/publicShopController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';
import { MAX_FILE_BYTES } from '../utils/faqFileTypes.js';

const router = express.Router();

// 이미지는 파일 바이트 그대로 받는다. 형식·크기 안내는 컨트롤러가 한다(여기 한도는 마지막 방어선).
const rawBody = express.raw({ type: () => true, limit: MAX_FILE_BYTES + 1024 });

// 공개 (인증 없음) — 학부모가 링크로 연다. server.js 가 학부모 차단에서도 뺀다.
router.get('/public/:publicId', getPublicShop);
router.post('/public/:publicId/view', recordView);
router.post('/public/:publicId/products/:productId/click', recordClick);

// 선생님
router.get('/', verifyToken, getShop);
router.put('/', verifyToken, logAction('UPDATE_SHOP'), updateShop);
router.get('/stats', verifyToken, getStats);

// 리터럴 경로(/order)를 :id 보다 먼저 둔다
router.get('/products', verifyToken, listProducts);
router.post('/products', verifyToken, logAction('CREATE_SHOP_PRODUCT'), createProduct);
router.put('/products/order', verifyToken, reorderProducts);
router.put('/products/:id', verifyToken, logAction('UPDATE_SHOP_PRODUCT'), updateProduct);
router.patch('/products/:id/visibility', verifyToken, logAction('UPDATE_SHOP_PRODUCT'), setProductVisibility);
router.delete('/products/:id', verifyToken, logAction('DELETE_SHOP_PRODUCT'), deleteProduct);
router.post('/products/:id/image', verifyToken, rawBody, logAction('UPLOAD_SHOP_IMAGE'), uploadProductImage);
router.delete('/products/:id/image', verifyToken, deleteProductImage);

router.get('/categories', verifyToken, listCategories);
router.post('/categories', verifyToken, logAction('CREATE_SHOP_CATEGORY'), createCategory);
router.put('/categories/order', verifyToken, reorderCategories);
router.put('/categories/:id', verifyToken, logAction('UPDATE_SHOP_CATEGORY'), renameCategory);
router.delete('/categories/:id', verifyToken, logAction('DELETE_SHOP_CATEGORY'), deleteCategory);

export default router;
