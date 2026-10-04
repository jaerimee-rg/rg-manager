import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Shop.js', () => ({
  default: { getByPublicId: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopCategory.js', () => ({
  default: { listByUser: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopProduct.js', () => ({
  default: { listPublic: jest.fn(), getClickable: jest.fn(), getPublic: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopProductImage.js', () => ({
  default: { listByProducts: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopEvent.js', () => ({
  default: { recordView: jest.fn(), recordClick: jest.fn() }
}));
jest.unstable_mockModule('../../models/ShopReservation.js', () => ({
  default: { create: jest.fn(), listTakenDates: jest.fn() }
}));

const Shop = (await import('../../models/Shop.js')).default;
const ShopCategory = (await import('../../models/ShopCategory.js')).default;
const ShopProduct = (await import('../../models/ShopProduct.js')).default;
const ShopProductImage = (await import('../../models/ShopProductImage.js')).default;
const ShopEvent = (await import('../../models/ShopEvent.js')).default;
const ShopReservation = (await import('../../models/ShopReservation.js')).default;
const { getPublicShop, recordView, recordClick, createReservation, getUnavailableDates } = await import('../publicShopController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
};

const call = async (handler, { params = {}, query = {}, body = {} } = {}) => {
  const res = mockRes();
  await handler({ params, query, body }, res);
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
      { id: 12, userId: 9, title: '리본', description: '6m\n막대 포함', url: 'https://a.com', imageUrl: null, imagePath: null, price: 32000, categoryId: 3, isVisible: true, sortOrder: 0 },
      { id: 5, userId: 9, title: '곤봉', description: null, url: null, imageUrl: null, imagePath: null, price: null, categoryId: null, isVisible: true, sortOrder: 1 }
    ]);
    // 사진은 순서대로 — 주소만 나가고 저장소 경로·사진 id 는 나가지 않는다
    ShopProductImage.listByProducts.mockResolvedValue(new Map([
      [12, [
        { id: 7, productId: 12, userId: 9, imagePath: 'shop/9/a/1.jpg', imageUrl: 'https://cdn/1.jpg', sortOrder: 0 },
        { id: 8, productId: 12, userId: 9, imagePath: 'shop/9/b/2.jpg', imageUrl: 'https://cdn/2.jpg', sortOrder: 1 }
      ]]
    ]));
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
        {
          id: 12, title: '리본', description: '6m\n막대 포함', url: 'https://a.com',
          images: ['https://cdn/1.jpg', 'https://cdn/2.jpg'], price: 32000, categoryId: 3, isReservable: false
        },
        { id: 5, title: '곤봉', description: null, url: null, images: [], price: null, categoryId: null, isReservable: false }
      ]
    });
    expect(ShopProductImage.listByProducts).toHaveBeenCalledWith([12, 5]);
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

