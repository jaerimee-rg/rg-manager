import { jest } from '@jest/globals';

// 학부모 [추천 상품] 탭 — 연결된 선생님의 공개 상점만, 연결 순서대로 알려 준다
jest.unstable_mockModule('../../models/Shop.js', () => ({
  default: { listActiveByUserIds: jest.fn() }
}));
jest.unstable_mockModule('../../services/parentScope.js', () => ({
  teachersOf: jest.fn()
}));

const Shop = (await import('../../models/Shop.js')).default;
const { teachersOf } = await import('../../services/parentScope.js');
const { listShops } = await import('../parentShopController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const req = { user: { id: 50, role: 'parent' } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/parent/shops', () => {
  it('연결된 선생님들의 id 로만 상점을 찾는다 — 다른 선생님 상점은 물어보지도 않는다', async () => {
    teachersOf.mockResolvedValue([{ id: 7, name: '이재림' }, { id: 9, name: '박선생' }]);
    Shop.listActiveByUserIds.mockResolvedValue([]);

    await listShops(req, mockRes());

    expect(teachersOf).toHaveBeenCalledWith(50);
    expect(Shop.listActiveByUserIds).toHaveBeenCalledWith([7, 9]);
  });

  it('공개 id·상점 이름·선생님 이름만, 먼저 연결한 선생님 순서로 준다', async () => {
    teachersOf.mockResolvedValue([{ id: 7, name: '이재림' }, { id: 9, name: '박선생' }]);
    // DB 는 순서를 보장하지 않는다
    Shop.listActiveByUserIds.mockResolvedValue([
      { userId: 9, publicId: 'pubB', title: '박선생 추천 상품' },
      { userId: 7, publicId: 'pubA', title: '이재림 선생님 추천 상품' }
    ]);
    const res = mockRes();

    await listShops(req, res);

    expect(res.json).toHaveBeenCalledWith({
      shops: [
        { publicId: 'pubA', title: '이재림 선생님 추천 상품', teacherName: '이재림' },
        { publicId: 'pubB', title: '박선생 추천 상품', teacherName: '박선생' }
      ]
    });
  });

  it('상점을 연 적이 없거나 닫아 둔 선생님은 빠진다', async () => {
    teachersOf.mockResolvedValue([{ id: 7, name: '이재림' }, { id: 9, name: '박선생' }]);
    Shop.listActiveByUserIds.mockResolvedValue([{ userId: 9, publicId: 'pubB', title: '박선생 추천 상품' }]);
    const res = mockRes();

    await listShops(req, res);

    expect(res.json).toHaveBeenCalledWith({
      shops: [{ publicId: 'pubB', title: '박선생 추천 상품', teacherName: '박선생' }]
    });
  });

  it('연결된 선생님이 없으면 빈 목록', async () => {
    teachersOf.mockResolvedValue([]);
    Shop.listActiveByUserIds.mockResolvedValue([]);
    const res = mockRes();

    await listShops(req, res);

    expect(res.json).toHaveBeenCalledWith({ shops: [] });
  });

  it('조회가 실패하면 500', async () => {
    teachersOf.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await listShops(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
