import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api, stubPortraitThumbnails, FACELESS_PNG } from './helpers.mjs';
import { FAKE_PLACE, stubKakaoMaps } from './kakao-fakes.mjs';

const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));
// 같은 DB 에 여러 번 돌려도 서로 부딪히지 않도록 실행마다 다른 이름을 쓴다
const run = `${sessions.stamp}-${Math.random().toString(36).slice(2, 7)}`;
const title = `e2e 대회 ${run}`;

test.describe('선생님 — 이벤트 관리', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, sessions.teacher);
  });

  test('이벤트 관리 메뉴로 들어가 대회를 등록하고, 목록에 장소까지 보인다', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: '이벤트 관리' })).toBeVisible();

    // 디자인 시스템 도입(#3) 후 버튼은 <Button icon="plus">이벤트</Button> 라 접근성 이름에 '+' 가 없다.
    // 목록이 비면 EmptyState 에도 같은 이름의 버튼이 생기므로 헤더 쪽을 지목한다.
    await page.locator('.ui-page-header').getByRole('button', { name: '이벤트' }).click();
    await expect(page.getByRole('heading', { name: '이벤트 등록' })).toBeVisible();

    await page.getByLabel('이벤트 이름').fill(title);
    await page.getByLabel('날짜', { exact: false }).first().fill('2026-11-21');
    await page.getByLabel('장소').fill('e2e 체육관');
    await page.getByLabel('학부모 안내').fill('종목을 골라 주세요.');

    // 종목 프리셋으로 옵션을 채운다
    await page.getByRole('button', { name: /종목 6개 불러오기/ }).click();
    await expect(page.getByRole('textbox', { name: '옵션 1' })).toHaveValue('맨손');

    await page.getByRole('button', { name: '저장', exact: true }).click();

    await expect(page).toHaveURL(/\/events$/);
    const row = page.locator('tr', { hasText: title }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('e2e 체육관');
    await expect(row).toContainText('11/21');
  });

  test('휴관일은 장소·옵션 없이 등록된다', async ({ page }) => {
    await page.goto('/events/new');

    await page.getByRole('button', { name: /휴관일/ }).click();

    // 휴관일에는 시간·장소·옵션·접수 설정이 없어야 한다 (날짜만 받는다)
    await expect(page.getByLabel(/^시간/)).toHaveCount(0);
    await expect(page.getByLabel('장소')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '새 옵션' })).toHaveCount(0);
    await expect(page.getByText('접수 받기')).toHaveCount(0);

    // 날짜·종료일은 남는다 (며칠짜리 휴관)
    await expect(page.getByLabel(/^날짜/)).toHaveCount(1);
    await expect(page.getByLabel(/^종료일/)).toHaveCount(1);

    await page.getByLabel('이벤트 이름').fill(`e2e 휴관 ${run}`);
    await page.getByLabel('날짜', { exact: false }).first().fill('2026-12-24');
    await page.getByRole('button', { name: '저장', exact: true }).click();

    await expect(page.locator('tr', { hasText: `e2e 휴관 ${run}` }).first()).toBeVisible();
  });

  test('주소 검색으로 장소를 고르면 아래에 지도가 떠서 확인하고, 주소·좌표가 함께 저장된다', async ({ page, request }) => {
    await stubKakaoMaps(page);
    const placeTitle = `e2e 주소 ${run}`;
    await page.goto('/events/new');

    await page.getByLabel('이벤트 이름').fill(placeTitle);
    await page.getByLabel('날짜', { exact: false }).first().fill('2026-11-22');

    // 장소 이름을 비워 둔 채 주소를 고르면 건물명이 장소 이름으로 채워진다
    await page.getByRole('button', { name: '주소 검색' }).click();
    const dialog = page.getByRole('dialog', { name: '주소 검색' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '가짜 주소 고르기' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByLabel('장소')).toHaveValue(FAKE_PLACE.placeName);
    await expect(page.getByTestId('event-address')).toHaveText(FAKE_PLACE.address);
    const map = page.getByRole('img', { name: /위치 지도/ });
    await expect(map).toBeVisible();
    await expect(map).toContainText(`가짜 지도 ${FAKE_PLACE.latitude},${FAKE_PLACE.longitude}`);
    await expect(page.getByRole('button', { name: '주소 변경' })).toBeVisible();

    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/events$/);

    const events = await api(request, sessions.teacher, 'GET', '/api/events?includePast=true');
    const saved = events.body.find((e) => e.title === placeTitle);
    expect(saved).toMatchObject({
      location: FAKE_PLACE.placeName,
      address: FAKE_PLACE.address,
      latitude: FAKE_PLACE.latitude,
      longitude: FAKE_PLACE.longitude
    });

    // 다시 열면 저장된 주소와 지도가 그대로 보이고, 지우면 주소 없이 저장된다
    await page.locator('tr', { hasText: placeTitle }).first().getByRole('button', { name: '수정' }).click();
    await expect(page.getByTestId('event-address')).toHaveText(FAKE_PLACE.address);
    await expect(page.getByRole('img', { name: /위치 지도/ })).toBeVisible();
    await page.getByRole('button', { name: '주소 지우기' }).click();
    await expect(page.getByRole('img', { name: /위치 지도/ })).toHaveCount(0);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/events$/);

    const after = await api(request, sessions.teacher, 'GET', `/api/events/${saved.id}`);
    expect(after.body).toMatchObject({ location: FAKE_PLACE.placeName, address: null, latitude: null, longitude: null });
  });

  test('지도 키가 없는 서버에서도 주소는 고를 수 있고, 지도 대신 안내가 나온다', async ({ page }) => {
    await stubKakaoMaps(page, { key: null });
    await page.goto('/events/new');

    await page.getByLabel('장소').fill('e2e 체육관');
    await page.getByRole('button', { name: '주소 검색' }).click();
    // 이미 적은 장소 이름으로 바로 검색한다
    await expect(page.getByRole('button', { name: '가짜 주소 고르기' })).toHaveAttribute('data-q', 'e2e 체육관');
    await page.getByRole('button', { name: '가짜 주소 고르기' }).click();

    await expect(page.getByLabel('장소')).toHaveValue('e2e 체육관');
    await expect(page.getByTestId('event-address')).toHaveText(FAKE_PLACE.address);
    await expect(page.getByRole('img', { name: /위치 지도/ })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: '지도 키가 아직 설정되지 않아' })).toBeVisible();
  });

  test('지도 설정 API 는 로그인한 선생님·학부모 모두 읽고, 비로그인은 401', async ({ request }) => {
    const asTeacher = await api(request, sessions.teacher, 'GET', '/api/maps/config');
    expect(asTeacher.status).toBe(200);
    expect(asTeacher.body).toHaveProperty('kakaoJsKey');

    const asParent = await api(request, sessions.parent, 'GET', '/api/maps/config');
    expect(asParent.status).toBe(200);

    const anonymous = await request.get('/api/maps/config');
    expect(anonymous.status()).toBe(401);
  });

  // 모바일 날짜·시간 피커에는 "비우기" 가 없어서, 한 번 고른 값을 되돌릴 수 없었다.
  // 값이 있을 때만 뜨는 지우기(×) 버튼으로 "종일"·"마감 없음" 으로 돌아갈 수 있어야 한다.
  test('정해 둔 시간·마감을 지우기 버튼으로 다시 비운다', async ({ page }) => {
    await page.goto('/events/new');

    // 값이 차면 옆에 "○○ 지우기" 버튼이 생겨 getByLabel 이 둘을 잡는다 — 입력칸 id 로 지목한다.
    const time = page.locator('#ev-time');
    const deadlineDate = page.locator('#ev-deadline-date');
    const deadlineTime = page.locator('#ev-deadline-time');

    // 비어 있는 동안에는 버튼이 없다 (칸을 어지럽히지 않는다)
    await expect(page.getByRole('button', { name: '시간 지우기', exact: true })).toHaveCount(0);

    await time.fill('14:30');
    await deadlineDate.fill('2026-11-20');
    await deadlineTime.fill('18:00');

    await page.getByRole('button', { name: '시간 지우기', exact: true }).click();
    await expect(time).toHaveValue('');

    // 마감 날짜를 지우면 "마감 없음" 이므로 시간도 함께 비워진다
    await page.getByRole('button', { name: '마감 날짜 지우기' }).click();
    await expect(deadlineDate).toHaveValue('');
    await expect(deadlineTime).toHaveValue('');

    // 지운 채로 저장되면 목록에 시간 없이 날짜만 남는다
    const cleared = `e2e 비우기 ${run}`;
    await page.getByLabel('이벤트 이름').fill(cleared);
    await page.getByLabel(/^날짜/).fill('2026-11-22');
    await page.getByLabel('장소').fill('e2e 체육관');
    await page.getByRole('button', { name: '저장', exact: true }).click();

    await expect(page).toHaveURL(/\/events$/);
    const row = page.locator('tr', { hasText: cleared }).first();
    await expect(row).toContainText('11/22');
    await expect(row).not.toContainText('14:30');

    // 다시 열어도 비어 있다 — 저장이 아니라 화면만 지운 게 아니라는 확인
    await row.getByRole('button', { name: '수정' }).click();
    await expect(page.getByRole('heading', { name: '이벤트 수정' })).toBeVisible();
    await expect(page.locator('#ev-time')).toHaveValue('');
    await expect(page.locator('#ev-deadline-date')).toHaveValue('');
  });

  test('옛 대회 주소는 이벤트 관리로 이어진다', async ({ page }) => {
    await page.goto('/competitions');
    await expect(page).toHaveURL(/\/events$/);
  });

  // iOS Safari 는 값이 비어 있으면 날짜/시간 칸을 글자 높이만큼 내려앉힌다.
  // 여기서 도는 Chromium 은 자체 하한이 있어 증상 자체가 재현되지 않는다 —
  // 높이만 재면 CSS 를 통째로 걷어내도 통과하므로, **안전장치가 실제로 걸려 있는지**를
  // 계산된 스타일로 직접 확인한다. 이건 엔진과 무관하게 깨진다.
  test('날짜 칸은 비어 있어도 채워졌을 때와 같은 높이다', async ({ page }) => {
    await page.goto('/events/new');

    const date = page.getByLabel(/^날짜/);

    // 안전장치: min-height 가 실제로 적용돼 있어야 한다 (CSS 를 지우면 auto/0px 이 된다)
    const minHeight = await date.evaluate((el) => getComputedStyle(el).minHeight);
    expect(parseFloat(minHeight)).toBeGreaterThanOrEqual(44);

    const empty = (await date.boundingBox()).height;

    await date.fill('2026-12-24');
    const filled = (await date.boundingBox()).height;

    expect(empty).toBeGreaterThanOrEqual(44); // 터치 타깃 최소치
    expect(Math.abs(filled - empty)).toBeLessThanOrEqual(2);
  });

  // 폼이 좁은 한 줄로 고정돼 있어 데스크탑에서 오른쪽 절반이 통째로 비어 있었다.
  // 열이 실제로 갈라지는지는 계산된 위치로만 확인할 수 있다 — 클래스만 붙여 두고
  // CSS 를 지워도 통과하는 테스트가 되지 않도록 두 폭에서 좌표를 잰다.
  test('데스크탑에서는 본문과 공개·접수가 나란히 서고, 좁아지면 아래로 쌓인다', async ({ page }) => {
    await page.goto('/events/new');

    const main = page.locator('.event-form__main');
    const side = page.locator('.event-form__side');

    await page.setViewportSize({ width: 1440, height: 900 });
    const wideMain = await main.boundingBox();
    const wideSide = await side.boundingBox();
    expect(wideSide.x).toBeGreaterThanOrEqual(wideMain.x + wideMain.width);
    expect(wideSide.y).toBeLessThan(wideMain.y + wideMain.height);

    await page.setViewportSize({ width: 480, height: 900 });
    const narrowMain = await main.boundingBox();
    const narrowSide = await side.boundingBox();
    expect(narrowSide.y).toBeGreaterThanOrEqual(narrowMain.y + narrowMain.height);
    expect(Math.abs(narrowSide.width - narrowMain.width)).toBeLessThanOrEqual(1);

    // 가로로 삐져나가는 칸이 없어야 한다
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('학부모 메뉴에서 초대 링크와 요약이 보인다', async ({ page }) => {
    await page.goto('/parents');

    await expect(page.getByRole('heading', { name: '학부모' })).toBeVisible();
    await expect(page.getByText('/invite/')).toBeVisible();
    await expect(page.getByText('확인 대기 아이')).toBeVisible();
    await expect(page.getByRole('button', { name: '학생별' })).toBeVisible();
  });
});

