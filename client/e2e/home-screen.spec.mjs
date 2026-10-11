import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs } from './helpers.mjs';

/**
 * 학부모 — 홈 화면에 추가 안내 (docs/home-screen-prompt). parent 프로젝트(휴대폰 폭)에서 돈다.
 *
 * 프로젝트 기본 UA 는 PC 크롬이라 다른 학부모 테스트에는 팝업이 뜨지 않는다 — 여기서만 휴대폰 UA 를 쓴다.
 * 아이가 이미 등록된 parentMulti 를 써서 온보딩을 거치지 않는다.
 * 크롬의 진짜 설치 창은 자동화할 수 없어 beforeinstallprompt 는 흉내 낸 이벤트를 넣는다.
 */
const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));
const parent = sessions.parentMulti;

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  kakao: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0'
};

// 팝업은 앱이 뜨고 1.2초 뒤에 뜬다 — "안 뜬다" 를 보려면 그보다 넉넉히 기다린다
const PAST_DELAY_MS = 2500;

const sheet = (page) => page.getByTestId('home-screen-prompt');
// 제목 줄의 X 도 "닫기" 라서 아래 버튼 줄에서 찾는다
const footerClose = (page) => sheet(page).locator('.ui-overlay__footer').getByRole('button', { name: '닫기' });
const flag = (page, area, key) => page.evaluate(([a, k]) => window[a].getItem(k), [area, key]);

const openSchedule = async (page) => {
  await page.goto('/parent/schedule');
  await expect(page.getByRole('heading', { name: '일정' })).toBeVisible();
};

const expectNoSheet = async (page) => {
  await page.waitForTimeout(PAST_DELAY_MS);
  await expect(sheet(page)).toHaveCount(0);
};

test.describe('홈 화면에 추가 안내 — 안드로이드', () => {
  test.use({ userAgent: UA.android });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, parent);
  });

  test('설치 창을 못 띄우는 브라우저는 메뉴 순서를 안내하고, 다시 보지 않기를 체크하면 새 탭에서도 안 뜬다', async ({ page, context }) => {
    await openSchedule(page);

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute('data-env', 'android');
    await expect(page.getByRole('dialog', { name: /홈 화면에 .* 추가하기/ })).toBeVisible();
    await expect(sheet(page).getByText('앱 설치')).toBeVisible();
    await expect(sheet(page).getByRole('button', { name: '홈 화면에 추가' })).toHaveCount(0);

    await sheet(page).getByRole('checkbox', { name: '다시 보지 않기' }).check();
    await footerClose(page).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await flag(page, 'localStorage', 'homeScreenPrompt.hidden')).toBe('1');

    await page.reload();
    await expect(page.getByRole('heading', { name: '일정' })).toBeVisible();
    await expectNoSheet(page);

    // 새 탭 = 새 세션이어도 기기에 남긴 "다시 보지 않기" 가 막는다
    const other = await context.newPage();
    await openSchedule(other);
    await expectNoSheet(other);
    await other.close();
  });

  test('체크하지 않고 닫으면 이번 탭에서는 다시 안 뜨고, 앱을 새로 열면(새 탭) 다시 뜬다', async ({ page, context }) => {
    await openSchedule(page);
    await expect(sheet(page)).toBeVisible();

    await footerClose(page).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await flag(page, 'localStorage', 'homeScreenPrompt.hidden')).toBeNull();

    // 같은 탭에서 다른 탭(메뉴)으로 옮기거나 새로고침해도 안 뜬다
    await page.getByRole('link', { name: '내 정보' }).click();
    await expect(page.getByRole('heading', { name: '내 정보' })).toBeVisible();
    await page.reload();
    await expectNoSheet(page);

    const other = await context.newPage();
    await openSchedule(other);
    await expect(sheet(other)).toBeVisible();
    await other.close();
  });

  test('브라우저가 설치 창을 허락하면 [홈 화면에 추가] 한 번으로 열고, 설치하면 다시는 안 뜬다', async ({ page }) => {
    await page.addInitScript(() => {
      window.__installPrompts = 0;
      window.addEventListener('load', () => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__installPrompts += 1; };
        event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
        window.__installEvent = event;
        window.dispatchEvent(event);
      });
    });
    await openSchedule(page);

    await expect(sheet(page)).toBeVisible();
    // 학부모는 크롬 기본 설치 안내줄 대신 이 팝업이 맡는다
    expect(await page.evaluate(() => window.__installEvent.defaultPrevented)).toBe(true);

    await sheet(page).getByRole('button', { name: '홈 화면에 추가' }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__installPrompts)).toBe(1);
    expect(await flag(page, 'localStorage', 'homeScreenPrompt.installed')).toBe('1');

    // 새 세션에서도 설치 기록이 막는다 (이벤트는 다시 오지만 무시)
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: '일정' })).toBeVisible();
    await expectNoSheet(page);
  });

  test('온보딩 화면에서는 띄우지 않는다', async ({ page }) => {
    await page.goto('/parent/onboarding');
    await expect(page.getByRole('heading', { name: '아이 정보를 알려 주세요' })).toBeVisible();
    await expectNoSheet(page);
  });
});

test.describe('홈 화면에 추가 안내 — 아이폰', () => {
  test.use({ userAgent: UA.iphone });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, parent);
  });

  test('사파리는 공유 → 홈 화면에 추가 순서를 안내한다', async ({ page }) => {
    await openSchedule(page);

    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute('data-env', 'ios');
    await expect(sheet(page).getByRole('img', { name: '공유' })).toBeVisible();
    await expect(sheet(page).getByRole('img', { name: '홈 화면에 추가' })).toBeVisible();
    await expect(sheet(page).getByText(/홈 화면에 추가한 앱에서만 새 일정 알림/)).toBeVisible();

    // 휴대폰에서는 아래에서 올라오는 시트다 — 화면 아래에 붙는다
    await expect(sheet(page)).toHaveAttribute('data-mode', 'sheet');
    const viewport = page.viewportSize();
    await expect.poll(async () => {
      const box = await sheet(page).boundingBox();
      return Math.round(box.y + box.height);
    }).toBe(viewport.height);
  });

  test('홈 화면 아이콘으로 연 앱(navigator.standalone)에서는 띄우지 않는다', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
    });
    await openSchedule(page);
    await expectNoSheet(page);
    expect(await flag(page, 'localStorage', 'homeScreenPrompt.installed')).toBe('1');
  });
});

test.describe('홈 화면에 추가 안내 — 카카오톡 · PC', () => {
  test.describe('카카오톡', () => {
    test.use({ userAgent: UA.kakao });

    test('카카오톡 안에서는 [브라우저로 열기] 가 지금 화면을 바깥 브라우저로 연다', async ({ page }) => {
      await loginAs(page, parent);
      await openSchedule(page);

      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page)).toHaveAttribute('data-env', 'kakaotalk');
      const href = await sheet(page).getByRole('link', { name: /브라우저로 열기/ }).getAttribute('href');
      expect(href).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(page.url())}`);
    });
  });

  test('PC 브라우저(프로젝트 기본 UA)에서는 띄우지 않는다', async ({ page }) => {
    await loginAs(page, parent);
    await openSchedule(page);
    await expectNoSheet(page);
  });
});
