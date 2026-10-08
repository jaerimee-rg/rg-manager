import { jest } from '@jest/globals';

// 학부모가 내 정보에서 아이를 지울 때 — 남의 것이 함께 지워지지 않는지 쿼리로 확인한다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const ParentChild = (await import('../ParentChild.js')).default;
const ChildFaceProfile = (await import('../ChildFaceProfile.js')).default;

describe('학부모의 아이 삭제 — 주인 것만 지운다', () => {
  beforeEach(() => pool.query.mockReset());

  it('ParentChild.deleteOwned 는 아이 id 와 학부모 id 를 함께 건다', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 2 }] });

    const removed = await ParentChild.deleteOwned(2, 20);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM parent_children WHERE id = \$1 AND "parentUserId" = \$2/);
    expect(params).toEqual([2, 20]);
    expect(removed).toBe(true);
  });

  it('다른 집 아이의 id 면 지워진 행이 없어 false', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    expect(await ParentChild.deleteOwned(2, 99)).toBe(false);
  });

  it('ChildFaceProfile.deleteByParentAndStudent 는 올린 학부모와 학생으로 좁혀 지운 장수를 준다', async () => {
    pool.query.mockResolvedValue({ rowCount: 3 });

    const count = await ChildFaceProfile.deleteByParentAndStudent(20, 100);

    const [sql, params] = pool.query.mock.calls[0];
    // 같은 학생에 연결된 다른 학부모가 올린 얼굴은 남아야 한다
    expect(sql).toMatch(/DELETE FROM child_face_profiles WHERE "parentUserId" = \$1 AND "studentId" = \$2/);
    expect(params).toEqual([20, 100]);
    expect(count).toBe(3);
  });
});
