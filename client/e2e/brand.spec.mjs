import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { loginAs } from './helpers.mjs';

/**
 * 브랜드 — 로고 아래 서비스명(JR 리듬체조), 튀는 로고 로딩 표시, 링크 미리보기(OG) 이미지.
 * 로그인 화면·정적 파일은 세션 없이 보고, 선생님 헤더는 e2e/.sessions.json 이 있을 때만 본다.
 */
const sessionsFile = new URL('./.sessions.json', import.meta.url);
const sessions = existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile)) : null;

test.describe('브랜드 — 로고와 서비스명', () => {
  test('로그인 화면: 로고가 위, "JR 리듬체조" 가 바로 아래', async ({ page }) => {
    await page.goto('/login');

    const brand = page.getByRole('heading', { level: 1 });
    await expect(brand).toHaveText('JR 리듬체조');

    const logo = brand.locator('img');
    await expect(logo).toHaveAttribute('src', '/logo-mark.png');
    await expect(logo).toHaveJSProperty('complete', true);

    // 로고 상자가 이름 글자보다 위에 있다
    const logoBox = await logo.boundingBox();
    const nameBox = await brand.locator('.ui-brand__name').boundingBox();
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(nameBox.y + 1);
    expect(await page.title()).toBe('JR 리듬체조');
  });

  test('링크 미리보기: OG 태그가 운영 주소의 1200×630 이미지를 가리키고, 그 파일이 PNG 로 내려온다', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'JR 리듬체조');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://rg-manager.vercel.app/og-image.png');
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');

    // SPA 의 "모든 주소 → index.html" 에 걸려 HTML 이 내려오면 미리보기가 깨진다
    for (const file of ['/og-image.png', '/logo-mark.png', '/icon-192.png']) {
      const res = await request.get(file);
      expect(res.status(), file).toBe(200);
      expect(res.headers()['content-type'], file).toContain('image/png');
    }
  });

  test('첫 로딩: 앱 코드를 받기 전에도 튀는 로고가 보인다', async ({ page }) => {
    // 앱 번들을 붙잡아 두면 index.html 의 첫 로딩 표시만 남는다
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route('**/assets/index-*.js', async (route) => { await held; await route.continue(); });

    const nav = page.goto('/login', { waitUntil: 'commit' });
    const boot = page.locator('#root .boot');
    await expect(boot).toBeVisible();
    await expect(boot.locator('img')).toHaveAttribute('src', '/logo-mark.png');
    await expect(boot).toContainText('불러오는 중...');
    const animation = await boot.locator('img').evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('boot-hop');

    release();
    await nav;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('JR 리듬체조');
  });

  test('선생님 헤더: 로고 아래 서비스명이 h1 이고, 맨 왼쪽 로고와 같은 줄에 메뉴가 있다', async ({ page }) => {
    test.skip(!sessions, 'e2e/.sessions.json 이 없다 — npm run test:e2e:setup 먼저');
    await loginAs(page, sessions.teacher);
    await page.goto('/');

    const brand = page.locator('.app-header h1.ui-brand');
    await expect(brand).toHaveText('JR 리듬체조');
    await expect(brand.locator('img')).toHaveAttribute('src', '/logo-mark.png');
    const logoBox = await brand.locator('img').boundingBox();
    const nameBox = await brand.locator('.ui-brand__name').boundingBox();
    expect(logoBox.y + logoBox.height).toBeLessThanOrEqual(nameBox.y + 1);

    // 메뉴 첫 항목이 브랜드 오른쪽, 브랜드와 같은 줄(세로 범위 안)에 있다
    const brandBox = await brand.boundingBox();
    const firstLink = await page.locator('.app-header .desktop-nav a').first().boundingBox();
    expect(firstLink.x).toBeGreaterThan(brandBox.x + brandBox.width);
    const linkMidY = firstLink.y + firstLink.height / 2;
    expect(linkMidY).toBeGreaterThan(brandBox.y);
    expect(linkMidY).toBeLessThan(brandBox.y + brandBox.height);
  });
});
