import { jest } from '@jest/globals';

jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));
jest.unstable_mockModule('../../models/Shop.js', () => ({
  default: { getByUserId: jest.fn(), createWithDefaults: jest.fn() }
}));

const pool = (await import('../../database.js')).default;
const Shop = (await import('../../models/Shop.js')).default;
const { getOrCreateShop } = await import('../shopService.js');

beforeEach(() => jest.clearAllMocks());

describe('getOrCreateShop (FR-400 · 420)', () => {
  it('이미 있으면 그대로 돌려준다', async () => {
    Shop.getByUserId.mockResolvedValue({ id: 1 });
    await expect(getOrCreateShop(9)).resolves.toEqual({ id: 1 });
    expect(Shop.createWithDefaults).not.toHaveBeenCalled();
  });

  it('없으면 선생님 표시 이름과 기본 카테고리 5개로 만든다', async () => {
    Shop.getByUserId.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ username: '카카오_17', displayName: '이재림' }] });
    Shop.createWithDefaults.mockResolvedValue({ id: 2 });

    await getOrCreateShop(9);

    expect(Shop.createWithDefaults).toHaveBeenCalledWith(9, '이재림 선생님 추천 상품', ['발레복', '레오타드', '기구', '슈즈', '용품']);
  });

  it('표시 이름이 없고 username 이 자리표시(카카오_…)면 이름 없이 만든다', async () => {
    Shop.getByUserId.mockResolvedValue(null);
    pool.query.mockResolvedValue({ rows: [{ username: '카카오_1756', displayName: null }] });
    Shop.createWithDefaults.mockResolvedValue({ id: 3 });

    await getOrCreateShop(9);

    expect(Shop.createWithDefaults.mock.calls[0][1]).toBe('선생님 추천 상품');
  });
});
