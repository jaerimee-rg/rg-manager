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
      // home-screen: 홈 화면에 추가 안내 — 스펙 안에서 휴대폰 UA(안드로이드 · 아이폰 · 카카오톡)로 바꿔 돈다
      testMatch: /(parent|home-screen)\.spec\.mjs/
    },
    {
      // 계정·역할·초대 (docs/accounts-roles). 카카오 인가 화면은 자동화하지 않는다.
      name: 'accounts',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /accounts\.spec\.mjs/
    },
    {
      // 추천 상품 (docs/recommended-shop). 공개 상점은 스펙 안에서 휴대폰 폭·비로그인 컨텍스트를 따로 연다.
      name: 'shop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /shop\.spec\.mjs/
    },
    {
      // 새 일정 브라우저 알림 — 학부모 내 정보의 알림 켜기 · 서비스 워커 · 이벤트 폼의 [학부모에게 알림 보내기].
      // 서버에 VAPID 키가 있어야 학부모 쪽이 돈다(없으면 skip). 실제 푸시 서비스 왕복은 E2E_REAL_PUSH=1 일 때만.
      name: 'push',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /push\.spec\.mjs/
    },
    {
      // 브랜드: 로고 아래 서비스명, 튀는 로고 로딩, 링크 미리보기(OG). 로그인 없이도 대부분 돈다.
      name: 'brand',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /brand\.spec\.mjs/
    },
    {
      // 디자인 시스템 (mockup/ 의 종이 · 잉크 · 별). 계산된 색 · 선 · 서체와 세 역할의 셸을 본다.
      name: 'design',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /design\.spec\.mjs/
    }
  ]
});
