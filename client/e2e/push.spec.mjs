import { test, expect, chromium } from '@playwright/test';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loginAs, api } from './helpers.mjs';

/**
 * 새 일정·사진 브라우저 알림 (학부모 내 정보 › 새 일정·사진 알림 · 이벤트 폼 › 학부모에게 알림 보내기 ·
 * 사진 폴더를 처음 공개할 때).
 *
 * - 서버에 VAPID 키가 없으면(`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) 학부모 카드가 없으므로 그 테스트는 skip 한다.
 *   키는 `cd server && npx web-push generate-vapid-keys` 로 만들어 서버를 띄울 때 넘긴다.
 * - Playwright 의 기본 창은 시크릿 모드라 크롬이 진짜 구독을 막는다 — 화면 흐름은 PushManager 를 흉내 내서 보고,
 *   서비스 워커가 알림을 띄우는지는 CDP 로 푸시 메시지를 직접 넣어 본다.
 * - 구글 푸시 서비스를 실제로 거치는 왕복은 네트워크가 필요해 `E2E_REAL_PUSH=1` 일 때만 돈다.
 */
const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));
const run = `${sessions.stamp}-${Math.random().toString(36).slice(2, 7)}`;
const SWITCH_LABEL = '이 기기로 새 일정·사진 알림 받기';

const pushConfigured = async (request) =>
  (await api(request, sessions.parentMulti, 'GET', '/api/parent/push')).body?.configured === true;