describe('POST …/products/:productId/reservations — 로그인 없이 예약 요청 (05-reservations.md)', () => {
  const params = { publicId: 'pub123', productId: '12' };
  const BODY = { name: ' 김예림 ', phone: '01012345678', date: '2099-01-01' };
  const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const inDays = (n) => new Date(Date.now() + 9 * 60 * 60 * 1000 + n * 86400000).toISOString().slice(0, 10);

  beforeEach(() => {
    Shop.getByPublicId.mockResolvedValue(SHOP);
    ShopProduct.getPublic.mockResolvedValue({ id: 12, title: '리본', isReservable: true });
    ShopReservation.create.mockImplementation(async (_userId, value) => ({
      reservation: { id: 3, ...value, status: 'requested' },
      outcome: 'created'
    }));
  });

  it('정리한 값으로 상점 주인에게 예약을 만들고 201 — 응답에는 날짜·상태만', async () => {
    const date = inDays(3);
    const res = await call(createReservation, { params, body: { ...BODY, date } });

    expect(ShopProduct.getPublic).toHaveBeenCalledWith(12, 9);
    expect(ShopReservation.create).toHaveBeenCalledWith(9, {
      productId: 12, productTitle: '리본', name: '김예림', phone: '010-1234-5678', reservedDate: date
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ reservation: { reservedDate: date, status: 'requested' }, duplicate: false });
  });

  it('오늘 날짜(KST)는 받는다', async () => {
    const res = await call(createReservation, { params, body: { ...BODY, date: today() } });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('같은 번호로 이미 잡은 날이면 새로 만들지 않았다고 200 으로 알린다', async () => {
    ShopReservation.create.mockResolvedValue({
      reservation: { id: 3, reservedDate: inDays(1), status: 'requested' },
      outcome: 'duplicate'
    });
    const res = await call(createReservation, { params, body: { ...BODY, date: inDays(1) } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].duplicate).toBe(true);
  });

  it('다른 사람이 잡은 날이면 409 — 날짜 칸 오류로, 누가 잡았는지는 알려 주지 않는다', async () => {
    ShopReservation.create.mockResolvedValue({
      reservation: { id: 9, name: '다른 학부모', phone: '010-9999-0000', reservedDate: inDays(1), status: 'confirmed' },
      outcome: 'taken'
    });
    const res = await call(createReservation, { params, body: { ...BODY, date: inDays(1) } });
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({
      error: '이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.',
      code: 'dateUnavailable',
      fields: { date: '이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.' }
    });
    expect(JSON.stringify(body)).not.toMatch(/다른 학부모|9999/);
  });

  it('입력이 틀리면 400 과 칸별 오류 — 예약은 만들지 않는다', async () => {
    const res = await call(createReservation, { params, body: { name: '', phone: '123', date: inDays(-1) } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].fields).toEqual({
      name: '이름을 입력해 주세요',
      phone: '전화번호를 정확히 입력해 주세요',
      date: '오늘 이후 날짜를 골라 주세요'
    });
    expect(ShopReservation.create).not.toHaveBeenCalled();
  });

  it('예약 받기를 끈 상품은 409', async () => {
    ShopProduct.getPublic.mockResolvedValue({ id: 12, title: '리본', isReservable: false });
    const res = await call(createReservation, { params, body: { ...BODY, date: inDays(1) } });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(ShopReservation.create).not.toHaveBeenCalled();
  });

  it('숨김·남의 상품·이상한 id·닫힌 상점은 모두 404', async () => {
    ShopProduct.getPublic.mockResolvedValueOnce(null);
    expect((await call(createReservation, { params, body: BODY })).status).toHaveBeenCalledWith(404);

    expect((await call(createReservation, { params: { ...params, productId: 'abc' }, body: BODY })).status)
      .toHaveBeenCalledWith(404);

    Shop.getByPublicId.mockResolvedValueOnce({ ...SHOP, isActive: false });
    expect((await call(createReservation, { params, body: BODY })).status).toHaveBeenCalledWith(404);

    expect(ShopReservation.create).not.toHaveBeenCalled();
  });

  it('DB 오류는 500', async () => {
    ShopReservation.create.mockRejectedValue(new Error('boom'));
    const res = await call(createReservation, { params, body: { ...BODY, date: inDays(1) } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('GET …/products/:productId/unavailable-dates — 학부모 달력에서 막을 날', () => {
  const params = { publicId: 'pub123', productId: '12' };
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeEach(() => {
    Shop.getByPublicId.mockResolvedValue(SHOP);
    ShopProduct.getPublic.mockResolvedValue({ id: 12, title: '리본', isReservable: true });
    ShopReservation.listTakenDates.mockResolvedValue(['2099-01-01', '2099-01-03']);
  });

  it('그 상품에서 오늘(KST)부터 잡힌 날짜만 — 캐시하지 않는다', async () => {
    const res = await call(getUnavailableDates, { params });
    expect(ShopReservation.listTakenDates).toHaveBeenCalledWith(12, 9, today);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({ dates: ['2099-01-01', '2099-01-03'] });
  });

  it('숨김·남의 상품·닫힌 상점은 404, 예약을 끈 상품은 409', async () => {
    ShopProduct.getPublic.mockResolvedValueOnce(null);
    expect((await call(getUnavailableDates, { params })).status).toHaveBeenCalledWith(404);

    Shop.getByPublicId.mockResolvedValueOnce({ ...SHOP, isActive: false });
    expect((await call(getUnavailableDates, { params })).status).toHaveBeenCalledWith(404);

    ShopProduct.getPublic.mockResolvedValueOnce({ id: 12, title: '리본', isReservable: false });
    expect((await call(getUnavailableDates, { params })).status).toHaveBeenCalledWith(409);

    expect(ShopReservation.listTakenDates).not.toHaveBeenCalled();
  });

  it('DB 오류는 500', async () => {
    ShopReservation.listTakenDates.mockRejectedValue(new Error('boom'));
    expect((await call(getUnavailableDates, { params })).status).toHaveBeenCalledWith(500);
  });
});
