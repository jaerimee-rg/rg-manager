import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api, stubPortraitThumbnails, swipeTouch, FACELESS_PNG } from './helpers.mjs';
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

  test('대표 사진 — 앨범에서 사진·영상을 4장까지 골라 사진 목록과 학부모 사진 탭 카드의 표지로 (숨기면 빠진다)', async ({ page, request, browser, baseURL }) => {
    // 픽스처: mediaIds = [선생님 사진 1, 선생님 사진 2, 학부모 사진 3, 영상 4]
    const eventId = sessions.album.eventId;
    const [photo1, photo2, parentPhoto, videoId] = sessions.album.mediaIds;
    const patchAlbum = (id, body) => api(request, sessions.teacher, 'PATCH', `/api/events/${id}/album`, body);
    const clearCovers = async (id) => {
      const res = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
      for (const coverId of res.body.coverMediaIds || []) await patchAlbum(id, { removeCoverMediaId: coverId });
    };
    const albumCard = async (id = eventId) => {
      const res = await api(request, sessions.teacher, 'GET', '/api/albums');
      expect(res.status).toBe(200);
      return res.body.albums.find((album) => album.eventId === id);
    };
    const bulk = (action) => api(request, sessions.teacher, 'POST', `/api/events/${eventId}/media/bulk`, { action, mediaIds: [videoId] });
    const folderId = sessions.album.peopleEventId;

    try {
      await clearCovers(eventId);
      const { title } = await albumCard();
      const list = await api(request, sessions.teacher, 'GET', `/api/events/${eventId}/media?filter=all&limit=60`);
      const indexOf = (id) => list.body.items.findIndex((item) => item.id === id);
      const fileOf = (id) => list.body.items[indexOf(id)].driveFileId;
      await stubPortraitThumbnails(page);
      await page.goto(`/photos/${eventId}`);

      // 영상 → 사진 2 순서로 고른다. 선생님 목록의 순서 그대로 칸이 그려진다
      const viewer = page.getByRole('dialog', { name: '사진 보기' });
      const pick = async (id, label) => {
        await page.locator('.ui-media-tile').nth(indexOf(id)).click();
        await viewer.getByRole('button', { name: '대표 사진으로' }).click();
        await expect(viewer.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
        await viewer.getByRole('button', { name: '닫기' }).click();
      };
      await pick(videoId, '대표 사진 1');
      await pick(photo2, '대표 사진 2');
      await expect(page.locator('.ui-media-tile').nth(indexOf(videoId)).getByText('대표 1', { exact: true })).toBeVisible();
      await expect(page.locator('.ui-media-tile').nth(indexOf(photo2)).getByText('대표 2', { exact: true })).toBeVisible();
      // 아직 저장하지 않았다 — [저장하기] 를 눌러야 반영된다
      expect((await api(request, sessions.teacher, 'GET', `/api/events/${eventId}/album`)).body.coverMediaIds).toEqual([]);
      const saveBar = page.getByRole('region', { name: '대표 사진 저장' });
      await expect(saveBar).toContainText('[저장하기] 를 눌러야 사진 목록에 반영돼요');
      await saveBar.getByRole('button', { name: '저장하기' }).click();
      await expect(page.locator('.ui-toast')).toContainText('대표 사진 2장을 저장했어요');
      await expect(saveBar).toHaveCount(0);

      // 사진 목록 — 고른 두 장만, 고른 순서로 나란히 (영상 표시는 붙이지 않는다)
      await page.goto('/photos');
      const cover = page.getByRole('button', { name: new RegExp(title) }).locator('.ui-album-card__cover');
      await expect(cover).toHaveAttribute('data-covers', '2');
      await expect(cover.locator('img')).toHaveCount(2);
      await expect(cover.locator('img').first()).toHaveAttribute('src', new RegExp(fileOf(videoId)));
      await expect(cover.locator('img').nth(1)).toHaveAttribute('src', new RegExp(fileOf(photo2)));

      // 나머지 두 장도 고르면 4장 — 앨범의 사진이 다 대표라 더 고를 것이 없다
      expect((await patchAlbum(eventId, { addCoverMediaId: photo1 })).status).toBe(200);
      const fourth = await patchAlbum(eventId, { addCoverMediaId: parentPhoto });
      expect(fourth.body.coverMediaIds).toEqual([videoId, photo2, photo1, parentPhoto]);
      expect((await albumCard()).covers).toHaveLength(4);

      // 숨기면 표지에서 빠진다(3장) · 숨긴 것은 고를 수 없다 — 그 사이 대표를 바꾸지 않았으면 다시 보이게 할 때 제자리로 돌아온다
      expect((await bulk('hide')).status).toBe(200);
      expect((await albumCard()).covers.map((url) => url.includes(fileOf(videoId)))).toEqual([false, false, false]);
      expect((await patchAlbum(eventId, { addCoverMediaId: videoId })).body.reason).toBe('hidden_cover');
      expect((await bulk('show')).status).toBe(200);
      const back = await api(request, sessions.teacher, 'GET', `/api/events/${eventId}/album`);
      expect(back.body.coverMediaIds).toEqual([videoId, photo2, photo1, parentPhoto]);

      // 다른 앨범의 사진은 고를 수 없다
      const other = await patchAlbum(folderId, { addCoverMediaId: videoId });
      expect(other.status).toBe(400);
      expect(other.body.reason).toBe('invalid_cover');

      // 뷰어에서 다시 누르면 풀린다 — 뒤의 것이 당겨진다
      await page.goto(`/photos/${eventId}`);
      await page.locator('.ui-media-tile').nth(indexOf(videoId)).click();
      await viewer.getByRole('button', { name: '대표 사진 1' }).click();
      await expect(viewer.getByRole('button', { name: '대표 사진으로' })).toBeVisible();
      await expect(viewer.getByText('[저장하기] 를 눌러야 반영돼요')).toBeVisible();
      expect((await albumCard()).covers).toHaveLength(4);
      await viewer.getByRole('button', { name: '닫기' }).click();
      await saveBar.getByRole('button', { name: '저장하기' }).click();
      await expect.poll(async () => (await albumCard()).covers.length).toBe(3);

      // 학부모 사진 탭 — 대표 사진을 고른 폴더는 그것만 보인다(선생님 목록과 같은 표지). 확인은 "모든 학부모" 에게 공개된
      // 사진 폴더(얼굴 목록 픽스처)와, 처음부터 아이가 연결된 학부모(parentMulti)로 한다 — 이 대회 앨범은 참가 확정 학부모만 보고,
      // 기본 학부모는 parent 프로젝트가 아이를 등록하기 전까지 온보딩 화면에 머문다
      const folderMedia = await api(request, sessions.teacher, 'GET', `/api/events/${folderId}/media?filter=all&limit=60`);
      const oldest = folderMedia.body.items[folderMedia.body.items.length - 1];
      await clearCovers(folderId);
      expect((await patchAlbum(folderId, { addCoverMediaId: oldest.id })).status).toBe(200);
      const parentRes = await api(request, sessions.parentMulti, 'GET', '/api/parent/albums');
      const parentAlbum = parentRes.body.items.find((item) => item.eventId === folderId);
      expect(parentAlbum.covers).toEqual([expect.stringContaining(`${oldest.driveFileId}=w800-h500-c-rw`)]);
      expect(parentAlbum).not.toHaveProperty('coverMediaIds');

      const parentContext = await browser.newContext({ baseURL });
      try {
        const parentPage = await parentContext.newPage();
        await stubPortraitThumbnails(parentPage);
        await loginAs(parentPage, sessions.parentMulti);
        await parentPage.goto('/parent/photos');
        const folderTitle = (await albumCard(folderId)).title;
        const parentCard = parentPage.getByRole('button', { name: new RegExp(folderTitle) });
        await expect(parentCard.getByTestId('album-covers')).toHaveAttribute('data-covers', '1');
        await expect(parentCard.getByTestId('album-previews')).toHaveCount(0);
        // 표지가 16:10 을 지킨다(세로 그림이어도)
        const box = await parentCard.getByTestId('album-covers').boundingBox();
        expect(Math.abs(box.height - box.width * 10 / 16)).toBeLessThan(3);
      } finally {
        await parentContext.close();
      }
    } finally {
      await bulk('show');
      await clearCovers(eventId);
      await clearCovers(folderId);
    }
  });

  test('대표 사진 — 고르기에서 고르고, 대표 사진 칸에서 끌어서 놓아(마우스·손가락) 고친 뒤, [저장하기] 를 눌러야 반영된다', async ({ page, request, browser, baseURL }) => {
    // 픽스처: mediaIds = [선생님 사진 1, 선생님 사진 2, 학부모 사진 3, 영상 4]
    const eventId = sessions.album.eventId;
    const [photo1, photo2, , videoId] = sessions.album.mediaIds;
    const albumOf = async () => (await api(request, sessions.teacher, 'GET', `/api/events/${eventId}/album`)).body;
    const clearCovers = () => api(request, sessions.teacher, 'PATCH', `/api/events/${eventId}/album`, { coverMediaIds: [] });
    const panel = (p) => p.getByRole('region', { name: '대표 사진', exact: true });
    const panelOrder = (p) => panel(p).locator('[data-cover-id]').evaluateAll((els) => els.map((el) => Number(el.dataset.coverId)));
    const saveBar = (p) => p.getByRole('region', { name: '대표 사진 저장' });
    const centerOf = async (locator) => {
      const box = await locator.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
    };

    try {
      expect((await clearCovers()).status).toBe(200);
      const list = await api(request, sessions.teacher, 'GET', `/api/events/${eventId}/media?filter=all&limit=60`);
      const indexOf = (id) => list.body.items.findIndex((item) => item.id === id);
      await stubPortraitThumbnails(page);
      await page.goto(`/photos/${eventId}`);
      await expect(panel(page).getByText('0/4')).toBeVisible();

      // 고르기 → 사진 2 · 영상 · 사진 1 순서로 고른다 → [대표 사진 만들기]
      await page.getByRole('button', { name: '고르기' }).click();
      for (const id of [photo2, videoId, photo1]) await page.locator('.ui-media-tile').nth(indexOf(id)).click();
      await page.getByRole('button', { name: '대표 사진 만들기' }).click();
      await expect(page.getByRole('button', { name: '대표 사진 만들기' })).toHaveCount(0);
      await expect.poll(() => panelOrder(page)).toEqual([photo2, videoId, photo1]);
      await expect(panel(page).getByText('수정 중')).toBeVisible();
      await expect(panel(page).getByTestId('cover-preview')).toHaveAttribute('data-covers', '3');
      // 고르기만 했다 — 아직 저장하지 않았다
      expect((await albumOf()).coverMediaIds).toEqual([]);

      // 마우스로 첫 칸을 끝으로 끌어 놓는다
      const slots = panel(page).locator('[data-cover-id]');
      const first = await centerOf(slots.nth(0));
      const last = await centerOf(slots.nth(2));
      await page.mouse.move(first.x, first.y);
      await page.mouse.down();
      await page.mouse.move(first.x + 20, first.y, { steps: 4 });
      await page.mouse.move(last.box.x + last.box.width - 4, last.y, { steps: 8 });
      await expect(panel(page).locator('[data-drop="after"]')).toHaveCount(1);
      await page.mouse.up();
      await expect.poll(() => panelOrder(page)).toEqual([videoId, photo1, photo2]);
      // 사진 칸의 [대표 n] 도 새 순서
      await expect(page.locator('.ui-media-tile').nth(indexOf(videoId)).getByText('대표 1', { exact: true })).toBeVisible();
      expect((await albumOf()).coverMediaIds).toEqual([]);

      // [저장하기] — 넓은 화면에서도 화면 아래에 붙어 있어 대표 사진 칸을 보면서 누른다
      const save = saveBar(page).getByRole('button', { name: '저장하기' });
      await expect(save).toBeInViewport();
      await save.click();
      await expect(page.locator('.ui-toast')).toContainText('대표 사진 3장을 저장했어요 · 사진 목록 카드에 반영돼요');
      expect((await albumOf()).coverMediaIds).toEqual([videoId, photo1, photo2]);
      await expect(saveBar(page)).toHaveCount(0);
      await expect(panel(page).getByText('수정 중')).toHaveCount(0);

      // 사진 목록 카드도 그 순서 — 첫 장(영상)이 왼쪽에 크게
      const cards = await api(request, sessions.teacher, 'GET', '/api/albums');
      const card = cards.body.albums.find((album) => album.eventId === eventId);
      const fileOf = (id) => list.body.items[indexOf(id)].driveFileId;
      expect(card.covers.map((url) => [videoId, photo1, photo2].findIndex((id) => url.includes(fileOf(id))))).toEqual([0, 1, 2]);

      // 휴대폰 — 손가락으로 끌어도 된다(끄는 동안 페이지가 대신 스크롤되지 않는다)
      const phone = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
      try {
        const mobile = await phone.newPage();
        await stubPortraitThumbnails(mobile);
        await loginAs(mobile, sessions.teacher);
        await mobile.goto(`/photos/${eventId}`);
        // 평소에는 칸을 끌 수 없다 — [수정] 을 눌러 고친다
        await panel(mobile).getByRole('button', { name: '수정' }).click();
        const mobileSlots = panel(mobile).locator('[data-cover-id]');
        await mobileSlots.nth(2).scrollIntoViewIfNeeded();
        const from = await centerOf(mobileSlots.nth(2));
        const to = await centerOf(mobileSlots.nth(0));
        const scrollBefore = await mobile.evaluate(() => window.scrollY);
        await swipeTouch(mobile, { x: from.x, y: from.y }, { x: to.box.x + 4, y: to.y }, { steps: 12 });
        await expect.poll(() => panelOrder(mobile)).toEqual([photo2, videoId, photo1]);
        expect(await mobile.evaluate(() => window.scrollY)).toBe(scrollBefore);
        expect((await albumOf()).coverMediaIds).toEqual([videoId, photo1, photo2]);
        // ✕ 로 한 장을 빼고 [저장하기]
        await panel(mobile).getByRole('button', { name: '3번 대표 사진 빼기' }).click();
        await expect.poll(() => panelOrder(mobile)).toEqual([photo2, videoId]);
        const mobileSave = saveBar(mobile).getByRole('button', { name: '저장하기' });
        await expect(mobileSave).toBeInViewport();
        await mobileSave.click();
        await expect.poll(async () => (await albumOf()).coverMediaIds).toEqual([photo2, videoId]);
      } finally {
        await phone.close();
      }

      // 대표 사진 칸이 4장을 넘게 받지 않는다(API) — 5장은 400
      const tooMany = await api(request, sessions.teacher, 'PATCH', `/api/events/${eventId}/album`, { coverMediaIds: [1, 2, 3, 4, 5] });
      expect(tooMany.status).toBe(400);
      expect(tooMany.body.reason).toBe('too_many_covers');
    } finally {
      await clearCovers();
    }
  });

  test('Google 이 준비되지 않으면 [사진 올리기] 가 잠기고 안내가 나온다', async ({ page }) => {
    await page.goto('/photos');
    await expect(page.getByText(/관리자에게 문의|Google 계정을 먼저 연결/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '사진 올리기' }).first()).toBeDisabled();
  });

  test('[얼굴 찾기] — 앨범을 열면 누르지 않아도 예전 방식·실패한 사진을 분석 서버로 다시 찾아 저장한다 (Google 연결 없이도)', async ({ page, request }) => {
    const engine = await request.get('/api/face-engine/health');
    test.skip(!engine.ok(), '얼굴 분석 서버가 없다 — e2e/fake-face-engine.mjs 를 띄우고 서버에 FACE_ENGINE_URL 을 주면 돈다');
    const id = sessions.album.faceScanEventId;
    // Drive 사진(lh3, 긴 변 1920)을 얼굴 없는 그림으로 바꿔 끼운다. 진짜 lh3 처럼 CORS 를 허락해야 브라우저가 읽는다.
    const asked = [];
    await page.route('https://lh3.googleusercontent.com/**', (route) => {
      // 갤러리 썸네일도 lh3 에서 온다 — 얼굴 찾기가 받는 긴 변 1920 만 센다
      if (/=s1920$/.test(route.request().url())) asked.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: FACELESS_PNG.buffer, headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    // 버튼을 누르지 않는다 — 열자마자 저절로 돈다
    await page.goto(`/photos/${id}`);
    await expect(page.getByText(/사진 2장을 다시 봤어요\. 0장에서 얼굴을 찾았어요\./)).toBeVisible({ timeout: 20_000 });
    expect(asked).toHaveLength(2);
    expect(asked.every((url) => /\/d\/e2e-file-.+=s1920$/.test(url))).toBe(true);

    // 새 방식으로 저장됐으니 더 찾을 사진이 없다
    const album = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
    expect(album.body.counts.unanalyzed).toBe(0);
    await page.reload();
    await expect(page.getByRole('button', { name: '얼굴 찾기' })).toHaveCount(0);
  });

  test('[얼굴 찾기] — 찾은 얼굴을 작게 잘라 보여 준다 (그림은 브라우저에서만 쓰고 서버로 보내지 않는다)', async ({ page }) => {
    // 잘라 내기는 저장된 상자(0~1)만 쓰므로 얼굴을 어떻게 찾았는지와 상관없다 — 분석 결과는 얼굴 셋으로 정해 주고,
    // Drive 사진(lh3) 자리에는 아무 그림이나 넣는다. 진짜 분석(face_engine/)은 face_engine/tests 가 본다.
    await page.route('https://lh3.googleusercontent.com/**', (route) => route.fulfill({
      contentType: 'image/png', body: FACELESS_PNG.buffer, headers: { 'Access-Control-Allow-Origin': '*' }
    }));
    const descriptor = Array.from({ length: 512 }, (_, i) => (i % 2 ? -0.01 : 0.01));   // 픽스처 기준 얼굴과 직각 — 태그가 생기지 않게
    await page.route('**/api/face-engine/detect', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        analyzerVersion: 3,
        faces: [0.1, 0.4, 0.7].map((x) => ({ box: { x, y: 0.2, w: 0.2, h: 0.3 }, score: 0.9, descriptor }))
      })
    }));
    const saved = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/media\/\d+\/faces$/.test(request.url())) saved.push(request.postDataJSON());
    });

    await page.goto(`/photos/${sessions.album.faceThumbEventId}`);   // 열면 저절로 찾는다
    await expect(page.getByText(/사진 1장을 다시 봤어요\. 1장에서 얼굴을 찾았어요\./)).toBeVisible({ timeout: 20_000 });

    // 저장한 얼굴 수만큼 결과 안내 아래에 작은 얼굴 그림이 남는다
    expect(saved).toHaveLength(1);
    const found = saved[0].faces.length;
    expect(found).toBe(3);
    const strip = page.getByRole('list', { name: `찾은 얼굴 ${found}개` });
    await expect(strip.locator('img')).toHaveCount(found);
    const crops = await strip.locator('img').evaluateAll((images) => images.map((image) => ({
      width: image.naturalWidth, height: image.naturalHeight, jpeg: image.src.startsWith('data:image/jpeg;base64,')
    })));
    expect(crops.every((crop) => crop.width === 96 && crop.height === 96 && crop.jpeg)).toBe(true);
    const shown = await strip.locator('.ui-avatar').first().boundingBox();
    expect(Math.round(shown.width)).toBe(40);

    // 서버에는 분석 결과만 갔다 — 잘라 낸 그림은 없다
    expect(saved[0].faces.every((face) => Object.keys(face).sort().join() === 'box,descriptor,score')).toBe(true);
  });

  test('얼굴 목록 — 앨범에 나온 사람마다 얼굴 하나, 누르면 그 사람이 나온 사진만', async ({ page }) => {
    // 표지 얼굴은 브라우저가 lh3 사진에서 잘라 그린다 — 진짜 lh3 처럼 CORS 를 허락하는 그림으로 바꿔 끼운다
    const covers = [];
    await page.route('https://lh3.googleusercontent.com/**', (route) => {
      if (/=s\d+$/.test(route.request().url())) covers.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: FACELESS_PNG.buffer, headers: { 'Access-Control-Allow-Origin': '*' } });
    });

    await page.goto(`/photos/${sessions.album.peopleEventId}`);
    const tiles = page.locator('.ui-media-tile');
    await expect(tiles).toHaveCount(3);

    // 사진 세 장에 두 사람(가: 21·22, 나: 22·23) — 같은 사람은 얼굴 하나로
    const faces = page.getByRole('group', { name: '얼굴로 사진 찾기' });
    await expect(faces.getByRole('button', { name: /^얼굴 \d+ · 사진 2장$/ })).toHaveCount(2);
    await expect(faces.locator('img')).toHaveCount(2);   // 잘라 낸 얼굴이 실제로 그려졌다
    expect(covers.every((url) => /\/d\/e2e-file-.+-(21|23)=s\d+$/.test(url))).toBe(true);   // 표지 = 각자 가장 큰 얼굴

    await faces.getByRole('button', { name: '얼굴 1 · 사진 2장' }).click();
    await expect(tiles).toHaveCount(2);
    const shown = await tiles.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    expect(shown.every((src) => /-2[12]=/.test(src))).toBe(true);

    await faces.getByRole('button', { name: '모든 사진' }).click();
    await expect(tiles).toHaveCount(3);
  });

  test('얼굴 목록 — 관계없는 사람은 길게 눌러 나온 X 로 뺀다 (사진은 그대로)', async ({ page, request }) => {
    await page.route('https://lh3.googleusercontent.com/**', (route) => route.fulfill({
      contentType: 'image/png', body: FACELESS_PNG.buffer, headers: { 'Access-Control-Allow-Origin': '*' }
    }));
    const id = sessions.album.removeFaceEventId;
    await page.goto(`/photos/${id}`);
    const tiles = page.locator('.ui-media-tile');
    const faces = page.getByRole('group', { name: '얼굴로 사진 찾기' });
    await expect(tiles).toHaveCount(3);
    await expect(faces.getByRole('button', { name: /^얼굴 \d+ · 사진 2장$/ })).toHaveCount(2);

    // 길게 누르기: 누른 채 0.7초 → X. 손을 뗄 때 오는 click 은 그 얼굴을 고르지 않는다
    const longPress = async (button) => {
      await button.scrollIntoViewIfNeeded();   // 마우스 좌표는 화면 기준 — 화면 밖이면 페이지 바탕을 누른다
      const at = await button.boundingBox();
      await page.mouse.move(at.x + at.width / 2, at.y + 20);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
    };

    // 등록된 아이로 묶인 사람(다)은 길게 눌러도 X 가 없다
    await longPress(faces.getByRole('button', { name: '얼굴 3 · 사진 1장' }));
    await expect(faces.getByRole('button', { name: /목록에서 빼기/ })).toHaveCount(0);
    await faces.getByRole('button', { name: '모든 사진' }).click();   // 뺄 수 없는 얼굴은 평소처럼 골라졌다 — 다시 전체로
    await expect(tiles).toHaveCount(3);

    const second = faces.getByRole('button', { name: '얼굴 2 · 사진 2장' });
    await second.scrollIntoViewIfNeeded();
    const box = await second.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    // X 는 그 얼굴 칸 안, 보이는 목록 안에 온전히 그려진다(칸 밖으로 내밀었을 때 목록 끝 얼굴에서 잘렸다)
    const remove = faces.getByRole('button', { name: '얼굴 2 목록에서 빼기' });
    const inside = (inner, outer) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
      && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
    const xBox = await remove.boundingBox();
    expect(inside(xBox, await remove.locator('xpath=..').boundingBox())).toBe(true);
    expect(inside(xBox, await faces.boundingBox())).toBe(true);
    await remove.click();

    await expect(page.getByText('얼굴을 목록에서 뺐어요', { exact: false })).toBeVisible();
    await expect(faces.getByRole('button', { name: /^얼굴 \d+ · / })).toHaveCount(2);   // 가 + 등록된 아이(다)
    await expect(tiles).toHaveCount(3);   // 사진은 그대로

    // 서버에도: 남은 사람은 하나, 그 사람만 나온 사진은 '얼굴 없음' 이 됐고 다시 분석할 목록에는 안 들어간다
    const people = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album/people`);
    expect(people.body.people).toHaveLength(2);
    expect(people.body.people.map((one) => one.removable).sort()).toEqual([false, true]);
    const album = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
    expect(album.body.counts.unanalyzed).toBe(0);
  });

  test('예전 규칙으로 붙은 자동 태그는 앨범을 열 때 다시 매칭돼 사라진다 (임계값·규칙이 바뀐 뒤)', async ({ request }) => {
    const id = sessions.album.staleEventId;

    // 픽스처: 기준 얼굴과 전혀 다른 얼굴에 'face' 태그(거리 0.45)가 붙어 있고, 앨범은 어떤 규칙으로도 맞춰 본 적이 없다
    const first = await api(request, sessions.teacher, 'GET', `/api/events/${id}/media`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].faceCount).toBe(1);
    expect(first.body.items[0].tags).toEqual([]);

    // 다시 열어도 같다(이미 지금 규칙으로 적어 두었다)
    const again = await api(request, sessions.teacher, 'GET', `/api/events/${id}/media`);
    expect(again.body.items[0].tags).toEqual([]);
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

  // FR-519 — 사진 전용 폴더의 이름·날짜 수정과 삭제
  test('사진 폴더의 이름·날짜를 고친다 — 앨범 화면의 [폴더 관리] 메뉴에서', async ({ page, request }) => {
    const title = `e2e 고칠폴더 ${run}`;
    const renamed = `e2e 고친폴더 ${run}`;
    const created = await api(request, sessions.teacher, 'POST', '/api/albums', { title, date: '2026-09-28' });
    expect(created.status).toBe(201);
    const id = created.body.target.eventId;

    try {
      await page.goto(`/photos/${id}`);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();

      await page.getByRole('button', { name: '폴더 관리' }).click();
      await page.getByRole('menuitem', { name: /이름 · 날짜 수정/ }).click();
      const dialog = page.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });
      await expect(dialog.getByLabel('이름')).toHaveValue(title);
      await expect(dialog.getByRole('button', { name: '저장' })).toBeDisabled();   // 바꾼 것이 없다

      await dialog.getByLabel('이름').fill(renamed);
      await dialog.getByLabel('날짜').fill('2026-10-03');
      await expect(dialog.getByText(`2026-10-03 ${renamed}`)).toBeVisible();   // Drive 에 생길 폴더 이름
      await dialog.getByRole('button', { name: '저장' }).click();

      await expect(page.locator('.ui-toast')).toContainText('폴더 이름·날짜를 바꿨어요');
      await expect(page.getByRole('heading', { name: renamed })).toBeVisible();
      await expect(page.getByText(/2026-10-03 \(.\) · 사진 폴더/)).toBeVisible();

      const album = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
      expect(album.body).toMatchObject({ eventTitle: renamed, eventDate: '2026-10-03', expectedFolderName: `2026-10-03 ${renamed}` });

      // 같은 이름·날짜의 다른 폴더로는 바꿀 수 없다 (409)
      const other = await api(request, sessions.teacher, 'POST', '/api/albums', { title: `${title} 2`, date: '2026-09-28' });
      const clash = await api(request, sessions.teacher, 'PATCH', `/api/albums/${other.body.target.eventId}`, { title: renamed, date: '2026-10-03' });
      expect(clash.status).toBe(409);
      await api(request, sessions.teacher, 'DELETE', `/api/albums/${other.body.target.eventId}`);
    } finally {
      await api(request, sessions.teacher, 'DELETE', `/api/albums/${id}`);
    }
  });

  test('사진 폴더를 지우면 사진 기록까지 사라지고 목록으로 돌아온다 — Drive 폴더는 남는다고 알린다', async ({ page, request }) => {
    const id = sessions.album.doomedFolderEventId;
    const title = sessions.album.doomedFolderTitle;

    await page.goto(`/photos/${id}`);
    await expect(page.locator('.ui-media-tile')).toHaveCount(1);

    await page.getByRole('button', { name: '폴더 관리' }).click();
    await page.getByRole('menuitem', { name: /폴더 삭제/ }).click();
    const dialog = page.getByRole('dialog', { name: `‘${title}’ 폴더를 지울까요?` });
    await expect(dialog).toContainText('폴더와 사진·영상 1개가 앱에서 사라지고, 되돌릴 수 없어요.');
    await expect(dialog).toContainText('Google Drive 의 폴더와 원본 파일은 그대로 남아요.');

    // 취소하면 그대로다
    await dialog.getByRole('button', { name: '취소' }).click();
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`)).status).toBe(200);

    await page.getByRole('button', { name: '폴더 관리' }).click();
    await page.getByRole('menuitem', { name: /폴더 삭제/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '폴더 삭제' }).click();

    // 사진 목록으로 돌아오고, 그 폴더 카드는 없다
    await expect(page).toHaveURL(/\/photos$/);
    await expect(page.locator('.ui-toast')).toContainText('폴더를 지웠어요 · Google Drive 의 폴더는 그대로 있어요');
    await expect(page.getByText(title)).toHaveCount(0);

    // 폴더도, 그 안의 사진 기록도 없다
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`)).status).toBe(404);
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${id}/media`)).status).toBe(404);
    const list = await api(request, sessions.teacher, 'GET', '/api/albums');
    expect(list.body.albums.some((a) => a.eventId === id)).toBe(false);
    expect(list.body.targets.some((t) => t.eventId === id)).toBe(false);
  });

  test('이벤트 앨범의 사진 폴더를 지우면 앨범만 사라지고 이벤트와 신청은 남는다', async ({ page, request }) => {
    const id = sessions.album.doomedEventId;
    const title = sessions.album.doomedEventTitle;
    const before = await api(request, sessions.teacher, 'GET', `/api/events/${id}/registrations`);
    expect(before.status).toBe(200);
    const registrationCount = before.body.registrations.length;
    expect(registrationCount).toBeGreaterThan(0);

    await page.goto(`/photos/${id}`);
    await expect(page.locator('.ui-media-tile')).toHaveCount(1);

    // 이벤트 앨범의 메뉴에는 폴더 삭제만 있다 — 이름·날짜는 이벤트 관리에서 고친다
    await page.getByRole('button', { name: '폴더 관리' }).click();
    await expect(page.getByRole('menuitem', { name: /이름 · 날짜 수정/ })).toHaveCount(0);
    await page.getByRole('menuitem', { name: /폴더 삭제/ }).click();
    const dialog = page.getByRole('dialog', { name: `‘${title}’ 사진 폴더를 지울까요?` });
    await expect(dialog).toContainText('사진 폴더와 사진·영상 1개가 앱과 학부모 화면에서 사라지고, 되돌릴 수 없어요.');
    await expect(dialog).toContainText('이벤트와 신청·참가 학생은 이벤트 관리에 그대로 남아요.');
    await dialog.getByRole('button', { name: '폴더 삭제' }).click();

    // 사진 목록으로 돌아오고, 그 앨범 카드는 없다
    await expect(page).toHaveURL(/\/photos$/);
    await expect(page.locator('.ui-toast')).toContainText('사진 폴더를 지웠어요 · 이벤트와 Google Drive 의 폴더는 그대로 있어요');
    await expect(page.getByText(title)).toHaveCount(0);

    // 이벤트와 신청은 그대로, 앨범은 앨범을 만들기 전으로
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${id}`)).status).toBe(200);
    const after = await api(request, sessions.teacher, 'GET', `/api/events/${id}/registrations`);
    expect(after.body.registrations.length).toBe(registrationCount);
    const album = await api(request, sessions.teacher, 'GET', `/api/events/${id}/album`);
    expect(album.status).toBe(200);
    expect(album.body).toMatchObject({ driveFolderId: null, albumStatus: 'none', published: false });
    const list = await api(request, sessions.teacher, 'GET', '/api/albums');
    expect(list.body.albums.some((a) => a.eventId === id)).toBe(false);
    // [사진 올리기] 대상에는 남는다 — 다시 올리면 새 앨범으로 시작한다
    expect(list.body.targets.find((t) => t.eventId === id)).toMatchObject({ hasAlbum: false, count: 0 });
    // 학부모 사진 탭에서도 사라진다
    const parentAlbums = await api(request, sessions.parent, 'GET', '/api/parent/albums');
    expect(parentAlbums.body.items.some((a) => a.eventId === id)).toBe(false);

    // 한 번 더 지우려 하면 지울 사진 폴더가 없다
    const again = await api(request, sessions.teacher, 'DELETE', `/api/albums/${id}`);
    expect(again.status).toBe(404);
    expect(again.body.reason).toBe('no_album');
  });

  test('폴더 수정 API 는 사진 폴더에만 된다 — 이벤트 앨범은 400, 학부모는 403', async ({ request }) => {
    const eventAlbum = sessions.album.eventId;
    const patchEvent = await api(request, sessions.teacher, 'PATCH', `/api/albums/${eventAlbum}`, { title: 'x', date: '2026-10-03' });
    expect(patchEvent.status).toBe(400);
    expect(patchEvent.body.reason).toBe('not_photo_folder');
    // 이벤트는 그대로 있다
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${eventAlbum}`)).status).toBe(200);

    const asParent = await api(request, sessions.parent, 'DELETE', `/api/albums/${sessions.album.folderEventId}`);
    expect(asParent.status).toBe(403);
    expect((await api(request, sessions.teacher, 'GET', `/api/events/${sessions.album.folderEventId}/album`)).status).toBe(200);

    const missing = await api(request, sessions.teacher, 'DELETE', '/api/albums/999999');
    expect(missing.status).toBe(404);
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
// 사진을 올릴 때 그 앨범(폴더)에 같은 파일(원래 이름 + 크기)이 이미 있으면 건너뛰고 알려 준다.
// 따로 된 선생님(sessions.sameFile)은 Google 연결 행이 있어 서버의 업로드 권한 검사를 통과한다 — 토큰은 가짜라,
// 진짜 서버로 도는 것은 "전부 이미 있는" 경우뿐이다(그때는 Drive 를 부르지 않는다).
test.describe('선생님 — 앨범에 이미 있는 파일은 다시 올리지 않는다', () => {
  const same = sessions.sameFile;
  const jpeg = (file) => ({ name: file.name, mimeType: 'image/jpeg', buffer: Buffer.alloc(file.size, 1) });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, same.teacher);
    // e2e 서버에는 Google 키가 없어 [사진 올리기] 가 잠긴다 — 앨범 응답의 '설정됨' 만 켠다(연결 행은 setup 이 넣었다).
    await page.route(`**/api/events/${same.eventId}/album`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, drive: { ...body.drive, configured: true } } });
    });
  });

  test('이미 있는 파일만 고르면 올리지 않고 "이미 앨범에 있어요" 로 알려 준다 (진짜 서버)', async ({ page, request }) => {
    const before = await api(request, same.teacher, 'GET', `/api/events/${same.eventId}/album`);
    expect(before.body.counts.images).toBe(2);

    await page.goto(`/photos/${same.eventId}`);
    await page.getByRole('button', { name: '사진 올리기' }).first().click();
    const sheet = page.getByRole('dialog');
    await page.getByTestId('album-file-input').setInputFiles(same.files.map(jpeg));
    await sheet.getByRole('button', { name: '2개 올리기' }).click();

    await expect(sheet.getByRole('heading', { name: '이미 앨범에 있어요' })).toBeVisible();
    await expect(sheet.getByText(/고른 파일 2개가 모두 이미 앨범에 있어서 새로 올리지 않았어요/)).toBeVisible();
    await expect(sheet.getByText('같은 이름·크기의 파일이 있어요.')).toBeVisible();
    for (const file of same.files) {
      await expect(sheet.getByText(file.name, { exact: true })).toBeVisible();
    }
    await expect(sheet.getByText('이미 있어요', { exact: true })).toHaveCount(2);
    await expect(sheet.getByText(/올렸어요/)).toHaveCount(0);

    const after = await api(request, same.teacher, 'GET', `/api/events/${same.eventId}/album`);
    expect(after.body.counts.images).toBe(2);
  });

  test('업로드 세션 API — 이미 있는 파일은 세션 대신 건너뜀으로 답한다 (자모가 나뉜 한글 이름도)', async ({ request }) => {
    const files = [
      { name: 'IMG_dup.jpg', size: 4 },
      { name: '대회사진.jpg'.normalize('NFD'), size: 5 },
      { name: '문서.pdf', size: 10 }
    ];
    const response = await api(request, same.teacher, 'POST', `/api/events/${same.eventId}/media/uploads`, { files });

    expect(response.status).toBe(201);
    expect(response.body.items).toEqual([
      { name: 'IMG_dup.jpg', skipped: true, reason: 'duplicate' },
      { name: files[1].name, skipped: true, reason: 'duplicate' },
      expect.objectContaining({ name: '문서.pdf', reason: 'type' })
    ]);

    // 이름이 같아도 크기가 다르면 다른 파일 — 올리려고 Drive 를 부른다(e2e 에는 Google 이 없어 여기서 멈춘다)
    const differentSize = await api(request, same.teacher, 'POST', `/api/events/${same.eventId}/media/uploads`,
      { files: [{ name: 'IMG_dup.jpg', size: 6 }] });
    expect(differentSize.status).toBe(400);
    expect(differentSize.body.reason).toBe('not_configured');
  });

  test('새 파일과 섞여 있으면 새 파일만 올리고, 건너뛴 파일은 처음부터 "이미 있어요" 로 따로 알려 준다', async ({ page }) => {
    // 새 파일은 Drive 가 있어야 올라간다 — 세션 발급 · Drive 전송 · 완료 보고만 가짜로 바꾼다
    const sessionUri = 'https://drive-upload.e2e.invalid/session-1';
    let releaseUpload;
    const uploadHeld = new Promise((resolve) => { releaseUpload = resolve; });
    await page.route(`**/api/events/${same.eventId}/media/uploads`, (route) => route.fulfill({
      status: 201,
      json: { items: [{ name: 'IMG_dup.jpg', skipped: true, reason: 'duplicate' }, { name: 'IMG_new.jpg', mediaId: 999999, sessionUri }] }
    }));
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': '*' };
    await page.route('https://drive-upload.e2e.invalid/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      await uploadHeld;
      return route.fulfill({ status: 200, headers: cors, json: { id: 'e2e-new-drive-file' } });
    });
    await page.route(`**/api/events/${same.eventId}/media/999999/**`, (route) => route.fulfill({ json: { media: {} } }));
    await page.route('https://lh3.googleusercontent.com/**', (route) => route.abort());

    await page.goto(`/photos/${same.eventId}`);
    await page.getByRole('button', { name: '사진 올리기' }).first().click();
    const sheet = page.getByRole('dialog');
    await page.getByTestId('album-file-input').setInputFiles([jpeg({ name: 'IMG_dup.jpg', size: 4 }), jpeg({ name: 'IMG_new.jpg', size: 7 })]);
    await sheet.getByRole('button', { name: '2개 올리기' }).click();

    // 새 파일이 올라가는 동안 — 건너뛸 파일은 진행률 없이 "이미 있어요"
    await expect(sheet.getByRole('button', { name: /올리는 중/ })).toBeVisible();
    await expect(sheet.getByText('이미 있어요', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('progressbar', { name: 'IMG_new.jpg 업로드 진행률' })).toBeVisible();
    await expect(sheet.getByRole('progressbar', { name: 'IMG_dup.jpg 업로드 진행률' })).toHaveCount(0);
    releaseUpload();

    await expect(sheet.getByRole('heading', { name: '다 올렸어요' })).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText(/사진 1장 올렸어요/)).toBeVisible();
    await expect(sheet.getByText(/이미 앨범에 있는 파일 1개는 건너뛰었어요/)).toBeVisible();
    await expect(sheet.getByText('IMG_dup.jpg', { exact: true })).toBeVisible();
  });
});

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
