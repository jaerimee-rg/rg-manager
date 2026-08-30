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

  it('실패 응답은 기록하지 않는다', async () => {
    const res = { statusCode: 403, json: jest.fn(), send: jest.fn() };
    logAction('IMPERSONATE')({ user: { username: 'x' } }, res, jest.fn());
    res.json({ error: 'no' });
    await flush();

    expect(pool.query).not.toHaveBeenCalled();
  });
});
