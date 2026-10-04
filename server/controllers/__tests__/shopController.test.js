import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Shop.js', () => ({
  default: { getByUserId: jest.fn(), update: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopCategory.js', () => ({
  default: {
    listByUser: jest.fn(),
    getOwned: jest.fn(),
    countByUser: jest.fn(),
    create: jest.fn(),
    rename: jest.fn(),
    delete: jest.fn(),
    listIdsByUser: jest.fn(),
    reorder: jest.fn()
  }
}));
jest.unstable_mockModule('../../models/ShopProduct.js', () => ({
  default: {
    listByUser: jest.fn(),
    getOwned: jest.fn(),
    countByUser: jest.fn(),
    listIdsByUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setVisibility: jest.fn(),
    touch: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn()
  }
}));
jest.unstable_mockModule('../../models/ShopProductImage.js', () => ({
  default: {
    listByProducts: jest.fn(),
    listByProduct: jest.fn(),
    listPathsOwned: jest.fn(),
    countByProduct: jest.fn(),
    append: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn()
  }
}));
jest.unstable_mockModule('../../models/ShopEvent.js', () => ({
  default: { summary: jest.fn(), productStats: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopReservation.js', () => ({
  default: { listByUser: jest.fn(), countRequested: jest.fn(), setStatus: jest.fn() }
}));
jest.unstable_mockModule('../../services/shopService.js', () => ({
  getOrCreateShop: jest.fn()
}));
jest.unstable_mockModule('../../utils/storage.js', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  downloadFile: jest.fn(),
  isStorageConfigured: jest.fn(() => true),
  buildPublicUrl: jest.fn(),
  getStorageConfig: jest.fn()
}));

const Shop = (await import('../../models/Shop.js')).default;
const ShopCategory = (await import('../../models/ShopCategory.js')).default;
const ShopProduct = (await import('../../models/ShopProduct.js')).default;
const ShopProductImage = (await import('../../models/ShopProductImage.js')).default;
const ShopEvent = (await import('../../models/ShopEvent.js')).default;
const ShopReservation = (await import('../../models/ShopReservation.js')).default;
const { getOrCreateShop } = await import('../../services/shopService.js');
const { uploadFile, deleteFile, isStorageConfigured } = await import('../../utils/storage.js');
const ctrl = await import('../shopController.js');

const TEACHER = { id: 9, username: '이재림', role: 'user' };

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
};

const call = async (handler, { params = {}, body = {}, query = {}, user = TEACHER } = {}) => {
  const res = mockRes();
  await handler({ params, body, query, user }, res);
  return res;
};

const SHOP = { id: 1, userId: 9, publicId: 'pub123', title: '이재림 선생님 추천 상품', intro: null, notice: null, isActive: true };
const PRODUCT = { id: 12, userId: 9, title: '리본', description: null, url: 'https://coupang.com/x', price: 32000, categoryId: 3, imagePath: null, imageUrl: null, isVisible: true, sortOrder: 0, clickCount: 4 };
const IMAGE = (id, sortOrder = 0) => ({
  id, productId: 12, userId: 9, imagePath: `shop/9/u${id}/p.jpg`, imageUrl: `https://cdn/shop/9/u${id}/p.jpg`, sortOrder
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  isStorageConfigured.mockReturnValue(true);
  getOrCreateShop.mockResolvedValue(SHOP);
  ShopProductImage.listByProducts.mockResolvedValue(new Map());
  ShopProductImage.listByProduct.mockResolvedValue([]);
  ShopProductImage.listPathsOwned.mockResolvedValue([]);
  ShopReservation.countRequested.mockResolvedValue(0);
});

describe('GET /api/shop — 첫 진입에 상점을 만든다 (FR-400)', () => {
  it('상점·카테고리·저장소 상태·처리 전 예약 수를 돌려준다', async () => {
    ShopCategory.listByUser.mockResolvedValue([{ id: 1, name: '발레복', sortOrder: 0, productCount: '2' }]);
    ShopReservation.countRequested.mockResolvedValue(3);

    const res = await call(ctrl.getShop);

    expect(getOrCreateShop).toHaveBeenCalledWith(9);
    expect(ShopReservation.countRequested).toHaveBeenCalledWith(9);
    expect(res.json).toHaveBeenCalledWith({
      shop: { id: 1, publicId: 'pub123', title: '이재림 선생님 추천 상품', intro: null, notice: null, isActive: true },
      categories: [{ id: 1, name: '발레복', sortOrder: 0, productCount: 2 }],
      storageReady: true,
      requestedReservations: 3
    });
  });
});