/** 크롬이 주는 것과 같은 모양의 구독 — 서버 검증(주소 · 키 길이)만 통과하면 된다 */
const fakeSubscription = () => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${run}`;
  return {
    endpoint,
    keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'k'.repeat(22) }
  };
};

/**
 * 실제 푸시 서비스 왕복용 — 프로필이 있는 크롬(시크릿 창은 크롬이 구독을 막는다)에서 학부모로 알림을 켜고 run(page) 을 돌린 뒤 끈다.
 * run 이 돌려준 값을 그대로 돌려준다.
 */
const withRealPushParent = async (baseURL, run) => {
  const profile = mkdtempSync(path.join(tmpdir(), 'rg-push-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', baseURL });
  try {
    await context.grantPermissions(['notifications'], { origin: new URL(baseURL).origin });
    const page = context.pages()[0] || await context.newPage();
    await loginAs(page, sessions.parentMulti);
    await page.goto('/parent/settings');

    const card = page.getByTestId('event-push-card');
    await expect(card.getByRole('switch', { name: SWITCH_LABEL })).toBeEnabled();
    await card.getByText(SWITCH_LABEL).click();
    await expect(card.getByRole('switch', { name: SWITCH_LABEL })).toBeChecked({ timeout: 20_000 });

    await run(page);

    await card.getByText(SWITCH_LABEL).click();
    await expect(card.getByRole('switch', { name: SWITCH_LABEL })).not.toBeChecked();
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
};

/** 이 브라우저의 서비스 워커가 띄운 알림들 — { title, url } */
const shownNotifications = (page) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  return (await registration.getNotifications()).map((n) => ({ title: n.title, url: n.data && n.data.url }));
});

const stubPushManager = (page, subscription) => page.addInitScript((sub) => {
  let current = null;
  const make = () => ({
    endpoint: sub.endpoint,
    toJSON: () => ({ endpoint: sub.endpoint, expirationTime: null, keys: sub.keys }),
    unsubscribe: async () => { current = null; return true; }
  });
  window.Notification.requestPermission = async () => 'granted';
  Object.defineProperty(window.Notification, 'permission', { get: () => 'granted', configurable: true });
  window.PushManager.prototype.subscribe = async function subscribe() { current = make(); return current; };
  window.PushManager.prototype.getSubscription = async function getSubscription() { return current; };
}, subscription);

test.describe('새 일정 알림 — 학부모', () => {
  test('앱이 서비스 워커와 manifest 를 제 형식으로 내준다 (SPA 폴백 HTML 이 아니다)', async ({ request, page }) => {
    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    expect(sw.headers()['content-type']).toMatch(/javascript/);
    expect(await sw.text()).toContain("addEventListener('push'");

    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: 'JR 리듬체조', display: 'standalone', start_url: '/' });

    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  });

  test('내 정보에서 이 기기의 알림을 켜고 끈다', async ({ page, request }) => {
    test.skip(!(await pushConfigured(request)), '서버에 VAPID 키가 없으면 알림 카드가 없다');

    const subscription = fakeSubscription();
    await stubPushManager(page, subscription);
    await loginAs(page, sessions.parentMulti);
    await page.goto('/parent/settings');

    const card = page.getByTestId('event-push-card');
    await expect(card.getByRole('heading', { name: '새 일정·사진 알림' })).toBeVisible();
    const toggle = card.getByRole('switch', { name: SWITCH_LABEL });
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();

    // 진짜 서비스 워커가 올라간다 — Express 가 /sw.js 를 스크립트로 내주지 않으면 여기서 실패한다
    const script = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.scriptURL;
    });
    expect(script).toMatch(/\/sw\.js$/);

    const saved = page.waitForResponse((r) => r.url().endsWith('/api/parent/push/subscriptions') && r.request().method() === 'POST');
    await card.getByText(SWITCH_LABEL).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(JSON.parse(response.request().postData())).toMatchObject({ endpoint: subscription.endpoint, keys: subscription.keys });
    await expect(toggle).toBeChecked();
    await expect(card.getByRole('status')).toContainText('알림을 켰어요');

    const removed = page.waitForResponse((r) => r.url().endsWith('/api/parent/push/subscriptions') && r.request().method() === 'DELETE');
    await card.getByText(SWITCH_LABEL).click();
    expect(await (await removed).json()).toEqual({ removed: true });
    await expect(toggle).not.toBeChecked();
    await expect(card.getByRole('status')).toContainText('이 기기의 알림을 껐어요');
  });

  test('푸시 서비스 주소가 아니면 서버가 받지 않는다', async ({ request }) => {
    test.skip(!(await pushConfigured(request)), '서버에 VAPID 키가 없으면 구독을 받지 않는다(503)');

    const res = await api(request, sessions.parentMulti, 'POST', '/api/parent/push/subscriptions', {
      endpoint: 'https://example.com/hook', keys: fakeSubscription().keys
    });
    expect(res.status).toBe(400);
  });

  test('선생님은 이 API 를 쓸 수 없다', async ({ request }) => {
    const res = await api(request, sessions.teacher, 'GET', '/api/parent/push');
    expect(res.status).toBe(403);
  });

  test('서비스 워커가 받은 푸시를 알림으로 띄우고, 누르면 열 이벤트 주소를 담는다', async ({ baseURL }) => {
    // 알림 권한은 새 헤드리스(채널 chromium)에서만 실제로 허용된다 — 기본 헤드리스 셸은 늘 'denied'
    const real = await chromium.launch({ channel: 'chromium' }).catch(() => null);
    test.skip(!real, '채널 chromium 브라우저가 없다 (npx playwright install chromium)');

    try {
      const context = await real.newContext({ baseURL });
      await context.grantPermissions(['notifications'], { origin: new URL(baseURL).origin });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const registrations = [];
      cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => registrations.push(...e.registrations));
      await cdp.send('ServiceWorker.enable');

      await page.goto('/login');
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      });
      await expect.poll(() => registrations.find((r) => r.scopeURL.startsWith(new URL(baseURL).origin))).toBeTruthy();
      const { registrationId } = registrations.find((r) => r.scopeURL.startsWith(new URL(baseURL).origin));

      await cdp.send('ServiceWorker.deliverPushMessage', {
        origin: new URL(baseURL).origin,
        registrationId,
        data: JSON.stringify({
          web_push: 8030,
          notification: {
            title: `새 일정 · e2e ${run}`, body: '11월 7일(토) 10:00 · 한강공원', tag: 'event-e2e',
            navigate: 'https://evil.example/parent/events/42'
          }
        })
      });

      await expect.poll(async () => page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return (await registration.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url }));
      })).toEqual([{
        title: `새 일정 · e2e ${run}`,
        body: '11월 7일(토) 10:00 · 한강공원',
        tag: 'event-e2e',
        // 다른 사이트 주소가 와도 이 앱 안의 같은 경로만 연다
        url: `${new URL(baseURL).origin}/parent/events/42`
      }]);
      await context.close();
    } finally {
      await real.close();
    }
  });

  test('실제 푸시 서비스 왕복 — 켜고, 선생님이 알림을 보내면 이 브라우저에 뜬다', async ({ baseURL, request }) => {
    test.skip(process.env.E2E_REAL_PUSH !== '1', '구글 푸시 서비스를 거치므로 E2E_REAL_PUSH=1 일 때만');
    test.skip(!(await pushConfigured(request)), '서버에 VAPID 키가 없다');
    // 새 프로필이 처음 푸시 서비스에 붙을 때는 전달이 수십 초 늦기도 한다
    test.setTimeout(90_000);

    await withRealPushParent(baseURL, async (page) => {
      const title = `e2e 실제 푸시 ${run}`;
      const created = await api(request, sessions.teacher, 'POST', '/api/events', {
        type: 'special', title, date: '2026-11-07', startTime: '10:00', location: '한강공원', notifyParents: true
      });
      expect(created.status).toBe(201);
      expect(created.body.notification.sent).toBeGreaterThanOrEqual(1);

      await expect.poll(async () => (await shownNotifications(page)).map((n) => n.title), { timeout: 60_000 })
        .toContain(`새 일정 · ${title}`);
    });
  });
});

test.describe('새 일정 알림 — 선생님', () => {
  test('이벤트 폼의 [학부모에게 알림 보내기] 로 저장하면 알림을 요청하고 목록에서 결과를 알려 준다', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/events/new');

    const notify = page.getByLabel('학부모에게 알림 보내기');
    await expect(notify).toBeChecked();   // 새 이벤트는 켜진 채로 시작한다

    // 공개를 끄면 잠기고, 다시 켜면 풀린다
    await page.getByText('학부모에게 공개', { exact: true }).click();
    await expect(notify).toBeDisabled();
    await expect(page.getByText('공개해야 알림을 보낼 수 있어요')).toBeVisible();
    await page.getByText('학부모에게 공개', { exact: true }).click();
    await expect(notify).toBeEnabled();

    const title = `e2e 알림 일정 ${run}`;
    await page.getByRole('button', { name: /스페셜/ }).click();
    await page.getByLabel('이벤트 이름').fill(title);
    await page.getByLabel('날짜', { exact: false }).first().fill('2026-11-28');
    await page.getByLabel('장소').fill('e2e 한강공원');

    const saved = page.waitForResponse((r) => r.url().endsWith('/api/events') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    const response = await saved;
    expect(JSON.parse(response.request().postData()).notifyParents).toBe(true);
    const body = await response.json();
    expect(body.notification).toBeTruthy();

    await expect(page).toHaveURL(/\/events$/);
    await expect(page.locator('tr', { hasText: title }).first()).toBeVisible();
    // 서버 설정·구독 수에 따라 문구가 다르다 — 어느 경우든 알림 결과를 한 줄로 알려 준다
    await expect(page.getByRole('status')).toHaveText(
      /명에게 알림을 보냈어요|알림을 켠 학부모가 아직 없어요|알림을 보내지 못했어요|알림 기능이 아직 준비되지 않아/
    );
  });

  test('수정 화면은 체크가 꺼진 채로 열리고, 그대로 저장하면 알리지 않는다', async ({ page, request }) => {
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'special', title: `e2e 알림 수정 ${run}`, date: '2026-11-29', location: 'e2e 체육관'
    });
    expect(created.status).toBe(201);
    expect(created.body.notification).toBeUndefined();   // 체크 없이 만든 이벤트는 알리지 않는다

    await loginAs(page, sessions.teacher);
    await page.goto('/events');
    const row = page.locator('tr', { hasText: `e2e 알림 수정 ${run}` }).first();
    await row.getByRole('button', { name: '수정' }).click();
    await expect(page.getByRole('heading', { name: '이벤트 수정' })).toBeVisible();
    await expect(page.getByLabel('학부모에게 알림 보내기')).not.toBeChecked();

    const saved = page.waitForResponse((r) => /\/api\/events\/\d+$/.test(r.url()) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    const response = await saved;
    expect(JSON.parse(response.request().postData()).notifyParents).toBe(false);
    expect((await response.json()).notification).toBeUndefined();
    await expect(page).toHaveURL(/\/events$/);
  });
});

test.describe('새 사진 알림 — 선생님이 사진 폴더를 처음 공개할 때', () => {
  // 서버 설정·구독 수에 따라 문구가 다르다 — 어느 경우든 알림 결과를 공개 알림 줄에 함께 보인다
  const NOTIFY_RESULT = /명에게 알림을 보냈어요|알림을 켠 학부모가 아직 없어요|알림을 보내지 못했어요|알림 기능이 아직 준비되지 않아/;

  test('처음 공개하면 학부모 알림을 요청하고 결과를 알려 준다 — 비공개로 돌렸다가 다시 공개하면 보내지 않는다', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto(`/photos/${sessions.album.pushFolderEventId}`);

    const panel = page.getByLabel('학부모 공개');
    await expect(panel.locator('.ui-publish__state')).toHaveText('비공개');
    await expect(panel.getByText('누르면 사진 탭에 바로 나타나요. 알림을 켠 학부모에게 새 사진 알림도 가요.')).toBeVisible();

    const isPatch = (r) => r.url().endsWith(`/api/events/${sessions.album.pushFolderEventId}/album`) && r.request().method() === 'PATCH';
    let saved = page.waitForResponse(isPatch);
    await panel.getByRole('button', { name: '학부모에게 공개' }).click();
    const first = await (await saved).json();
    expect(first.published).toBe(true);
    expect(first.notification).toBeTruthy();
    await expect(page.locator('.ui-toast')).toContainText('학부모에게 공개했어요 · ');
    await expect(page.locator('.ui-toast')).toHaveText(NOTIFY_RESULT);
    await expect(panel.locator('.ui-publish__state')).toHaveText('공개 중');

    // 비공개로 돌리면 — 이미 한 번 공개했으니 알림 안내가 사라진다
    await panel.getByRole('button', { name: '비공개로 전환' }).click();
    await expect(panel.locator('.ui-publish__state')).toHaveText('비공개');
    await expect(panel.getByText('누르면 사진 탭에 바로 나타나요.', { exact: true })).toBeVisible();

    saved = page.waitForResponse(isPatch);
    await panel.getByRole('button', { name: '학부모에게 공개' }).click();
    const again = await (await saved).json();
    expect(again.published).toBe(true);
    expect(again.notification).toBeUndefined();
    await expect(page.locator('.ui-toast')).toHaveText('학부모에게 공개했어요');
  });

  test('실제 푸시 서비스 왕복 — 사진 폴더를 처음 공개하면 이 브라우저에 "새 사진" 알림이 뜨고, 누르면 그 폴더가 열린다', async ({ baseURL, request }) => {
    test.skip(process.env.E2E_REAL_PUSH !== '1', '구글 푸시 서비스를 거치므로 E2E_REAL_PUSH=1 일 때만');
    test.skip(!(await pushConfigured(request)), '서버에 VAPID 키가 없다');
    test.setTimeout(90_000);
    const id = sessions.album.realPushFolderEventId;

    await withRealPushParent(baseURL, async (page) => {
      const published = await api(request, sessions.teacher, 'PATCH', `/api/events/${id}/album`, { published: true });
      expect(published.status).toBe(200);
      expect(published.body.notification.sent).toBeGreaterThanOrEqual(1);

      await expect.poll(async () => shownNotifications(page), { timeout: 60_000 }).toContainEqual({
        title: `새 사진 · ${sessions.album.realPushFolderTitle}`,
        url: `${baseURL}/parent/photos/${id}`
      });
    });
  });
});
