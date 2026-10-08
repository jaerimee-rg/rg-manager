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

/**
 * Drive 썸네일을 세로로 긴 그림(400×711 — 휴대폰으로 찍은 영상 비율)으로 바꿔 끼운다.
 * 픽스처의 파일 id 는 Drive 에 없어서 진짜 썸네일이 안 뜨는데, 미리보기 칸이 세로 사진에 늘어나
 * 글자를 덮는지(2026-10-08 학부모 사진 탭) 보려면 세로 그림이 실제로 그려져야 한다.
 */
export const stubPortraitThumbnails = (page) =>
  page.route('https://drive.google.com/thumbnail**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="711"><rect width="400" height="711" fill="#8a8"/></svg>'
  }));

/** 얼굴이 없는 64×64 PNG — 브라우저가 읽을 수는 있는 사진 (얼굴 등록 · 얼굴 찾기 테스트) */
export const FACELESS_PNG = {
  name: 'no-face.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAu0lEQVR42u3PBUEYAAAAQWLj7u6y4bLh+kCFj0UECvw1uAEZlCEZlhEZlTEZlwmZlCmZlhmZlTmZlwVZlCVZlhVZlTVZlw3ZlC3Zlh3ZlT3ZlwM5lCP5I3/lWE7kVM7kXC7kUq7kWm7kn/yXW7mTe3mQR3mSZ3mRV3mTd/kQ5FO+5HugQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKPBb4Acwdznwjg4iTgAAAABJRU5ErkJggg==',
    'base64'
  )
};
