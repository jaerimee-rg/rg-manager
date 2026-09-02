import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api } from './helpers.mjs';

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

test.describe('선생님 — 앨범', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, sessions.teacher);
  });

  test('설정에 Google Drive 카드가 보이고, 설정 전에는 안내만 나온다', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: /Google Drive/ })).toBeVisible();
    // 환경변수가 없으면 연결 버튼 대신 안내가 나온다 (이번 배포의 기본 상태)
    const guide = page.getByText(/연동이 아직 설정되지 않았습니다/);
    const connect = page.getByRole('button', { name: /Google 계정 연결/ });
    await expect(guide.or(connect).first()).toBeVisible();
  });

  // 이벤트 등록·수정 화면의 사진·영상 섹션은 걷어냈다. 앨범을 다루는 화면이 다시
  // 생기면 그때 그 화면을 대상으로 테스트를 붙인다 — API 는 아래에서 계속 지킨다.
  test('이벤트 수정 화면에는 사진·영상 섹션이 없다', async ({ page }) => {
    await page.goto('/events');
    await page.locator('tr', { hasText: 'e2e확정대회' }).first().getByRole('button', { name: '수정' }).click();

    await expect(page.getByRole('heading', { name: '이벤트 수정' })).toBeVisible();
    await expect(page.getByText(/사진 · 영상/)).toHaveCount(0);
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
