import { jest } from '@jest/globals';
import { getMapConfig } from '../mapController.js';

describe('mapController.getMapConfig', () => {
  const saved = process.env.KAKAO_JS_KEY;
  let res;

  beforeEach(() => {
    res = { json: jest.fn() };
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.KAKAO_JS_KEY;
    else process.env.KAKAO_JS_KEY = saved;
  });

  it('KAKAO_JS_KEY 를 내려준다 (앞뒤 공백 제거)', () => {
    process.env.KAKAO_JS_KEY = '  abc123  ';
    getMapConfig({}, res);
    expect(res.json).toHaveBeenCalledWith({ kakaoJsKey: 'abc123' });
  });

  it('키가 없거나 비어 있으면 null — 화면은 지도 없이 주소·링크만 보여준다', () => {
    delete process.env.KAKAO_JS_KEY;
    getMapConfig({}, res);
    expect(res.json).toHaveBeenLastCalledWith({ kakaoJsKey: null });

    process.env.KAKAO_JS_KEY = '   ';
    getMapConfig({}, res);
    expect(res.json).toHaveBeenLastCalledWith({ kakaoJsKey: null });
  });

  it('REST API 키(KAKAO_CLIENT_ID)는 대신 내려주지 않는다', () => {
    const savedRest = process.env.KAKAO_CLIENT_ID;
    delete process.env.KAKAO_JS_KEY;
    process.env.KAKAO_CLIENT_ID = 'rest-key';
    try {
      getMapConfig({}, res);
      expect(res.json).toHaveBeenLastCalledWith({ kakaoJsKey: null });
    } finally {
      if (savedRest === undefined) delete process.env.KAKAO_CLIENT_ID;
      else process.env.KAKAO_CLIENT_ID = savedRest;
    }
  });
});
