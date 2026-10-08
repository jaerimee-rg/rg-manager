import { jest } from '@jest/globals';

// 로그는 DB 에 쓰므로 풀만 가짜로 바꾼다.
jest.unstable_mockModule('../../database.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) }
}));

const pool = (await import('../../database.js')).default;
const { logAction } = await import('../logger.js');

// saveLog 는 응답을 막지 않도록 기다리지 않는다 — 한 틱 뒤에 확인한다
const flush = () => new Promise((resolve) => setImmediate(resolve));

const run = async (action, req, body) => {
  const res = {
    statusCode: 200,
    json: jest.fn(function (data) { return data; }),
    send: jest.fn(function (data) { return data; })
  };
  const next = jest.fn();

  logAction(action)(req, res, next);
  expect(next).toHaveBeenCalled();
  res.json(body);
  await flush();

  return pool.query.mock.calls[0];
};

describe('logAction — 누가 한 일인지 남긴다', () => {
  beforeEach(() => jest.clearAllMocks());

  it('보통은 토큰의 사용자 이름을 쓴다', async () => {
    const [, params] = await run('UPDATE_USER', { user: { id: 9, username: '이재림', role: 'user' }, body: {} }, {});

    expect(params[0]).toBe('이재림');
    expect(params[1]).toBe('UPDATE_USER');
  });

  it('관리자가 다른 계정으로 들어와 있으면 "관리자 → 대상" 으로 남긴다 (FR-388)', async () => {
    const req = { user: { id: 9, username: '이재림', role: 'user', act: { id: 1, username: 'admin' } }, body: {} };
    const [, params] = await run('UPDATE_STUDENT', req, {});

    expect(params[0]).toBe('admin → 이재림');
  });

  it('IMPERSONATE 는 대상 계정과 역할을 상세에 적는다', async () => {
    const req = { user: { id: 1, username: 'admin', role: 'admin' }, body: {} };
    const [, params] = await run('IMPERSONATE', req, {
      user: { id: 20, username: '이재림_학부모' }, role: 'parent', token: 't'
    });

    expect(params[0]).toBe('admin');
    expect(params[1]).toBe('IMPERSONATE');
    expect(params[3]).toBe('대상: 이재림_학부모 (학부모)');
  });

  it('학부모의 아이 삭제는 지운 아이 이름을 상세에 적는다', async () => {
    const req = { user: { id: 20, username: '칸쵸엄마', role: 'parent' }, body: {}, params: { childId: '2' } };
    const [, params] = await run('DELETE_PARENT_CHILD', req, {
      deleted: { id: 2, childName: '이쵸파' }, facesRemoved: 0, children: []
    });

    expect(params[1]).toBe('DELETE_PARENT_CHILD');
    expect(params[3]).toBe('아이: 이쵸파');
  });

  it('실패 응답은 기록하지 않는다', async () => {
    const res = { statusCode: 403, json: jest.fn(), send: jest.fn() };
    logAction('IMPERSONATE')({ user: { username: 'x' } }, res, jest.fn());
    res.json({ error: 'no' });
    await flush();

    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('logAction — 추천 상품 (docs/recommended-shop)', () => {
  beforeEach(() => jest.clearAllMocks());
  const user = { id: 9, username: '이재림', role: 'user' };

  it('상품 등록·수정은 상품 이름을, 숨기면 (숨김) 을 남긴다', async () => {
    let [, params] = await run('CREATE_SHOP_PRODUCT', { user, body: {} }, { product: { title: '리본', isVisible: true } });
    expect(params[3]).toBe('상품: 리본');

    jest.clearAllMocks();
    [, params] = await run('UPDATE_SHOP_PRODUCT', { user, body: {} }, { product: { title: '리본', isVisible: false } });
    expect(params[3]).toBe('상품: 리본 (숨김)');
  });

  it('상품 삭제는 id, 상점 저장은 이름·비공개 여부', async () => {
    let [, params] = await run('DELETE_SHOP_PRODUCT', { user, params: { id: '12' }, body: {} }, {});
    expect(params[3]).toBe('상품 ID: 12');

    jest.clearAllMocks();
    [, params] = await run('UPDATE_SHOP', { user, body: { title: '추천', isActive: false } }, {});
    expect(params[3]).toBe('상점: 추천 (비공개)');
  });

  it('상품 사진 올리기·빼기는 상품 이름을 남긴다', async () => {
    let [, params] = await run('UPLOAD_SHOP_IMAGE', { user, body: {} }, { product: { title: '리본' } });
    expect(params[3]).toBe('상품 이미지: 리본');

    jest.clearAllMocks();
    [, params] = await run('DELETE_SHOP_IMAGE', { user, params: { id: '12', imageId: '5' }, body: {} }, { product: { title: '리본' } });
    expect(params[3]).toBe('상품 이미지 삭제: 리본');
  });

  it('카테고리 추가는 이름을 남긴다', async () => {
    const [, params] = await run('CREATE_SHOP_CATEGORY', { user, body: {} }, { category: { name: '수구' } });
    expect(params[3]).toBe('카테고리: 수구');
  });

  it('예약 상태 변경은 예약 id 와 바뀐 상태만 — 학부모 이름·전화번호는 남기지 않는다', async () => {
    const [, params] = await run(
      'UPDATE_SHOP_RESERVATION',
      { user, params: { id: '3' }, body: { status: 'confirmed' } },
      { reservation: { id: 3, name: '김예림', phone: '010-1234-5678', status: 'confirmed' } }
    );
    expect(params[3]).toBe('예약 ID: 3 → 확정');
    expect(JSON.stringify(params)).not.toMatch(/김예림|010-1234-5678/);
  });
});
