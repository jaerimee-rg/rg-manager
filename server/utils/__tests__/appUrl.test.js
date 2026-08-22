import { jest } from '@jest/globals';

// appUrl 은 모듈 로드 시점에 환경변수를 읽으므로 매번 새로 import 한다.
const loadAppUrl = async (env) => {
  jest.resetModules();

  const saved = {
    APP_URL: process.env.APP_URL,
    KAKAO_REDIRECT_URI: process.env.KAKAO_REDIRECT_URI,
    NODE_ENV: process.env.NODE_ENV
  };

  delete process.env.APP_URL;
  delete process.env.KAKAO_REDIRECT_URI;
  Object.entries(env).forEach(([k, v]) => {
    process.env[k] = v;
  });

  try {
    return await import('../appUrl.js');
  } finally {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }
};

describe('appUrl', () => {
  it('APP_URL 이 있으면 그 값을 쓴다', async () => {
    const { APP_URL } = await loadAppUrl({ APP_URL: 'https://my-app.example.com' });
    expect(APP_URL).toBe('https://my-app.example.com');
  });

  it('끝의 슬래시는 떼어 링크가 //로 이어지지 않게 한다', async () => {
    const { APP_URL, KAKAO_REDIRECT_URI } = await loadAppUrl({
      APP_URL: 'https://my-app.example.com///'
    });
    expect(APP_URL).toBe('https://my-app.example.com');
    expect(KAKAO_REDIRECT_URI).toBe('https://my-app.example.com/oauth/kakao/callback');
  });

  it('redirect_uri 는 APP_URL 에서 자동으로 만들어진다', async () => {
    const { KAKAO_REDIRECT_URI } = await loadAppUrl({ APP_URL: 'https://rg.example.com' });
    expect(KAKAO_REDIRECT_URI).toBe('https://rg.example.com/oauth/kakao/callback');
  });

  it('KAKAO_REDIRECT_URI 를 따로 주면 그 값이 우선한다', async () => {
    const { KAKAO_REDIRECT_URI } = await loadAppUrl({
      APP_URL: 'https://rg.example.com',
      KAKAO_REDIRECT_URI: 'https://legacy.example.com/oauth/kakao/callback'
    });
    expect(KAKAO_REDIRECT_URI).toBe('https://legacy.example.com/oauth/kakao/callback');
  });

  it('운영에서 APP_URL 이 없으면 살아있는 배포 주소로 떨어진다', async () => {
    const { APP_URL, KAKAO_REDIRECT_URI } = await loadAppUrl({ NODE_ENV: 'production' });

    // 죽은 onrender 주소로 되돌아가지 않아야 한다
    expect(APP_URL).toBe('https://rg-manager.vercel.app');
    expect(APP_URL).not.toContain('onrender');
    expect(KAKAO_REDIRECT_URI).toBe('https://rg-manager.vercel.app/oauth/kakao/callback');
  });

  it('개발에서는 로컬 주소를 쓴다', async () => {
    const { APP_URL } = await loadAppUrl({ NODE_ENV: 'development' });
    expect(APP_URL).toBe('http://localhost:3000');
  });
});