test.describe('선생님 — 사진 메뉴 (docs/photo-menu)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, sessions.teacher);
  });

  test('설정에 Google 계정 카드가 보이고, 연동 설정 전에는 안내만 나온다', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: /Google 계정 \(사진 저장\)/ })).toBeVisible();
    // e2e 서버에는 Google 키가 없다 → 연결 버튼 대신 안내 (키가 있으면 연결 버튼)
    const guide = page.getByText(/연동이 아직 설정되지 않았습니다/);
    const connect = page.getByRole('button', { name: /Google 계정 연결/ });
    await expect(guide.or(connect).first()).toBeVisible();
  });

  test('이벤트 관리 아래에 사진 메뉴가 있고, 앨범 카드에 공개 상태가 보인다', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.desktop-nav');
    const labels = await nav.locator('a').allTextContents();
    expect(labels.indexOf('사진')).toBe(labels.indexOf('이벤트 관리') + 1);

    await nav.getByRole('link', { name: '사진', exact: true }).click();
    await expect(page).toHaveURL(/\/photos$/);
    await expect(page.getByRole('heading', { name: '사진', exact: true })).toBeVisible();

    const published = page.getByRole('button', { name: new RegExp(`e2e확정대회_`) }).first();
    await expect(published.getByText('공개', { exact: true })).toBeVisible();
    const privateCard = page.getByRole('button', { name: new RegExp(sessions.album.privateTitle) });
    await expect(privateCard.getByText('비공개', { exact: true })).toBeVisible();
  });

  test('휴대폰 사진 목록 — 세로 썸네일이어도 앨범 카드 표지가 16:10 을 지킨다', async ({ page }) => {
    await stubPortraitThumbnails(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/photos');

    const card = page.getByRole('button', { name: new RegExp(`e2e확정대회_`) }).first();
    const cover = card.locator('.ui-album-card__cover');
    await expect.poll(() => cover.locator('img').first().evaluate((img) => img.naturalHeight)).toBe(711);

    // 넘침을 자르지 않으면 Chrome 이 세로 사진 높이만큼 표지를 늘렸다(224px → 630px)
    const box = await cover.boundingBox();
    expect(Math.abs(box.height - box.width * 10 / 16)).toBeLessThan(3);
    const titleBox = await card.locator('.ui-album-card__title').boundingBox();
    expect(titleBox.y).toBeGreaterThanOrEqual(box.y + box.height);
  });

  test('Google 이 준비되지 않으면 [사진 올리기] 가 잠기고 안내가 나온다', async ({ page }) => {
    await page.goto('/photos');
    await expect(page.getByText(/관리자에게 문의|Google 계정을 먼저 연결/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '사진 올리기' }).first()).toBeDisabled();
  });

  test('[얼굴 찾기] — 예전 방식으로 분석한 사진을 이 브라우저에서 다시 찾아 저장한다 (Google 연결 없이도)', async ({ page, request }) => {
    test.setTimeout(120_000);
    const id = sessions.album.faceScanEventId;
    // Drive 사진(lh3, 긴 변 1920)을 얼굴 없는 그림으로 바꿔 끼운다. 진짜 lh3 처럼 CORS 를 허락해야 캔버스가 읽힌다.
    const asked = [];
    await page.route('https://lh3.googleusercontent.com/**', (route) => {
      asked.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: FACELESS_PNG.buffer, headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    await page.goto(`/photos/${id}`);
    await expect(page.getByText('얼굴을 찾아 볼 사진이 2장 있어요', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: '얼굴 찾기' }).click();

    // 모델을 받고 처음 계산할 때 셰이더를 만드느라 느리다
    await expect(page.getByText(/사진 2장을 다시 봤어요\. 0장에서 얼굴을 찾았어요\./)).toBeVisible({ timeout: 90_000 });
    expect(asked).toHaveLength(2);
    expect(asked.every((url) => /\/d\/e2e-file-.+=s1920$/.test(url))).toBe(true);

    // 새 방식으로 저장됐으니 더 찾을 사진이 없다
    const album = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
    expect(album.body.counts.unanalyzed).toBe(0);
    await page.reload();
    await expect(page.getByRole('button', { name: '얼굴 찾기' })).toHaveCount(0);
  });

  test('앨범에서 공개 범위를 고르고 공개했다가 비공개로 돌린다 — Google 이 없어도 공개 설정은 된다', async ({ page }) => {
    await page.goto(`/photos/${sessions.album.privateEventId}`);

    const panel = page.getByLabel('학부모 공개');
    await expect(panel.locator('.ui-publish__state')).toHaveText('비공개');
    await expect(panel.getByText(/이벤트 상세/)).toBeVisible();
    // 사진 두 장이 사진 칸에 있다
    await expect(page.locator('.ui-media-tile')).toHaveCount(2);

    await panel.getByRole('button', { name: /모든 학부모/ }).click();
    await expect(panel.getByRole('button', { name: /모든 학부모/ })).toHaveAttribute('aria-pressed', 'true');

    await panel.getByRole('button', { name: '학부모에게 공개' }).click();
    await expect(panel.locator('.ui-publish__state')).toHaveText('공개 중');
    await expect(panel.getByText(/모든 학부모 \d+명이 볼 수 있어요/)).toBeVisible();

    // 다른 테스트(학부모 쪽)가 기대하는 처음 상태로 되돌린다
    await panel.getByRole('button', { name: '비공개로 전환' }).click();
    await expect(panel.locator('.ui-publish__state')).toHaveText('비공개');
    await panel.getByRole('button', { name: /참가 확정 학부모/ }).click();
    await expect(panel.getByRole('button', { name: /참가 확정 학부모/ })).toHaveAttribute('aria-pressed', 'true');
  });

  // 요청 ③ — 사진은 사진 메뉴에서만. 이벤트 관리 · 이벤트 폼에는 사진 입구가 없다.
  test('이벤트 관리와 이벤트 수정 화면에는 사진 입구가 없다', async ({ page }) => {
    await page.goto('/events');
    // 다가오는 일정이 있으면 체크박스("지난 일정 보기 (n)"), 없으면 빈 화면의 버튼("지난 일정 n건 보기")이다
    await page.getByRole('checkbox', { name: /지난 일정 보기/ })
      .or(page.getByRole('button', { name: /지난 일정 \d+건 보기/ })).first().click();
    const row = page.locator('tr', { hasText: 'e2e확정대회' }).first();
    await expect(row.getByRole('button', { name: /사진/ })).toHaveCount(0);

    await row.getByRole('button', { name: '수정' }).click();
    await expect(page.getByRole('heading', { name: '이벤트 수정' })).toBeVisible();
    await expect(page.getByText(/사진 · 영상/)).toHaveCount(0);
  });

  // FR-517 — 맞는 이벤트가 없으면 올리는 시트에서 이름·날짜로 **사진 전용 폴더**를 만든다 (이벤트는 생기지 않는다)
  test('사진을 올릴 때 이벤트가 없어도 새 폴더를 만든다 — 이벤트 관리·학부모 일정에는 나오지 않는다', async ({ page, request }) => {
    const title = `e2e 새폴더 ${run}`;
    const findMade = async () => {
      const list = await api(request, sessions.teacher, 'GET', '/api/albums');
      return list.body.targets.filter((t) => t.title === title);
    };

    // e2e 서버에는 Google 키가 없어 [사진 올리기] 가 잠긴다 — 목록 응답의 연결 상태만 '연결됨' 으로 바꿔 시트를 연다.
    // 폴더 만들기(POST)와 업로드 요청은 진짜 서버로 간다.
    await page.route('**/api/albums', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, drive: { ...body.drive, configured: true, connected: true, status: 'connected' } } });
    });

    await page.goto('/photos');
    await page.getByRole('button', { name: '사진 올리기' }).first().click();
    const sheet = page.getByRole('dialog');

    await sheet.getByRole('radio', { name: /새 폴더 만들기/ }).click();
    await expect(sheet.getByRole('button', { name: '사진 고르기' })).toBeDisabled();
    await sheet.getByLabel('이름').fill(title);
    await sheet.getByLabel('날짜').fill('2026-09-27');
    await expect(sheet.getByText(`2026-09-27 ${title}`)).toBeVisible();
    await expect(sheet.getByText('Drive 에 새로 만들 폴더')).toBeVisible();
    await expect(sheet.getByText(/이벤트와 상관없는 사진 폴더예요/)).toBeVisible();

    const chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: '사진 고르기' }).click();
    await (await chooser).setFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    await expect(sheet.getByText(`${title} 앨범에 올려요`)).toBeVisible();

    // 파일을 고른 것만으로는 폴더가 생기지 않는다
    expect(await findMade()).toHaveLength(0);

    // [올리기] — 폴더를 만든 뒤 업로드를 시작한다. Google 이 없으니 업로드는 서버에서 멈추고 안내가 뜬다.
    await sheet.getByRole('button', { name: '1개 올리기' }).click();
    await expect(sheet.getByRole('alert')).toBeVisible();

    const made = await findMade();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ type: 'folder', date: '2026-09-27', hasAlbum: false, folderName: `2026-09-27 ${title}` });
    const folderId = made[0].eventId;

    // 다시 눌러도 폴더는 하나 — 만든 폴더로 다시 올린다
    await sheet.getByRole('button', { name: '1개 올리기' }).click();
    await expect(sheet.getByRole('alert')).toBeVisible();
    expect(await findMade()).toHaveLength(1);

    // 시트의 목록에도 "폴더" 표시와 함께 골라진 채로 들어가 있다
    await sheet.getByRole('button', { name: /이벤트 다시 고르기/ }).click();
    const row = sheet.getByRole('radio', { name: new RegExp(title) });
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await expect(row.getByText('폴더', { exact: true })).toBeVisible();

    // ── 이벤트가 아니다 ──
    // 선생님 이벤트 관리 목록에 없다 (지난 일정까지 다 봐도)
    const events = await api(request, sessions.teacher, 'GET', '/api/events?includePast=true');
    expect(events.status).toBe(200);
    expect(events.body.some((e) => e.id === folderId || e.title === title)).toBe(false);
    // 이벤트 폼으로 고칠 수 없다
    const edited = await api(request, sessions.teacher, 'PUT', `/api/events/${folderId}`, { title, date: '2026-09-27', location: 'x' });
    expect(edited.status).toBe(400);
    // 학부모 일정(다가오는 · 지난)에도, 이벤트 상세에도 없다
    for (const view of ['', '?view=past']) {
      const schedule = await api(request, sessions.parent, 'GET', `/api/parent/events${view}`);
      expect(schedule.status).toBe(200);
      expect(schedule.body.events.some((e) => e.id === folderId)).toBe(false);
    }
    const detail = await api(request, sessions.parent, 'GET', `/api/parent/events/${folderId}`);
    expect(detail.status).toBe(404);
    // 앨범으로는 읽힌다 — 아직 공개 전이라 404(없는 이벤트)가 아니라 403(앨범 사유)
    const media = await api(request, sessions.parent, 'GET', `/api/parent/events/${folderId}/media`);
    expect(media.status).toBe(403);

    // 화면: 이벤트 관리 목록에 그 이름이 없다
    await page.goto('/events');
    await page.getByRole('checkbox', { name: /지난 일정 보기/ })
      .or(page.getByRole('button', { name: /지난 일정 \d+건 보기/ })).first().click();
    await expect(page.locator('tr', { hasText: 'e2e확정대회' }).first()).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    const removed = await api(request, sessions.teacher, 'DELETE', `/api/events/${folderId}`);
    expect(removed.status).toBeLessThan(300);
  });

  // FR-518 — 학부모에게 보낼 사진 폴더 링크
  test('앨범의 [공유] 는 초대가 실린 학부모 사진 주소를 복사하고, 비공개 앨범에서는 잠긴다', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 공개된 앨범 (픽스처: 공개 범위 = 참가 확정 학부모)
    await page.goto(`/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '공유', exact: true }).click();

    await expect(page.locator('.ui-toast')).toContainText('공유 링크를 복사했어요');
    await expect(page.locator('.ui-toast')).toContainText('참가 확정 학부모만 볼 수 있어요');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // 학부모 앱의 앨범 주소 + 이 선생님의 학부모 초대 — 처음 온 학부모도 이 링크로 가입한다
    expect(copied).toBe(`${baseURL}/parent/photos/${sessions.album.eventId}?invite=${sessions.invite}`);

    // 비공개 앨범은 학부모에게 보내 봐야 열리지 않는다
    await page.goto(`/photos/${sessions.album.privateEventId}`);
    const locked = page.getByRole('button', { name: '공유', exact: true });
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveAttribute('title', '학부모에게 공개한 앨범만 공유할 수 있어요');
  });

  test('선생님이 자기가 보낸 사진 링크를 열면 그 앨범의 관리 화면으로 간다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.eventId}?invite=${sessions.invite}`);

    await expect(page).toHaveURL(new RegExp(`/photos/${sessions.album.eventId}$`));
    await expect(page.getByLabel('학부모 공개')).toBeVisible();
  });

  test('새 폴더 API — 학부모는 막히고, 이름·날짜가 없으면 400, 같은 이름·날짜는 하나', async ({ request }) => {
    const asParent = await api(request, sessions.parent, 'POST', '/api/albums', { title: 'x', date: '2026-09-27' });
    expect(asParent.status).toBe(403);
    const noTitle = await api(request, sessions.teacher, 'POST', '/api/albums', { title: ' ', date: '2026-09-27' });
    expect(noTitle.status).toBe(400);
    const badDate = await api(request, sessions.teacher, 'POST', '/api/albums', { title: 'x', date: '2026-02-31' });
    expect(badDate.status).toBe(400);

    const title = `e2e 폴더API ${run}`;
    const first = await api(request, sessions.teacher, 'POST', '/api/albums', { title, date: '2026-09-27' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, target: { type: 'folder', title } });
    const again = await api(request, sessions.teacher, 'POST', '/api/albums', { title, date: '2026-09-27' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, target: { eventId: first.body.target.eventId } });

    const removed = await api(request, sessions.teacher, 'DELETE', `/api/events/${first.body.target.eventId}`);
    expect(removed.status).toBeLessThan(300);
  });

  test('사진 목록 API 는 학부모에게 막혀 있다', async ({ request }) => {
    const asParent = await api(request, sessions.parent, 'GET', '/api/albums');
    expect(asParent.status).toBe(403);
    const asTeacher = await api(request, sessions.teacher, 'GET', '/api/albums');
    expect(asTeacher.status).toBe(200);
  });

  test('앨범 API 는 남의 이벤트를 열어 주지 않는다', async ({ request }) => {
    const other = await api(request, sessions.teacher, 'GET', '/api/events/999999/album');
    expect(other.status).toBe(404);
  });
});

