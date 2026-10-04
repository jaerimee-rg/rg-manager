import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Shop.js', () => ({
  default: { getByPublicId: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopCategory.js', () => ({
  default: { listByUser: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopProduct.js', () => ({
  default: { listPublic: jest.fn(), getClickable: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopEvent.js', () => ({
  default: { recordView: jest.fn(), recordClick: jest.fn() }
}));

const Shop = (await import('../../models/Shop.js')).default;
const ShopCategory = (await import('../../models/ShopCategory.js')).default;
const ShopProduct = (await import('../../models/ShopProduct.js')).default;
const ShopEvent = (await import('../../models/ShopEvent.js')).default;
const { getPublicShop, recordView, recordClick } = await import('../publicShopController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
};

const call = async (handler, { params = {}, query = {} } = {}) => {
  const res = mockRes();
  await handler({ params, query, body: {} }, res);
  return res;
};

const SHOP = { id: 1, userId: 9, publicId: 'pub123', title: '추천', intro: '소개', notice: '고지', isActive: true };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/shop/public/:publicId — 로그인 없이 연다', () => {
  it('비공개 상점과 없는 상점은 같은 404 (FR-403)', async () => {
    Shop.getByPublicId.mockResolvedValueOnce({ ...SHOP, isActive: false });
    const closed = await call(getPublicShop, { params: { publicId: 'pub123' } });
    Shop.getByPublicId.mockResolvedValueOnce(null);
    const missing = await call(getPublicShop, { params: { publicId: 'nope' } });

    expect(closed.status).toHaveBeenCalledWith(404);
    expect(missing.status).toHaveBeenCalledWith(404);
    expect(closed.json.mock.calls[0][0]).toEqual(missing.json.mock.calls[0][0]);
    expect(ShopProduct.listPublic).not.toHaveBeenCalled();
  });

  it('공개 상품만, 화이트리스트 필드로, 공개 상품이 있는 카테고리만 내려준다', async () => {
    Shop.getByPublicId.mockResolvedValue(SHOP);
    ShopProduct.listPublic.mockResolvedValue([
      { id: 12, userId: 9, title: '리본', url: 'https://a.com', imageUrl: null, imagePath: 'shop/9/x', price: 32000, categoryId: 3, isVisible: true, sortOrder: 0 },
      { id: 5, userId: 9, title: '곤봉', url: null, imageUrl: null, imagePath: null, price: null, categoryId: null, isVisible: true, sortOrder: 1 }
    ]);
    ShopCategory.listByUser.mockResolvedValue([
      { id: 1, name: '발레복', userId: 9 },
      { id: 3, name: '기구', userId: 9 }
    ]);

    const res = await call(getPublicShop, { params: { publicId: 'pub123' } });

    expect(ShopProduct.listPublic).toHaveBeenCalledWith(9);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({
      shop: { title: '추천', intro: '소개', notice: '고지' },
      categories: [{ id: 3, name: '기구' }],
      products: [
        { id: 12, title: '리본', url: 'https://a.com', imageUrl: null, price: 32000, categoryId: 3 },
        { id: 5, title: '곤봉', url: null, imageUrl: null, price: null, categoryId: null }
      ]
    });
  });
});

describe('POST …/view', () => {
  it('공개 상점이면 visitorKey 와 함께 기록하고 204', async () => {
    Shop.getByPublicId.mockResolvedValue(SHOP);
    const res = await call(recordView, { params: { publicId: 'pub123' }, query: { visitorKey: ' v-1 ' } });
    expect(ShopEvent.recordView).toHaveBeenCalledWith(9, 'v-1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('비공개면 기록하지 않는다', async () => {
    Shop.getByPublicId.mockResolvedValue({ ...SHOP, isActive: false });
    const res = await call(recordView, { params: { publicId: 'pub123' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(ShopEvent.recordView).not.toHaveBeenCalled();
  });
});

describe('POST …/products/:productId/click (FR-441)', () => {
  beforeEach(() => Shop.getByPublicId.mockResolvedValue(SHOP));

  it('그 상점의 공개·링크 있는 상품이면 기록하고 204', async () => {
    ShopProduct.getClickable.mockResolvedValue({ id: 12 });
    const res = await call(recordClick, { params: { publicId: 'pub123', productId: '12' }, query: { visitorKey: 'v-1' } });
    expect(ShopProduct.getClickable).toHaveBeenCalledWith(12, 9);
    expect(ShopEvent.recordClick).toHaveBeenCalledWith(9, 12, 'v-1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('숨김·링크 없음·남의 상품이면 404 (기록 없음)', async () => {
    ShopProduct.getClickable.mockResolvedValue(null);
    const res = await call(recordClick, { params: { publicId: 'pub123', productId: '12' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(ShopEvent.recordClick).not.toHaveBeenCalled();
  });

  it('숫자가 아닌 상품 id 는 404', async () => {
    const res = await call(recordClick, { params: { publicId: 'pub123', productId: 'x' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(ShopProduct.getClickable).not.toHaveBeenCalled();
  });
});