describe('PUT /api/shop', () => {
  it('이름이 비면 400', async () => {
    const res = await call(ctrl.updateShop, { body: { title: '  ' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Shop.update).not.toHaveBeenCalled();
  });

  it('정리한 값으로 저장한다', async () => {
    Shop.update.mockResolvedValue({ ...SHOP, isActive: false });
    const res = await call(ctrl.updateShop, { body: { title: ' 추천 ', intro: '', notice: '고지', isActive: false } });
    expect(Shop.update).toHaveBeenCalledWith(9, { title: '추천', intro: null, notice: '고지', isActive: false });
    expect(res.json.mock.calls[0][0].shop.isActive).toBe(false);
  });
});

describe('POST /api/shop/products — 필수는 타이틀뿐 (FR-411)', () => {
  beforeEach(() => {
    ShopProduct.countByUser.mockResolvedValue(0);
    ShopCategory.getOwned.mockResolvedValue({ id: 3 });
  });

  it('타이틀만으로 등록된다', async () => {
    ShopProduct.create.mockResolvedValue({ ...PRODUCT, url: null, price: null, categoryId: null, clickCount: 0 });

    const res = await call(ctrl.createProduct, { body: { title: '곤봉' } });

    expect(ShopProduct.create).toHaveBeenCalledWith(9, {
      title: '곤봉', description: null, url: null, price: null, categoryId: null, isVisible: true, isReservable: false
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].product).not.toHaveProperty('imagePath');
    expect(res.json.mock.calls[0][0].product.images).toEqual([]);
  });

  it('상세 설명은 줄바꿈을 지켜 저장하고, 1000자를 넘으면 400', async () => {
    ShopProduct.create.mockResolvedValue({ ...PRODUCT, description: '6m 리본\n막대 포함' });
    await call(ctrl.createProduct, { body: { title: '리본', description: '  6m 리본\r\n막대 포함  ' } });
    expect(ShopProduct.create.mock.calls[0][1].description).toBe('6m 리본\n막대 포함');

    const res = await call(ctrl.createProduct, { body: { title: '리본', description: 'a'.repeat(1001) } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].fields).toHaveProperty('description');
  });

  it('타이틀이 없으면 400 + 필드 오류', async () => {
    const res = await call(ctrl.createProduct, { body: { title: '', url: 'https://a.com' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: '타이틀을 입력해 주세요', fields: { title: '타이틀을 입력해 주세요' } });
    expect(ShopProduct.create).not.toHaveBeenCalled();
  });

  it('javascript: 주소는 저장하지 않는다', async () => {
    const res = await call(ctrl.createProduct, { body: { title: '리본', url: 'javascript:alert(1)' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].fields).toHaveProperty('url');
  });

  it('남의 카테고리로는 묶을 수 없다', async () => {
    ShopCategory.getOwned.mockResolvedValue(null);
    const res = await call(ctrl.createProduct, { body: { title: '리본', categoryId: 77 } });
    expect(ShopCategory.getOwned).toHaveBeenCalledWith(77, 9);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ShopProduct.create).not.toHaveBeenCalled();
  });

  it('예약 받기를 켜서 등록할 수 있고, 불리언이 아니면 400', async () => {
    ShopProduct.create.mockResolvedValue({ ...PRODUCT, isReservable: true });
    const res = await call(ctrl.createProduct, { body: { title: '레오타드', isReservable: true } });
    expect(ShopProduct.create.mock.calls[0][1].isReservable).toBe(true);
    expect(res.json.mock.calls[0][0].product.isReservable).toBe(true);

    const bad = await call(ctrl.createProduct, { body: { title: '레오타드', isReservable: 'yes' } });
    expect(bad.status).toHaveBeenCalledWith(400);
    expect(bad.json.mock.calls[0][0].fields).toHaveProperty('isReservable');
  });

  it('200개를 넘기면 400 (FR-418)', async () => {
    ShopProduct.countByUser.mockResolvedValue(200);
    const res = await call(ctrl.createProduct, { body: { title: '리본' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/200개/);
  });
});

describe('상품 수정·숨김·삭제 — 남의 상품은 404 (FR-460)', () => {
  it('수정: 내 상품이 아니면 404', async () => {
    ShopProduct.getOwned.mockResolvedValue(null);
    const res = await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본' } });
    expect(ShopProduct.getOwned).toHaveBeenCalledWith(12, 9);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(ShopProduct.update).not.toHaveBeenCalled();
  });

  it('수정: 숫자가 아닌 id 도 404', async () => {
    const res = await call(ctrl.updateProduct, { params: { id: 'abc' }, body: { title: '리본' } });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('수정: 정리한 값으로 저장하고 누적 클릭을 그대로 돌려준다', async () => {
    ShopProduct.getOwned.mockResolvedValue(PRODUCT);
    ShopCategory.getOwned.mockResolvedValue({ id: 3 });
    ShopProduct.update.mockResolvedValue({ ...PRODUCT, price: 30000 });
    const res = await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본', price: '30,000', categoryId: 3 } });
    expect(ShopProduct.update).toHaveBeenCalledWith(12, 9, expect.objectContaining({ price: 30000, categoryId: 3 }));
    expect(res.json.mock.calls[0][0].product.clickCount).toBe(4);
  });

  it('수정: 사진을 순서대로 붙여 돌려준다 — 첫 장이 대표(imageUrl)', async () => {
    ShopProduct.getOwned.mockResolvedValue(PRODUCT);
    ShopProduct.update.mockResolvedValue(PRODUCT);
    ShopProductImage.listByProduct.mockResolvedValue([IMAGE(5, 0), IMAGE(3, 1)]);
    const res = await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본' } });
    const { product } = res.json.mock.calls[0][0];
    expect(product.images).toEqual([
      { id: 5, url: 'https://cdn/shop/9/u5/p.jpg' },
      { id: 3, url: 'https://cdn/shop/9/u3/p.jpg' }
    ]);
    expect(product.imageUrl).toBe('https://cdn/shop/9/u5/p.jpg');
  });

  it('수정: description 을 빼고 보내면 기존 설명을 지킨다 (설명 칸이 없던 화면)', async () => {
    ShopProduct.getOwned.mockResolvedValue({ ...PRODUCT, description: '기존 설명' });
    ShopProduct.update.mockResolvedValue(PRODUCT);
    await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본' } });
    expect(ShopProduct.update.mock.calls[0][2].description).toBe('기존 설명');

    await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본', description: '' } });
    expect(ShopProduct.update.mock.calls[1][2].description).toBeNull();
  });

  it('수정: isVisible 을 빼고 보내면 숨긴 상품은 숨긴 채로 둔다', async () => {
    ShopProduct.getOwned.mockResolvedValue({ ...PRODUCT, isVisible: false });
    ShopProduct.update.mockResolvedValue({ ...PRODUCT, isVisible: false });
    await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본' } });
    expect(ShopProduct.update.mock.calls[0][2].isVisible).toBe(false);
  });

  it('수정: isReservable 을 빼고 보내면 예약 받기를 그대로 두고, 주면 바꾼다', async () => {
    ShopProduct.getOwned.mockResolvedValue({ ...PRODUCT, isReservable: true });
    ShopProduct.update.mockResolvedValue({ ...PRODUCT, isReservable: true });
    await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본' } });
    expect(ShopProduct.update.mock.calls[0][2].isReservable).toBe(true);

    await call(ctrl.updateProduct, { params: { id: '12' }, body: { title: '리본', isReservable: false } });
    expect(ShopProduct.update.mock.calls[1][2].isReservable).toBe(false);
  });

  it('숨김: 불리언이 아니면 400, 남의 상품이면 404', async () => {
    let res = await call(ctrl.setProductVisibility, { params: { id: '12' }, body: { isVisible: 'no' } });
    expect(res.status).toHaveBeenCalledWith(400);

    ShopProduct.setVisibility.mockResolvedValue(null);
    res = await call(ctrl.setProductVisibility, { params: { id: '12' }, body: { isVisible: false } });
    expect(ShopProduct.setVisibility).toHaveBeenCalledWith(12, 9, false);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('삭제: 사진 파일을 모두 저장소에서도 지운다 (경로는 행이 지워지기 전에 읽는다)', async () => {
    ShopProductImage.listPathsOwned.mockResolvedValue(['shop/9/a/1.jpg', 'shop/9/b/2.jpg']);
    ShopProduct.delete.mockResolvedValue(PRODUCT);
    deleteFile.mockResolvedValue(true);
    const res = await call(ctrl.deleteProduct, { params: { id: '12' } });
    expect(ShopProductImage.listPathsOwned).toHaveBeenCalledWith(12, 9);
    expect(ShopProductImage.listPathsOwned.mock.invocationCallOrder[0]).toBeLessThan(ShopProduct.delete.mock.invocationCallOrder[0]);
    expect(deleteFile.mock.calls.map((c) => c[0])).toEqual(['shop/9/a/1.jpg', 'shop/9/b/2.jpg']);
    expect(res.json).toHaveBeenCalledWith({ message: '상품이 삭제되었습니다.', storageDeleted: true });
  });

  it('삭제: 남의 상품이면 404', async () => {
    ShopProduct.delete.mockResolvedValue(null);
    const res = await call(ctrl.deleteProduct, { params: { id: '12' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe('PUT /api/shop/products/order', () => {
  beforeEach(() => ShopProduct.listIdsByUser.mockResolvedValue([1, 2, 3]));

  it('내 상품 전부를 한 번씩 담으면 저장', async () => {
    const res = await call(ctrl.reorderProducts, { body: { ids: [3, 1, 2] } });
    expect(ShopProduct.reorder).toHaveBeenCalledWith(9, [3, 1, 2]);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('남의 id 가 섞이면 400', async () => {
    const res = await call(ctrl.reorderProducts, { body: { ids: [3, 1, 99] } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ShopProduct.reorder).not.toHaveBeenCalled();
  });
});

describe('POST /api/shop/products/:id/images — 사진 한 장씩 맨 뒤에', () => {
  const upload = (overrides = {}) =>
    call(ctrl.addProductImage, {
      params: { id: '12' },
      query: { filename: '리본.jpg' },
      body: Buffer.from('jpeg-bytes'),
      ...overrides
    });

  beforeEach(() => {
    ShopProduct.getOwned.mockResolvedValue(PRODUCT);
    ShopProduct.touch.mockResolvedValue(PRODUCT);
    uploadFile.mockResolvedValue('https://cdn/shop/9/u/file.jpg');
    ShopProductImage.countByProduct.mockResolvedValue(2);
    ShopProductImage.append.mockImplementation(async (productId, userId, v) => ({ image: { id: 31, productId, userId, ...v } }));
  });

  it('올리면 shop/{선생님}/{난수}/ 경로에 확장자 기준 MIME 으로 저장하고, 10장 제한으로 붙인다', async () => {
    ShopProductImage.listByProduct.mockResolvedValue([IMAGE(30, 0), { ...IMAGE(31, 1), imageUrl: 'https://cdn/shop/9/u/file.jpg' }]);
    const res = await upload();
    const [path, buffer, mime] = uploadFile.mock.calls[0];
    expect(path).toMatch(/^shop\/9\/[0-9a-f-]{36}\/file\.jpg$/);
    expect(buffer.toString()).toBe('jpeg-bytes');
    expect(mime).toBe('image/jpeg');
    expect(ShopProductImage.append).toHaveBeenCalledWith(12, 9, { imagePath: path, imageUrl: 'https://cdn/shop/9/u/file.jpg' }, 10);
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.image).toEqual({ id: 31, url: 'https://cdn/shop/9/u/file.jpg' });
    expect(body.product.images.map((i) => i.id)).toEqual([30, 31]);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('10장이 찼으면 올린 파일을 치우고 409', async () => {
    ShopProductImage.append.mockResolvedValue({ error: 'full' });
    const res = await upload();
    expect(deleteFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0]);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toMatch(/10장/);
  });

  it('이미 10장이면 저장소에 쓰기 전에 409', async () => {
    ShopProductImage.countByProduct.mockResolvedValue(10);
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('올리는 사이에 상품이 지워졌으면 올린 파일을 치우고 404', async () => {
    ShopProductImage.append.mockResolvedValue({ error: 'notFound' });
    const res = await upload();
    expect(deleteFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('사진 행을 넣다가 DB 오류가 나도 올린 파일을 치운다 (500)', async () => {
    ShopProductImage.append.mockRejectedValue(new Error('db down'));
    const res = await upload();
    expect(deleteFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0]);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('붙인 직후 상품이 지워졌으면 파일을 치우고 404', async () => {
    ShopProduct.touch.mockResolvedValue(null);
    const res = await upload();
    expect(deleteFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('svg 는 거절 (스크립트를 품을 수 있다)', async () => {
    const res = await upload({ query: { filename: 'logo.svg' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('4MB 를 넘으면 413', async () => {
    const res = await upload({ body: Buffer.alloc(4 * 1024 * 1024 + 1) });
    expect(res.status).toHaveBeenCalledWith(413);
  });

  it('빈 파일은 400', async () => {
    const res = await upload({ body: Buffer.alloc(0) });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('저장소가 설정되지 않았으면 503', async () => {
    isStorageConfigured.mockReturnValue(false);
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('남의 상품이면 404 (저장소 설정보다 먼저 본다)', async () => {
    ShopProduct.getOwned.mockResolvedValue(null);
    isStorageConfigured.mockReturnValue(false);
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe('사진 빼기 · 순서', () => {
  beforeEach(() => {
    ShopProduct.getOwned.mockResolvedValue(PRODUCT);
    ShopProduct.touch.mockResolvedValue(PRODUCT);
  });

  it('빼기: 내 상품의 그 사진 행을 지우고 저장소 파일도 지운다', async () => {
    ShopProductImage.delete.mockResolvedValue(IMAGE(5));
    const res = await call(ctrl.deleteProductImage, { params: { id: '12', imageId: '5' } });
    expect(ShopProductImage.delete).toHaveBeenCalledWith(5, 12, 9);
    expect(deleteFile).toHaveBeenCalledWith('shop/9/u5/p.jpg');
    expect(res.json.mock.calls[0][0].product.id).toBe(12);
  });

  it('빼기: 남의 상품·없는 사진이면 404 이고 저장소는 건드리지 않는다', async () => {
    ShopProductImage.delete.mockResolvedValue(null);
    const res = await call(ctrl.deleteProductImage, { params: { id: '12', imageId: '5' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('순서: 그 상품 사진 전부를 한 번씩 담으면 저장, 대표 사진이 바뀐다', async () => {
    ShopProductImage.listByProduct
      .mockResolvedValueOnce([IMAGE(5, 0), IMAGE(6, 1), IMAGE(7, 2)])
      .mockResolvedValueOnce([IMAGE(7, 0), IMAGE(5, 1), IMAGE(6, 2)]);
    const res = await call(ctrl.reorderProductImages, { params: { id: '12' }, body: { ids: [7, 5, 6] } });
    expect(ShopProductImage.reorder).toHaveBeenCalledWith(12, [7, 5, 6]);
    expect(res.json.mock.calls[0][0].product.imageUrl).toBe('https://cdn/shop/9/u7/p.jpg');
  });

  it('순서: 다른 상품의 사진이 섞이거나 빠지면 400', async () => {
    ShopProductImage.listByProduct.mockResolvedValue([IMAGE(5, 0), IMAGE(6, 1)]);
    let res = await call(ctrl.reorderProductImages, { params: { id: '12' }, body: { ids: [6, 99] } });
    expect(res.status).toHaveBeenCalledWith(400);
    res = await call(ctrl.reorderProductImages, { params: { id: '12' }, body: { ids: [6] } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ShopProductImage.reorder).not.toHaveBeenCalled();
  });

  it('순서: 남의 상품이면 404', async () => {
    ShopProduct.getOwned.mockResolvedValue(null);
    const res = await call(ctrl.reorderProductImages, { params: { id: '12' }, body: { ids: [] } });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('카테고리 (FR-421 · 422)', () => {
  it('추가: 같은 이름이면 409', async () => {
    ShopCategory.countByUser.mockResolvedValue(5);
    ShopCategory.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await call(ctrl.createCategory, { body: { name: '기구' } });
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('추가: 20개를 넘기면 400', async () => {
    ShopCategory.countByUser.mockResolvedValue(20);
    const res = await call(ctrl.createCategory, { body: { name: '수구' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ShopCategory.create).not.toHaveBeenCalled();
  });

  it('추가: 이름을 정리해서 만든다', async () => {
    ShopCategory.countByUser.mockResolvedValue(5);
    ShopCategory.create.mockResolvedValue({ id: 6, name: '수구', sortOrder: 5, productCount: 0 });
    const res = await call(ctrl.createCategory, { body: { name: ' 수구 ' } });
    expect(ShopCategory.create).toHaveBeenCalledWith(9, '수구');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('이름 변경: 남의 카테고리면 404', async () => {
    ShopCategory.rename.mockResolvedValue(null);
    const res = await call(ctrl.renameCategory, { params: { id: '3' }, body: { name: '수구' } });
    expect(ShopCategory.rename).toHaveBeenCalledWith(3, 9, '수구');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('삭제: 카테고리 없음이 된 상품 수를 알려 준다', async () => {
    ShopCategory.delete.mockResolvedValue({ affectedProducts: 4 });
    const res = await call(ctrl.deleteCategory, { params: { id: '3' } });
    expect(res.json).toHaveBeenCalledWith({ message: '카테고리가 삭제되었습니다.', affectedProducts: 4 });
  });
});

describe('GET /api/shop/stats', () => {
  it('기간을 해석해 요약·순위·카테고리 합계를 만든다', async () => {
    ShopEvent.summary.mockResolvedValue({ views: '10', visitors: '4', clicks: '6', clickVisitors: '3' });
    ShopEvent.productStats.mockResolvedValue([
      { id: 1, title: '리본', hasUrl: true, clicks: '4', visitors: '2', categoryId: 3, isVisible: true },
      { id: 2, title: '후프', hasUrl: true, clicks: '2', visitors: '1', categoryId: null, isVisible: true }
    ]);
    ShopCategory.listByUser.mockResolvedValue([{ id: 3, name: '기구' }]);

    const res = await call(ctrl.getStats, { query: { days: '7' } });
    const body = res.json.mock.calls[0][0];

    expect(body.range).toBe('7');
    expect(ShopEvent.summary.mock.calls[0][1]).toBe(body.since);
    expect(body.summary).toEqual({ views: 10, visitors: 4, clicks: 6, clickVisitors: 3 });
    expect(body.products.map((p) => [p.title, p.rank, p.categoryName])).toEqual([['리본', 1, '기구'], ['후프', 2, '카테고리 없음']]);
    expect(body.categories).toEqual([{ id: 3, name: '기구', clicks: 4 }, { id: null, name: '카테고리 없음', clicks: 2 }]);
  });

  it('전체 기간은 since 없이 센다', async () => {
    ShopEvent.summary.mockResolvedValue({});
    ShopEvent.productStats.mockResolvedValue([]);
    ShopCategory.listByUser.mockResolvedValue([]);
    await call(ctrl.getStats, { query: { days: 'all' } });
    expect(ShopEvent.summary).toHaveBeenCalledWith(9, null);
  });
});

describe('예약 (05-reservations.md) — 선생님 화면', () => {
  const ROW = {
    id: 3, userId: 9, productId: 12, productTitle: '리본', imageUrl: null,
    name: '김예림', phone: '010-1234-5678', reservedDate: '2026-10-10', status: 'requested',
    createdAt: '2026-10-04T01:00:00.000Z', updatedAt: '2026-10-04T01:00:00.000Z'
  };

  it('목록: 내 예약만 읽어 선생님 모양으로 (선생님 id 는 빠진다)', async () => {
    ShopReservation.listByUser.mockResolvedValue([ROW]);
    const res = await call(ctrl.listReservations);
    expect(ShopReservation.listByUser).toHaveBeenCalledWith(9);
    const [item] = res.json.mock.calls[0][0].reservations;
    expect(item).toMatchObject({ id: 3, name: '김예림', phone: '010-1234-5678', status: 'requested' });
    expect(item).not.toHaveProperty('userId');
  });

  it('상태 변경: 요청 · 확정 · 취소 어느 쪽으로든 바꾼다', async () => {
    for (const status of ['confirmed', 'cancelled', 'requested']) {
      ShopReservation.setStatus.mockResolvedValueOnce({ ...ROW, status });
      const res = await call(ctrl.setReservationStatus, { params: { id: '3' }, body: { status } });
      expect(ShopReservation.setStatus).toHaveBeenLastCalledWith(3, 9, status);
      expect(res.json.mock.calls[0][0].reservation.status).toBe(status);
    }
  });

  it('상태 변경: 모르는 상태는 400 (저장하지 않는다)', async () => {
    const res = await call(ctrl.setReservationStatus, { params: { id: '3' }, body: { status: 'done' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(ShopReservation.setStatus).not.toHaveBeenCalled();
  });

  it('상태 변경: 남의 예약·이상한 id 는 404', async () => {
    ShopReservation.setStatus.mockResolvedValue(null);
    let res = await call(ctrl.setReservationStatus, { params: { id: '3' }, body: { status: 'confirmed' } });
    expect(res.status).toHaveBeenCalledWith(404);

    res = await call(ctrl.setReservationStatus, { params: { id: 'x' }, body: { status: 'confirmed' } });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('DB 오류는 500', async () => {
    ShopReservation.listByUser.mockRejectedValue(new Error('boom'));
    const res = await call(ctrl.listReservations);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
