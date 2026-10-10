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

/** 세로로 긴 그림(400×711 — 휴대폰으로 찍은 영상 비율) */
export const PORTRAIT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="711"><rect width="400" height="711" fill="#8a8"/></svg>';

/**
 * Drive 사진(lh3 — 썸네일과 뷰어의 큰 사진)을 세로로 긴 그림으로 바꿔 끼운다.
 * 픽스처의 파일 id 는 Drive 에 없어서 진짜 썸네일이 안 뜨는데, 미리보기 칸이 세로 사진에 늘어나
 * 글자를 덮는지(2026-10-08 학부모 사진 탭) 보려면 세로 그림이 실제로 그려져야 한다.
 * (진짜 정사각형 썸네일은 Drive 가 잘라 주지만, 칸은 어떤 비율이 와도 넘치지 않아야 한다)
 */
export const stubPortraitThumbnails = (page) =>
  page.route('https://lh3.googleusercontent.com/d/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: PORTRAIT_SVG
  }));

/**
 * 손가락으로 from → to 를 민다. Chromium 의 진짜 터치 입력(CDP)이라 passive·기본 동작 처리까지 브라우저가 한다.
 * page.touchscreen 은 탭만 있어서 따로 둔다. 컨텍스트가 hasTouch 여야 한다.
 */
export const swipeTouch = async (page, from, to, { steps = 8 } = {}) => {
  const cdp = await page.context().newCDPSession(page);
  const at = (t) => [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }];
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
};

/**
 * 두 손가락으로 벌리기(오므리기) — center 를 가운데로 두 손가락 사이를 fromGap → toGap(px) 으로 바꾼다. 진짜 터치 입력(CDP)이라
 * 브라우저가 포인터 이벤트 두 개(pointerId 가 다르다)로 바꿔 보낸다. 컨텍스트가 hasTouch 여야 한다.
 */
export const pinchTouch = async (page, center, fromGap, toGap, { steps = 8 } = {}) => {
  const cdp = await page.context().newCDPSession(page);
  const at = (t) => {
    const half = (fromGap + (toGap - fromGap) * t) / 2;
    return [{ x: center.x - half, y: center.y, id: 1 }, { x: center.x + half, y: center.y, id: 2 }];
  };
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
};

/**
 * DateField(앱 달력 날짜 칸)에서 iso('YYYY-MM-DD') 를 고른다 — 칸을 열고, 그 달까지 넘긴 뒤 그 날을 누른다.
 * 처음 보이는 달은 지금 값(보통 오늘)이라 몇 달을 넘길지는 달력 제목을 읽어 정한다. name 은 칸 이름의 앞부분(예: '날짜').
 */
export const pickDate = async (scope, name, iso) => {
  const field = scope.getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await field.getAttribute('aria-expanded')) !== 'true') await field.click();
  const calendar = scope.locator(`[id="${await field.getAttribute('aria-controls')}"]`);
  const [year, month, day] = iso.split('-').map(Number);
  for (let guard = 0; guard < 1200; guard += 1) {
    const [, shownYear, shownMonth] = (await calendar.locator('.ui-calendar__title').textContent()).match(/(\d+)년 (\d+)월/).map(Number);
    const diff = (year - shownYear) * 12 + (month - shownMonth);
    if (diff === 0) break;
    await calendar.getByRole('button', { name: diff < 0 ? '이전 달' : '다음 달' }).click();
    await expect(calendar.locator('.ui-calendar__title')).not.toHaveText(`${shownYear}년 ${shownMonth}월`);
  }
  await calendar.getByRole('button', { name: new RegExp(`^${month}월 ${day}일 `) }).click();
  await expect(field).toHaveAttribute('aria-expanded', 'false');
};

/** 얼굴이 없는 64×64 PNG — 브라우저가 읽을 수는 있는 사진 (얼굴 등록 · 얼굴 찾기 테스트) */
export const FACELESS_PNG = {
  name: 'no-face.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAu0lEQVR42u3PBUEYAAAAQWLj7u6y4bLh+kCFj0UECvw1uAEZlCEZlhEZlTEZlwmZlCmZlhmZlTmZlwVZlCVZlhVZlTVZlw3ZlC3Zlh3ZlT3ZlwM5lCP5I3/lWE7kVM7kXC7kUq7kWm7kn/yXW7mTe3mQR3mSZ3mRV3mTd/kQ5FO+5HugQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKFCgQIECBQoUKPBb4Acwdznwjg4iTgAAAABJRU5ErkJggg==',
    'base64'
  )
};