/**
 * 좁은 화면(휴대폰)에서는 신청 현황을 목록 아래에 끼워 넣지 않고 화면 전체로 띄운다.
 * teacher 프로젝트는 데스크탑 뷰포트라 여기서만 폭을 바꾼다.
 */
test.describe('선생님 — 좁은 화면의 신청 현황', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('신청 건수를 누르면 신청한 학생 목록이 화면을 가득 채운다', async ({ page, request }) => {
    const eventTitle = `e2e 모바일 신청 ${run}`;
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'competition',
      title: eventTitle,
      date: '2026-12-05',
      location: 'e2e 체육관',
      options: [],
      isPublished: true,
      registrationOpen: true
    });
    expect(created.status).toBe(201);

    const student = sessions.students[0];
    const registered = await api(
      request, sessions.teacher, 'PUT',
      `/api/events/${created.body.id}/registrations/student/${student.id}`,
      { optionIds: [] }
    );
    expect(registered.status).toBeLessThan(300);

    await loginAs(page, sessions.teacher);
    await page.goto('/events');

    const row = page.locator('tr', { hasText: eventTitle }).first();
    await row.getByRole('button', { name: /^\d+건$/ }).click();

    const panel = page.locator('.ui-registrations');
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(panel.getByText(student.name)).toBeVisible();

    // 목록 아래가 아니라 화면 전체 — 스크롤을 내리지 않아도 명단이 보인다
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.round(box.height)).toBe(viewport.height);
    expect(Math.round(box.y)).toBe(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // 빠져나갈 길: 닫기 버튼과 Esc
    await expect(page.getByRole('button', { name: '신청 현황 닫기' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('휴관일 카드에는 장소·참가 학생·신청·공개 접수 줄이 없다', async ({ page, request }) => {
    const closureTitle = `e2e 모바일 휴관 ${run}`;
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'closure',
      title: closureTitle,
      date: '2026-12-24',
      endDate: '2026-12-26',
      isPublished: true
    });
    expect(created.status).toBe(201);

    await loginAs(page, sessions.teacher);
    await page.goto('/events');

    const card = page.locator('tr', { hasText: closureTitle }).first();
    await expect(card).toBeVisible();

    for (const label of ['장소', '참가 학생', '신청', '공개 · 접수']) {
      await expect(card.locator(`td[data-label="${label}"]`)).toBeHidden();
    }
    // 남는 줄은 종류·이벤트·날짜와 관리 버튼뿐이다
    await expect(card.locator('td[data-label="날짜"]')).toBeVisible();
    await expect(card.getByRole('button', { name: '수정' })).toBeVisible();
  });
});

