import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api } from './helpers.mjs';

/**
 * 추천 상품 (docs/recommended-shop) — 선생님이 등록하고, 로그인하지 않은 학부모가 공개 링크로 보고,
 * 누른 것이 선생님 통계에 잡히는 흐름 전체.
 * 같은 선생님 세션을 쓰므로 순서대로 돈다(serial). 끝에서 상점을 다시 공개로 돌려 둔다.
 */
const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));
const run = `${sessions.stamp}-${Math.random().toString(36).slice(2, 7)}`;
const simple = `e2e 곤봉 ${run}`;
const linked = `e2e 리본 ${run}`;

test.describe.configure({ mode: 'serial' });

let publicPath = '';

test.describe('추천 상품', () => {
  test('선생님: 타이틀만으로 등록하고, 링크·카테고리·가격을 넣은 상품도 등록한다', async ({ page, baseURL }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: '추천 상품' })).toBeVisible();

    // 처음 들어오면 상점과 공개 링크가 만들어져 있다
    const link = await page.getByLabel('공개 링크').inputValue();
    expect(link).toMatch(/\/shop\/[A-Za-z0-9_-]{22}$/);
    publicPath = new URL(link).pathname;

    // 1) 타이틀만
    await page.locator('.ui-page-header').getByRole('button', { name: '상품' }).click();
    const dialog = page.getByRole('dialog', { name: '상품 등록' });
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog.getByText('타이틀을 입력해 주세요')).toBeVisible();
    await dialog.getByLabel('타이틀').fill(simple);
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('tr', { hasText: simple })).toContainText('링크 없음');

    // 2) 링크(우리 서버 주소 — 테스트가 바깥 인터넷에 기대지 않게) · 카테고리 · 가격
    await page.locator('.ui-page-header').getByRole('button', { name: '상품' }).click();
    await dialog.getByLabel('타이틀').fill(linked);
    await dialog.getByLabel('연결할 주소').fill(`${baseURL}/design-system`);
    await dialog.getByLabel('카테고리').selectOption({ label: '기구' });
    await dialog.getByLabel('가격').fill('32000');
    await expect(dialog.getByLabel('가격')).toHaveValue('32,000');
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog).toBeHidden();

    const row = page.locator('tr', { hasText: linked });
    await expect(row).toContainText('32,000원');
    await expect(row).toContainText('기구');
  });

  test('학부모(로그인 없음): 공개 링크로 보고, 칩으로 거르고, 카드를 누르면 새 창으로 열린다', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    await page.goto(publicPath);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('추천 상품');
    await expect(page.getByText(simple)).toBeVisible();
    await expect(page.getByText(linked)).toBeVisible();

    // 링크 없는 상품은 누를 수 없다
    await expect(page.getByRole('link', { name: new RegExp(simple) })).toHaveCount(0);

    // 휴대폰 폭에서 가로 스크롤이 생기지 않는다
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // 칩은 주소에 남는다
    await page.getByRole('button', { name: '기구' }).click();
    await expect(page).toHaveURL(/\?c=\d+$/);
    await page.reload();
    await expect(page.getByRole('button', { name: '기구' })).toHaveAttribute('aria-pressed', 'true');

    // 카드를 누르면 새 창 + 클릭 기록
    const card = page.getByRole('link', { name: new RegExp(linked) });
    await expect(card).toHaveAttribute('target', '_blank');
    const [popup, beacon] = await Promise.all([
      context.waitForEvent('page'),
      page.waitForRequest((r) => r.url().includes('/click?visitorKey=') && r.method() === 'POST'),
      card.click()
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(`${baseURL}/design-system`);
    expect(beacon).toBeTruthy();

    await context.close();
  });

  test('선생님: 통계에 클릭이 잡히고, 숨기면 공개 상점에서 사라지되 통계에는 남는다', async ({ page, browser }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/products/stats');

    const statRow = page.locator('tr', { hasText: linked });
    await expect(statRow).toBeVisible();
    await expect(statRow.locator('b')).toHaveText('1');

    // 숨기기
    await page.getByRole('tab', { name: /상품/ }).click();
    // 스위치의 input 은 시각적으로 숨겨져 있어 사람처럼 라벨(.ui-switch)을 누른다
    await page.locator('tr', { hasText: linked }).locator('.ui-switch').click();
    await expect(page.locator('tr', { hasText: linked })).toContainText('숨김');

    const guest = await browser.newContext();
    const pub = await guest.newPage();
    await pub.goto(publicPath);
    await expect(pub.getByText(simple)).toBeVisible();
    await expect(pub.getByText(linked)).toHaveCount(0);
    await guest.close();

    await page.getByRole('tab', { name: '통계' }).click();
    await expect(page.locator('tr', { hasText: linked })).toContainText('숨김');
  });

  test('선생님: 상점을 비공개로 바꾸면 공개 링크는 안내 화면만 보인다', async ({ page, browser }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/products/settings');
    await page.locator('.ui-switch', { hasText: '상점 공개' }).click();
    await page.getByRole('button', { name: '저장' }).first().click();
    await expect(page.getByRole('status')).toContainText('저장했어요');

    const guest = await browser.newContext();
    const pub = await guest.newPage();
    await pub.goto(publicPath);
    await expect(pub.getByText('지금은 볼 수 없는 페이지예요')).toBeVisible();
    await expect(pub.getByText(simple)).toHaveCount(0);
    await guest.close();

    // 다음 실행을 위해 다시 공개로
    await page.locator('.ui-switch', { hasText: '상점 공개' }).click();
    await page.getByRole('button', { name: '저장' }).first().click();
    await expect(page.getByRole('status')).toContainText('상점 정보를 저장했어요');
  });

  test('학부모 토큰으로는 선생님 API 를 쓸 수 없다', async ({ request }) => {
    const res = await api(request, sessions.parent, 'GET', '/api/shop');
    expect(res.status).toBe(403);
  });
});
