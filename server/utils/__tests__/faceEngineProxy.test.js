import { jest } from '@jest/globals';
import { createFaceEngineProxy } from '../faceEngineProxy.js';

const makeRes = () => {
  const res = { statusCode: 200, body: undefined, contentType: undefined };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  res.type = jest.fn((value) => { res.contentType = value; return res; });
  res.send = jest.fn((body) => { res.body = body; return res; });
  return res;
};

const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const makeReq = (overrides = {}) => ({
  method: 'POST',
  path: '/detect',
  headers: { authorization: 'Bearer abc', 'content-type': 'image/jpeg', cookie: 'secret=1' },
  body: image,
  ...overrides
});

describe('faceEngineProxy — 로컬·e2e 에서 Python 얼굴 분석으로 넘기기', () => {
  it('FACE_ENGINE_URL 이 없으면 503 — 브라우저는 그 사진을 분석 안 됨으로 둔다', async () => {
    const res = makeRes();
    await createFaceEngineProxy({ baseUrl: '' })(makeReq(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ reason: 'engine_unavailable' });
  });

  it('사진 바이트와 로그인 토큰·형식만 그대로 넘기고, 답도 그대로 돌려준다', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json; charset=utf-8' },
      text: async () => '{"faces":[],"analyzerVersion":3}'
    });
    const res = makeRes();

    await createFaceEngineProxy({ baseUrl: 'http://localhost:5090/', fetchImpl })(makeReq(), res);

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:5090/api/face-engine/detect', {
      method: 'POST',
      headers: { authorization: 'Bearer abc', 'content-type': 'image/jpeg' },
      body: image
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"faces":[],"analyzerVersion":3}');
  });

  it('GET 에는 본문을 붙이지 않는다 (health)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, headers: { get: () => null }, text: async () => '{}' });
    await createFaceEngineProxy({ baseUrl: 'http://x', fetchImpl })(makeReq({ method: 'GET', path: '/health', body: {} }), makeRes());

    expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
  });

  it('분석 서버가 꺼져 있으면 503', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();

    await createFaceEngineProxy({ baseUrl: 'http://x', fetchImpl })(makeReq(), res);

    expect(res.statusCode).toBe(503);
    spy.mockRestore();
  });
});
