import { defineConfig, devices } from '@playwright/test';

/**
 * e2e 는 빌드된 앱을 Express 가 서빙하는 상태(운영과 같은 구성)에서 돌린다.
 * 서버·DB 는 미리 띄워 두고 E2E_BASE_URL 로 알려준다.
 *
 *   cd client && npm run build
 *   cd server && DATABASE_URL=postgresql://<user>@localhost:5432/rg_manager PORT=5055 \
 *                JWT_SECRET=local-dev-secret API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 node server.js
 *   cd client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e:setup
 *   cd client && E2E_BASE_URL=http://localhost:5055 npm run test:e2e
 *
 * JWT_SECRET 은 setup.mjs 가 토큰을 서명할 때 쓰는 값(local-dev-secret)과 같아야 한다 —
 * 다르면 모든 화면이 로그인으로 튕긴다. 레이트 리밋은 운영 한도(200/15분·IP)라
 * 올려두지 않으면 스위트 뒤쪽 테스트가 429 를 받는다.
 *
 * 카카오 로그인은 자동화할 수 없어 테스트가 토큰을 직접 넣는다(로그인 이후 흐름을 검증).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5055',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  },
  projects: [
    { name: 'teacher', use: { ...devices['Desktop Chrome'] }, testMatch: /teacher\.spec\.mjs/ },
    {
      // 학부모는 거의 휴대폰으로 본다. iPhone 프리셋은 WebKit 을 받아야 해서
      // 브라우저 하나(Chromium)만으로 돌 수 있도록 모바일 뷰포트만 흉내 낸다.
      name: 'parent',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 414, height: 896 },
        isMobile: false,
        hasTouch: true
      },
      testMatch: /parent\.spec\.mjs/
    },
    {
      // 계정·역할·초대 (docs/accounts-roles). 카카오 인가 화면은 자동화하지 않는다.
      name: 'accounts',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /accounts\.spec\.mjs/
    }
  ]
});