/**
 * 학생 명단은 등록 순서(id)가 아니라 이름 가나다순으로 보여야 한다.
 * 서버(ORDER BY name)와 화면(기본 정렬 = 이름 오름차순) 양쪽이 함께 걸려야 통과한다.
 */
test.describe('선생님 — 학생 명단 정렬', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, sessions.teacher);
  });

  test('나중에 등록한 학생이라도 이름 가나다순이면 맨 위에 온다', async ({ page, request }) => {
    // 이름은 기존 학생(가은…, 나윤…)보다 앞서지만 id 는 가장 크다.
    const firstName = `가가${run}`;
    const created = await api(request, sessions.teacher, 'POST', '/api/students', {
      name: firstName,
      birthdate: '2018-01-01',
      classIds: []
    });
    expect(created.status).toBeLessThan(300);

    await page.goto('/students');
    await expect(page.getByRole('heading', { name: '학생 관리' })).toBeVisible();
    await expect(page.getByText(firstName)).toBeVisible();

    const names = await page.locator('tbody tr td:first-child').allInnerTexts();
    expect(names).toEqual([firstName, sessions.students[0].name, sessions.students[1].name]);

    // 이름 열을 누르면 내림차순으로 뒤집힌다 (기본이 이미 오름차순이라는 증거이기도 하다)
    await page.locator('th').filter({ hasText: '이름' }).getByText('이름').click();
    const reversed = await page.locator('tbody tr td:first-child').allInnerTexts();
    expect(reversed).toEqual([...names].reverse());
  });
});

