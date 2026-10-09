import { jest } from '@jest/globals';

// 학부모 [추천 상품] 탭이 쓰는 질의 — 닫힌 상점은 빠지고, 받은 선생님 id 밖으로는 나가지 않는다. DB 없이 보낸 SQL 만 본다.
const query = jest.fn().mockResolvedValue({ rows: [] });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const Shop = (await import('../Shop.js')).default;

const lastSql = () => query.mock.calls.at(-1)[0].replace(/\s+/g, ' ').trim();

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [] });
});

describe('Shop.listActiveByUserIds', () => {
  it('받은 선생님 id 의 공개 중인 상점만 — 공개 링크에 필요한 칸만 읽는다', async () => {
    query.mockResolvedValueOnce({ rows: [{ userId: 7, publicId: 'pubA', title: '추천 상품' }] });

    await expect(Shop.listActiveByUserIds([7, 9])).resolves.toEqual([{ userId: 7, publicId: 'pubA', title: '추천 상품' }]);
    expect(lastSql()).toBe('SELECT "userId", "publicId", title FROM shops WHERE "userId" = ANY($1::int[]) AND "isActive" = TRUE');
    expect(query.mock.calls.at(-1)[1]).toEqual([[7, 9]]);
  });

  it('선생님이 없으면 DB 에 묻지 않고 빈 배열', async () => {
    await expect(Shop.listActiveByUserIds([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
