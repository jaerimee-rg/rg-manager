import { expect } from '@playwright/test';

/**
 * 카카오 로그인은 자동화할 수 없으므로, 서버가 발급한 것과 같은 토큰을 넣어
 * "로그인한 뒤"의 화면부터 검증한다. (토큰은 e2e/setup.mjs 가 만들어 둔다)
 */
export const loginAs = async (page, session) => {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, session);
};

/**
 * 세션을 **한 번만** 넣는다. `loginAs` 는 init script 라 페이지를 새로 열 때마다 다시 주입되므로,
 * 앱이 세션을 통째로 갈아 끼우고 전체 새로고침하는 흐름(다른 계정으로 로그인 → 돌아가기)에는
 * 이쪽을 써야 한다 — 아니면 새로고침마다 원래 세션으로 되돌아가 버린다.
 */
export const loginOnceAs = async (page, session) => {
  await page.goto('/login');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('impersonator');
  }, session);
};

export const api = async (request, session, method, path, body) => {
  const response = await request.fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json'
    },
    data: body
  });
  return { status: response.status(), body: await response.json().catch(() => null) };
};

export const expectVisible = async (locator) => {
  await expect(locator).toBeVisible();
};
