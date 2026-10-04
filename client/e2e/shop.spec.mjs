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
const photos = `e2e 사진 ${run}`;

/** 브라우저 캔버스로 색 띠 PNG 를 만든다 — 사진 비율·자른 위치를 색으로 확인한다 */
const makePng = async (page, width, height, colors) => {
  const base64 = await page.evaluate(({ width: w, height: h, colors: list }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    list.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect((w / list.length) * i, 0, w / list.length, h);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height, colors });
  return Buffer.from(base64, 'base64');
};

/**
 * 손가락으로 민다 — 크로미움에 진짜 터치 입력(CDP)을 넣어 브라우저 스크롤·preventDefault 가 휴대폰처럼 돈다.
 * page.mouse 로는 touch 이벤트가 나지 않는다.
 */
const fingerSwipe = async (page, from, to, { steps = 10, delay = 16 } = {}) => {
  const cdp = await page.context().newCDPSession(page);
  const at = (i) => [{ x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps) }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
    await page.waitForTimeout(delay);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

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

  test('학부모(로그인 없음): 공개 링크로 보고, 칩으로 거르고, 카드 → 상세 → 쇼핑몰 버튼은 새 창으로 열린다', async ({ browser, baseURL }) => {
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

    // 카드를 누르면 상세가 열리고(새 창 아님), 상세의 쇼핑몰 버튼을 누르면 새 창 + 클릭 기록
    await page.getByRole('link', { name: `${linked} 자세히 보기` }).click();
    await expect(page).toHaveURL(/[?&]p=\d+/);
    const cta = page.getByRole('dialog').getByRole('link', { name: /에서 보기$/ });
    await expect(cta).toHaveAttribute('target', '_blank');
    const [popup, beacon] = await Promise.all([
      context.waitForEvent('page'),
      page.waitForRequest((r) => r.url().includes('/click?visitorKey=') && r.method() === 'POST'),
      cta.click()
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(`${baseURL}/design-system`);
    expect(beacon).toBeTruthy();

    await context.close();
  });

  test('학부모(휴대폰): 상세 시트를 손가락으로 끌어내리면 닫힌다 — 조금 끌다 놓으면 제자리로', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(publicPath);
    await page.getByRole('link', { name: `${linked} 자세히 보기` }).click();
    await expect(page).toHaveURL(/[?&]p=\d+/);

    const detail = page.getByRole('dialog', { name: linked });
    await expect(detail).toBeVisible();
    await page.waitForTimeout(400); // 시트가 올라오는 움직임이 끝나기를 기다린다
    const box = await detail.boundingBox();
    const start = { x: box.x + box.width / 2, y: box.y + 120 };

    // 천천히 조금(50px) 끌다 놓으면 닫히지 않고 제자리로 돌아온다
    await fingerSwipe(page, start, { x: start.x, y: start.y + 50 }, { steps: 10, delay: 50 });
    await page.waitForTimeout(400);
    await expect(detail).toBeVisible();
    expect((await detail.boundingBox()).y).toBeCloseTo(box.y, 0);
    await expect(page).toHaveURL(/[?&]p=\d+/);

    // 충분히 끌어내리면 닫히고, 카드에서 열었으므로 상점(?p= 없음)으로 돌아간다
    await fingerSwipe(page, start, { x: start.x, y: start.y + 320 });
    await expect(detail).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]p=/);
    await expect(page.getByRole('link', { name: `${linked} 자세히 보기` })).toBeVisible();
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

  // ── 2차: 사진 여러 장 · 자르기 · 상세 설명 · 상품 상세 (docs/recommended-shop/04-images-description.md) ──
  // 사진은 진짜로 올린다 — 서버를 가짜 저장소(e2e/fake-storage.mjs)에 물려 띄워야 돈다. 없으면 건너뛴다.

  test('선생님: 사진을 여러 장 고르고·붙여 넣고·자르고·순서를 바꿔 상세 설명과 함께 등록한다', async ({ page, request, baseURL }) => {
    const shop = await api(request, sessions.teacher, 'GET', '/api/shop');
    test.skip(!shop.body.storageReady, '사진 저장소가 없다 — e2e/fake-storage.mjs 를 띄우고 서버에 SUPABASE_URL 을 주면 돈다');

    await loginAs(page, sessions.teacher);
    await page.goto('/products');
    await page.locator('.ui-page-header').getByRole('button', { name: '상품' }).click();
    const dialog = page.getByRole('dialog', { name: '상품 등록' });
    await dialog.getByLabel('타이틀').fill(photos);
    await dialog.getByLabel('상세 설명').fill('6m 새틴 리본에 막대까지 와요.\n초등 저학년은 5m 를 추천해요.');
    await dialog.getByLabel('연결할 주소').fill(`${baseURL}/design-system`);

    // 가로로 긴 사진(왼쪽 빨강 · 오른쪽 파랑)과 세로로 긴 사진을 한 번에 고른다
    const wide = await makePng(page, 1600, 1000, ['#e53935', '#1e88e5']);
    const tall = await makePng(page, 800, 1200, ['#43a047']);
    await dialog.getByLabel('상품 사진 파일').setInputFiles([
      { name: 'wide.png', mimeType: 'image/png', buffer: wide },
      { name: 'tall.png', mimeType: 'image/png', buffer: tall }
    ]);
    await expect(dialog.getByTestId('shop-image-tile')).toHaveCount(2);
    await expect(dialog.getByAltText('사진 1 (대표)')).toHaveAttribute('src', /^blob:/);

    // 스크린샷처럼 이름 없는 노란 사진을 붙여 넣으면 맨 뒤에 붙는다
    // (진짜 클립보드에 쓰면 테스트를 돌리는 사람의 클립보드를 덮어쓰므로 붙여넣기 이벤트를 직접 보낸다)
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fdd835';
      ctx.fillRect(0, 0, 1200, 1200);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const data = new DataTransfer();
      data.items.add(new File([blob], '', { type: 'image/png' }));
      (document.activeElement || document.body).dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
    });
    await expect(dialog.getByTestId('shop-image-tile')).toHaveCount(3);
    await expect(dialog.getByText('3 / 10')).toBeVisible();

    // 가로 사진은 왼쪽(빨강)이 보이게 끌어서 자른다
    await dialog.getByRole('button', { name: '사진 1 자르기' }).click();
    const cropper = page.getByRole('dialog', { name: '사진 자르기' });
    const frame = cropper.getByRole('group', { name: /자를 부분/ });
    const box = await frame.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + box.width, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await cropper.getByRole('button', { name: '적용' }).click();
    await expect(dialog.getByAltText('사진 1 (대표)')).toHaveAttribute('style', /object-position: 0% 50%/);

    // 붙여 넣은 노란 사진을 맨 앞(대표)으로
    await dialog.getByRole('button', { name: '사진 3 앞으로' }).click();
    await dialog.getByRole('button', { name: '사진 2 앞으로' }).click();
    await expect(dialog.getByAltText('사진 1 (대표)')).toHaveAttribute('src', /^blob:/);

    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('tr', { hasText: photos })).toContainText('사진 3장');

    // 서버에는 정한 순서대로, 모두 정사각형으로 잘려 올라갔다 — 노랑(대표) · 빨강(왼쪽을 자른 가로 사진) · 초록
    const { body } = await api(request, sessions.teacher, 'GET', '/api/shop/products');
    const product = body.products.find((p) => p.title === photos);
    expect(product.description).toBe('6m 새틴 리본에 막대까지 와요.\n초등 저학년은 5m 를 추천해요.');
    expect(product.images).toHaveLength(3);
    const samples = await page.evaluate((urls) => Promise.all(urls.map((url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const [r, g, b] = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
        resolve({ w: img.naturalWidth, h: img.naturalHeight, r, g, b });
      };
      img.onerror = reject;
      img.src = url;
    }))), product.images.map((i) => i.url));
    samples.forEach((s) => expect(s.w).toBe(s.h));
    const [yellow, red, green] = samples;
    expect(yellow.r > 200 && yellow.g > 180 && yellow.b < 120).toBe(true);
    expect(red.r > 180 && red.b < 120).toBe(true);
    expect(green.g > 120 && green.r < 120).toBe(true);
  });

  test('학부모(데스크톱): 사진 비율이 달라도 카드 크기·가격 줄이 맞고, 상세에서 큰 사진 + 작은 사진으로 넘긴다', async ({ browser, request }) => {
    const shop = await api(request, sessions.teacher, 'GET', '/api/shop');
    test.skip(!shop.body.storageReady, '사진 저장소가 없다 — e2e/fake-storage.mjs 를 띄우고 서버에 SUPABASE_URL 을 주면 돈다');

    // 1차에 올린 사진처럼 정사각형이 아닌 사진을 화면을 거치지 않고 바로 붙인다.
    // 세로로 긴 사진이 칸을 밀어내 카드가 길어지던 문제(고치기 전 1,318px)가 다시 생기면 여기서 깨진다.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(publicPath);
    const tallPhoto = await makePng(page, 300, 1600, ['#8e24aa']);
    const { body } = await api(request, sessions.teacher, 'GET', '/api/shop/products');
    const simpleId = body.products.find((p) => p.title === simple).id;
    const uploaded = await request.fetch(`/api/shop/products/${simpleId}/images?filename=tall.png`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessions.teacher.token}`, 'Content-Type': 'image/png' },
      data: tallPhoto
    });
    expect(uploaded.status()).toBe(201);

    await page.reload();
    const photoCard = page.getByRole('link', { name: `${photos} 자세히 보기` });
    await expect(photoCard).toBeVisible();
    await expect(photoCard.getByLabel('사진 3장')).toBeVisible();
    await expect(photoCard).toContainText('6m 새틴 리본에 막대까지 와요.');
    await expect(page.getByRole('link', { name: `${simple} 자세히 보기` })).toBeVisible();

    // 사진 칸은 모두 같은 정사각형, 같은 줄 카드의 가격·도메인 줄은 같은 높이에 붙는다
    const boxes = await page.locator('.shop-product').evaluateAll((cards) => cards.map((card) => {
      const img = card.querySelector('.shop-product__img').getBoundingClientRect();
      const foot = card.querySelector('.shop-product__foot').getBoundingClientRect();
      return { top: Math.round(img.top), w: Math.round(img.width), h: Math.round(img.height), footBottom: Math.round(foot.bottom) };
    }));
    // 앞 테스트가 링크 상품을 숨겨 두었다 — 세로 사진·설명 없는 카드와 정사각형 사진·설명 있는 카드가 한 줄에 선다
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    boxes.forEach((b) => {
      expect(b.h).toBe(boxes[0].h);
      expect(Math.abs(b.w - b.h)).toBeLessThanOrEqual(1);
    });
    const firstRow = boxes.filter((b) => b.top === boxes[0].top);
    firstRow.forEach((b) => expect(b.footBottom).toBe(firstRow[0].footBottom));

    // 상세 — 제목 바로 아래 설명, 큰 사진 아래 작은 사진 3장, 누르면 그 사진이 큰 칸에
    await photoCard.click();
    const detail = page.getByRole('dialog', { name: photos });
    await expect(detail).toBeVisible();
    await expect(detail.locator('.shop-detail__title + .shop-detail__desc')).toHaveText(
      '6m 새틴 리본에 막대까지 와요.\n초등 저학년은 5m 를 추천해요.'
    );
    await expect(detail.getByRole('button', { name: /번째 사진 보기$/ })).toHaveCount(3);
    await expect(detail.locator('.shop-gallery__dots')).toBeHidden();
    await detail.getByRole('button', { name: '3번째 사진 보기' }).click();
    await expect(detail.getByText('3 / 3')).toBeVisible();
    await expect(detail.getByRole('button', { name: '다음 사진' })).toBeHidden();
    await page.keyboard.press('ArrowLeft');
    await expect(detail.getByText('2 / 3')).toBeVisible();

    // 닫으면 상점으로 — 주소의 ?p= 도 빠진다
    await detail.getByRole('button', { name: '닫기' }).click();
    await expect(detail).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]p=/);
    await context.close();
  });

  test('학부모(휴대폰): 상세는 바텀시트 — 밀어서 넘기고 점으로 위치를 보며, 뒤로 가기로 닫힌다', async ({ browser, request }) => {
    const shop = await api(request, sessions.teacher, 'GET', '/api/shop');
    test.skip(!shop.body.storageReady, '사진 저장소가 없다 — e2e/fake-storage.mjs 를 띄우고 서버에 SUPABASE_URL 을 주면 돈다');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto(publicPath);
    await page.getByRole('link', { name: `${photos} 자세히 보기` }).click();
    await expect(page).toHaveURL(/[?&]p=\d+/);

    const detail = page.getByRole('dialog', { name: photos });
    await expect(detail.getByText('1 / 3')).toBeVisible();
    await expect(detail.locator('.shop-gallery__thumbs')).toBeHidden();
    await expect(detail.getByRole('button', { name: /번째 사진$/ })).toHaveCount(3);

    // 손가락으로 민 것처럼 가로 스크롤 → 점·숫자가 따라온다
    await detail.locator('.shop-gallery__track').evaluate((track) => track.scrollTo({ left: track.clientWidth, behavior: 'instant' }));
    await expect(detail.getByText('2 / 3')).toBeVisible();
    await expect(detail.getByRole('button', { name: '2번째 사진' })).toHaveAttribute('aria-current', 'true');
    await expect(detail.getByRole('link', { name: /에서 보기$/ })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    // 진짜 손가락으로 사진을 옆으로 밀면 다음 사진 — 끌어내려 닫기가 가로 넘기기를 가로채지 않는다
    const track = await detail.locator('.shop-gallery__track').boundingBox();
    const middle = track.y + track.height / 2;
    await fingerSwipe(page, { x: track.x + track.width * 0.8, y: middle }, { x: track.x + track.width * 0.15, y: middle + 12 });
    await expect(detail.getByText('3 / 3')).toBeVisible();
    await expect(detail).toBeVisible();

    await page.goBack();
    await expect(detail).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]p=/);
    await context.close();
  });

  // 손잡이를 끌어 순서 바꾸기 — 데스크톱은 표의 행, 휴대폰은 카드. 맨 위 상품을 맨 아래로 끌어 놓고 서버 순서를 본다.
  for (const [device, viewport] of [['데스크톱', { width: 1280, height: 900 }], ['휴대폰', { width: 390, height: 844 }]]) {
    test(`선생님(${device}): 손잡이를 끌어 놓으면 그 순서로 저장된다`, async ({ browser, request }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await loginAs(page, sessions.teacher);
      await page.goto('/products');

      const rows = page.locator('.shop-list tbody tr');
      await expect(rows.first()).toBeVisible();
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(2);

      const handle = rows.first().getByRole('button', { name: /순서 — 끌어서/ });
      const movedId = Number(await handle.getAttribute('data-grip-id'));
      const last = rows.nth(count - 1);
      await last.scrollIntoViewIfNeeded();
      await handle.scrollIntoViewIfNeeded();
      const from = await handle.boundingBox();
      const to = await last.boundingBox();

      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 10 });
      await expect(rows.first()).toHaveAttribute('data-dragging', 'true');
      await expect(last).toHaveAttribute('data-drop', 'after');

      const saved = page.waitForResponse((r) => r.url().endsWith('/api/shop/products/order') && r.request().method() === 'PUT');
      await page.mouse.up();
      expect((await saved).status()).toBe(200);
      await expect(rows.nth(count - 1).getByRole('button', { name: /순서 — 끌어서/ })).toHaveAttribute('data-grip-id', String(movedId));

      const { body } = await api(request, sessions.teacher, 'GET', '/api/shop/products');
      expect(body.products.at(-1).id).toBe(movedId);
      await context.close();
    });
  }

  // ── 3차: 상품 예약 (docs/recommended-shop/05-reservations.md) ──

  const reserver = `e2e ${run.slice(-5)}`;

  test('선생님: 상품 수정에서 "예약 받기"를 켜면 상품 표에 예약 배지가 붙는다', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/products');
    const row = page.locator('tr', { hasText: simple });
    await row.getByRole('button', { name: `${simple} 수정` }).click();

    const dialog = page.getByRole('dialog', { name: '상품 수정' });
    await dialog.locator('.ui-switch', { hasText: '예약 받기' }).click();
    await expect(dialog.getByRole('switch', { name: '예약 받기' })).toBeChecked();
    await dialog.getByRole('button', { name: '저장' }).click();
    await expect(dialog).toBeHidden();
    await expect(row.locator('.ui-badge', { hasText: '예약' })).toBeVisible();
  });

  test('학부모(휴대폰·로그인 없음): 상품 상세 → [예약하기] → 이름·전화번호·달력 날짜로 예약을 요청한다', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(publicPath);

    // 사진도 링크도 없는 상품이지만 예약을 받으니 누를 수 있다
    const card = page.getByRole('link', { name: `${simple} 자세히 보기` });
    await expect(card.getByText('예약 가능')).toBeVisible();
    await card.click();

    const detail = page.getByRole('dialog', { name: simple });
    await detail.getByRole('button', { name: '예약하기' }).click();

    const form = page.getByRole('dialog', { name: '예약하기' });
    await form.getByLabel('이름').fill(reserver);
    await form.getByLabel('전화번호').fill('01012345678');
    await expect(form.getByLabel('전화번호')).toHaveValue('010-1234-5678');

    // 다음 달 15일 — 오늘이 언제든 180일 안이다
    await form.getByRole('button', { name: '다음 달' }).click();
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    await form.getByRole('button', { name: new RegExp(`^${next.getMonth() + 1}월 15일 `) }).click();
    await expect(form.getByText(new RegExp(`${next.getMonth() + 1}월 15일 \\(.\\)에 예약해요`))).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/reservations') && r.request().method() === 'POST'),
      form.getByRole('button', { name: '예약 요청 보내기' }).click()
    ]);
    expect(response.status()).toBe(201);

    const done = page.getByRole('dialog', { name: '예약을 요청했어요' });
    await expect(done).toContainText(reserver);
    await expect(done).toContainText('010-1234-5678');
    await done.getByRole('button', { name: '확인' }).click();
    await expect(done).toBeHidden();
    await context.close();
  });

  test('선생님: 예약 탭에 들어온 요청을 확정하면 저장되고, 다시 취소로 바꿀 수 있다', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/products');
    await expect(page.getByRole('tab', { name: /^예약 \(\d+\)$/ })).toBeVisible();
    await page.getByRole('tab', { name: /^예약/ }).click();
    await expect(page).toHaveURL(/\/products\/reservations$/);

    const row = page.locator('tr', { hasText: reserver });
    await expect(row).toContainText(simple);
    await expect(row.getByRole('link', { name: '010-1234-5678' })).toHaveAttribute('href', 'tel:01012345678');
    await expect(row.getByRole('button', { name: '요청' })).toHaveAttribute('aria-pressed', 'true');

    await row.getByRole('button', { name: '확정' }).click();
    await expect(page.getByRole('status')).toContainText('예약을 확정했어요');
    await page.reload();
    await expect(page.locator('tr', { hasText: reserver }).getByRole('button', { name: '확정' })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('tr', { hasText: reserver }).getByRole('button', { name: '취소' }).click();
    await expect(page.getByRole('status')).toContainText('예약을 취소했어요');
    await expect(page.locator('tr', { hasText: reserver })).toHaveAttribute('data-status', 'cancelled');
  });

  test('예약 API — 예약을 받지 않는 상품은 409, 학부모 토큰으로는 예약 목록·상태 변경을 쓸 수 없다', async ({ request }) => {
    const { body } = await api(request, sessions.teacher, 'GET', '/api/shop/products');
    const notReservable = body.products.find((p) => !p.isReservable);
    const publicId = publicPath.split('/').pop();
    const res = await request.post(`/api/shop/public/${publicId}/products/${notReservable.id}/reservations`, {
      data: { name: '김예림', phone: '01012345678', date: '2099-01-01' }
    });
    expect(res.status()).toBe(409);

    expect((await api(request, sessions.parent, 'GET', '/api/shop/reservations')).status).toBe(403);
    expect((await api(request, sessions.parent, 'PATCH', '/api/shop/reservations/1/status', { status: 'confirmed' })).status).toBe(403);
  });

  test('학부모 토큰으로는 선생님 API 를 쓸 수 없다', async ({ request }) => {
    const res = await api(request, sessions.parent, 'GET', '/api/shop');
    expect(res.status).toBe(403);
  });
});