test.describe('선생님 — 이벤트 공유 링크와 신청 명단', () => {
  test.beforeEach(async ({ page, context }) => {
    await loginAs(page, sessions.teacher);
    // 복사한 링크를 읽어 확인하려면 클립보드 권한이 필요하다 (Chromium)
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  const createEvent = async (request, overrides = {}) => {
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'special',
      title: `e2e 공유 ${run}`,
      date: '2026-12-12',
      location: 'e2e 공원',
      options: [],
      isPublished: true,
      registrationOpen: true,
      ...overrides
    });
    expect(created.status).toBe(201);
    return created.body;
  };

  test('공유를 누르면 학부모용 이벤트 링크가 복사된다', async ({ page, request, baseURL }) => {
    const event = await createEvent(request);

    await page.goto('/events');
    const row = page.locator('tr', { hasText: event.title }).first();
    await row.getByRole('button', { name: '공유' }).click();

    await expect(page.locator('.ui-toast')).toContainText('공유 링크를 복사했어요');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${baseURL}/parent/events/${event.id}`);

    // 공유는 신청 현황을 같이 열지 않는다
    await expect(page.locator('.ui-registrations')).toHaveCount(0);
  });

  test('비공개 이벤트의 공유 버튼은 잠겨 있다 — 학부모에게는 없는 이벤트라서', async ({ page, request }) => {
    const event = await createEvent(request, { title: `e2e 비공개 공유 ${run}`, isPublished: false });

    await page.goto('/events');
    const row = page.locator('tr', { hasText: event.title }).first();
    await expect(row.getByRole('button', { name: '공유' })).toBeDisabled();
  });

  test('이벤트를 누르면 누가 신청했는지 학생 이름이 나온다', async ({ page, request }) => {
    const event = await createEvent(request, { title: `e2e 명단 ${run}` });
    const student = sessions.students[0];
    const registered = await api(
      request, sessions.teacher, 'PUT',
      `/api/events/${event.id}/registrations/student/${student.id}`,
      { optionIds: [] }
    );
    expect(registered.status).toBeLessThan(300);

    await page.goto('/events');
    // 신청 건수가 아니라 이벤트(행) 자체를 누른다
    await page.locator('tr', { hasText: event.title }).first().getByText(event.title).click();

    const panel = page.locator('.ui-registrations');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(event.title);
    await expect(panel.getByText(student.name)).toBeVisible();

    // 패널 머리말에서도 링크를 복사할 수 있다
    await panel.getByRole('button', { name: '공유 링크 복사' }).click();
    await expect(page.locator('.ui-toast')).toContainText('공유 링크를 복사했어요');
  });
});

/**
 * 대시보드 "수업별 출석 현황"의 출석 수를 누르면 그날 온 학생 이름이 뜬다.
 * 이 모달은 `mode="modal"`(항상 가운데)이라, 위치 규칙이 데스크탑 미디어 쿼리 안에만 있으면
 * 모바일에서 화면 밖(body 맨 아래)에 그려져 스크림만 깔린다 — 실제로 그랬다.
 */
test.describe('선생님 — 좁은 화면의 출석 학생 목록', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('출석 수를 누르면 학생 이름이 화면 안에 보인다', async ({ page, request }) => {
    const today = new Date().toISOString().split('T')[0];
    const created = await api(request, sessions.teacher, 'POST', '/api/classes', {
      name: `e2e 모바일 출석반 ${run}`,
      schedule: '토 10:00',
      duration: '60분',
      instructor: 'e2e 선생님'
    });
    expect(created.status).toBe(201);

    const student = sessions.students[0];
    const checked = await api(request, sessions.teacher, 'POST', '/api/attendance', {
      studentId: student.id,
      classId: created.body.id,
      date: today
    });
    expect(checked.status).toBe(201);

    await loginAs(page, sessions.teacher);
    await page.goto('/dashboard');

    const row = page.locator('tr', { hasText: created.body.name }).first();
    await row.getByTitle('클릭하여 출석 학생 보기').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(student.name)).toBeVisible();

    // 핵심: 패널이 뷰포트 안에 있어야 한다 (화면 밖으로 밀려나면 이름이 있어도 못 본다)
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // 내용만큼 쪼그라들지 않고 화면 폭을 제대로 쓴다
    expect(box.width).toBeGreaterThan(viewport.width * 0.8);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
