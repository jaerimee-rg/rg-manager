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
