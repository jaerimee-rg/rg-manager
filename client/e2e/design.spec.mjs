import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs } from './helpers.mjs';

/**
 * 디자인 개편(종이 · 잉크 · 별, mockup/)이 실제 브라우저에서 계산된 모양으로 나오는지 본다.
 * jsdom 은 CSS 를 계산하지 않아서 단위 테스트(design-tokens.test.js)는 원본 파일만 확인한다 —
 * 여기서는 서체가 실제로 내려오고, 색 · 선 · 셸이 계산된 값으로 맞는지를 확인한다.
 */

const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));

const PAPER = 'rgb(236, 233, 226)';
const SHEET = 'rgb(248, 246, 241)';
const INK = 'rgb(0, 0, 0)';
const STAR = 'rgb(241, 222, 110)';

const style = (locator, prop, pseudo = null) =>
  locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps).getPropertyValue(p), [prop, pseudo]);

test.describe('디자인 시스템 — 종이 · 잉크 · 별', () => {
  test('바탕은 종이 결, 카드는 잉크 2px 선, 제목은 Black Han Sans 에 별 세 개', async ({ page }) => {
    await page.goto('/design-system');
    const title = page.getByRole('heading', { level: 1, name: '디자인 시스템' });
    await expect(title).toBeVisible();

    const body = page.locator('body');
    expect(await style(body, 'background-color')).toBe(PAPER);
    expect(await style(body, 'background-image')).toContain('data:image/svg+xml');
    expect(await style(body, 'font-family')).toMatch(/^"?Pretendard Variable"?/);

    expect(await style(title, 'font-family')).toMatch(/^"?Black Han Sans"?/);
    expect(await style(title, 'background-image', '::after')).toContain('data:image/svg+xml');

    const card = page.locator('.ui-card').first();
    expect(await style(card, 'background-color')).toBe(SHEET);
    expect(await style(card, 'border-top-width')).toBe('2px');
    expect(await style(card, 'border-top-color')).toBe(INK);

    // 활성 탭은 지그재그 밑줄
    const tab = page.getByRole('tab', { name: '기초' });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await style(tab, 'background-image', '::after')).toContain('data:image/svg+xml');
  });

  test('도움말은 Gaegu 손글씨, 강조 채움은 별 노랑', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('tab', { name: '입력' }).click();
    const hint = page.locator('.ui-field__hint').first();
    await expect(hint).toBeVisible();
    expect(await style(hint, 'font-family')).toMatch(/^"?Gaegu"?/);

    await page.getByRole('tab', { name: '액션' }).click();
    const brand = page.getByRole('button', { name: '브랜드' });
    expect(await style(brand, 'background-color')).toBe(STAR);
    expect(await style(brand, 'color')).toBe(INK);
  });

  test('세 서체가 실제로 내려온다 (Pretendard · Black Han Sans · Gaegu)', async ({ page }) => {
    // 서체는 외부 CDN(jsdelivr · Google Fonts)에서 받는다. 네트워크가 막힌 환경에서는 건너뛴다.
    const reachable = await page.request
      .get('https://fonts.googleapis.com/css2?family=Gaegu&display=swap', { timeout: 5_000 })
      .then((r) => r.ok())
      .catch(() => false);
    test.skip(!reachable, '외부 서체 CDN 에 닿지 않는 환경');

    await page.goto('/design-system');
    await page.getByRole('tab', { name: '입력' }).click();
    await expect(page.locator('.ui-field__hint').first()).toBeVisible();

    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      const families = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
      return [...new Set(families)];
    });
    expect(loaded).toEqual(expect.arrayContaining(['Pretendard Variable', 'Black Han Sans', 'Gaegu']));
  });
});

test.describe('셸 — 선생님 · 관리자 · 학부모', () => {
  test('선생님 머리말은 종이 위 잉크 선, 현재 메뉴는 형광펜', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/students');
    await expect(page.getByRole('heading', { name: '학생 관리' })).toBeVisible();

    const header = page.locator('.app-header');
    expect(await style(header, 'border-bottom-width')).toBe('2px');
    expect(await style(header, 'border-bottom-color')).toBe(INK);

    const active = page.locator('.desktop-nav a.active');
    await expect(active).toHaveText('학생 관리');
    expect(await style(active, 'background-image')).toContain('linear-gradient');
  });

  test('관리자 사이드바는 이모지 대신 선 아이콘', async ({ page }) => {
    await loginAs(page, sessions.admin);
    await page.goto('/admin/classes');
    const sidebar = page.locator('.admin-sidebar');
    await expect(sidebar.getByRole('link', { name: '수업' })).toBeVisible();
    const icons = sidebar.locator('.admin-sidebar-icon');
    expect(await icons.count()).toBeGreaterThan(0);
    expect(await icons.locator('svg').count()).toBe(await icons.count());
    expect(await style(sidebar, 'border-right-color')).toBe(INK);
  });

  test('학부모 탭 바는 화면 아래에 붙어 있고 현재 탭에 형광펜', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, sessions.parentMulti);
    await page.goto('/parent/schedule');
    await expect(page.getByRole('heading', { level: 1, name: '일정' })).toBeVisible();

    const tabbar = page.getByRole('navigation', { name: '학부모 메뉴' });
    const box = await tabbar.boundingBox();
    expect(Math.round(box.y + box.height)).toBe(844);

    const current = tabbar.getByRole('link', { name: '일정' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current.locator('svg')).toHaveCount(1);
    expect(await style(current.locator('.ui-tabbar__label'), 'background-image')).toContain('linear-gradient');
  });
});
