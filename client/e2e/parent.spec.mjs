import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api } from './helpers.mjs';

const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));
const childName = sessions.students[0].name;
const run = `${sessions.stamp}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('학부모 — 가입부터 신청까지', () => {
  test('초대 링크는 로그인 없이 선생님 이름을 보여준다', async ({ page }) => {
    await page.goto(`/invite/${sessions.invite}`);
    await expect(page.getByRole('button', { name: /카카오로 시작하기/ })).toBeVisible();
    await expect(page.getByText(/선생님의 초대/)).toBeVisible();
  });

  test('잘못된 초대 링크는 안내를 보여준다', async ({ page }) => {
    await page.goto('/invite/definitely-not-a-token');
    await expect(page.getByText('유효하지 않은 초대 링크예요')).toBeVisible();
  });

  test('아이를 등록하면 학생과 연결되고 일정이 열린다', async ({ page, request }) => {
    await loginAs(page, sessions.parent);
    await page.goto('/parent/schedule');

    // 아이가 아직 없으면 어떤 주소로 와도 온보딩으로 보낸다.
    // 리다이렉트는 내 정보를 읽은 뒤에 일어나므로 주소가 아니라 화면으로 판단한다.
    // (이미 등록한 상태로 다시 돌릴 수도 있어 두 경우를 모두 받아들인다)
    const onboarding = page.getByRole('heading', { name: '아이 정보를 알려 주세요' });
    const schedule = page.getByText(/년 남은 일정/);
    await expect(onboarding.or(schedule).first()).toBeVisible();

    let onboarded = false;
    if (await onboarding.isVisible()) {
      await page.getByLabel('이름').first().fill(childName);
      await page.getByLabel('생년월일').first().fill(sessions.students[0].birthdate);
      // 학부모명은 아이 이름에서 자동으로 제안된다
      await expect(page.getByRole('textbox', { name: /학부모명/ })).toHaveValue(`${childName}엄마`);
      await page.getByRole('button', { name: '시작하기' }).click();
      await expect(page).toHaveURL(/\/parent\/schedule$/);
      onboarded = true;
    }

    await expect(page.getByText(/년 남은 일정/)).toBeVisible();

    // 이름·생년월일이 정확히 맞았으므로 학생과 연결돼 있어야 한다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    const child = me.body.children.find((c) => c.childName === childName);
    expect(child.status).toBe('linked');
    expect(child.studentName).toBe(childName);

    // 가입 때 정한 학부모명이 저장돼 있다 (이미 가입한 상태로 다시 돌린 경우는 건너뛴다)
    if (onboarded) expect(me.body.user.displayName).toBe(`${childName}엄마`);
  });

  test('내 정보에서 학부모명을 바꾼다', async ({ page, request }) => {
    await loginAs(page, sessions.parent);
    await page.goto('/parent/settings');

    const before = await api(request, sessions.parent, 'GET', '/api/parent/me');

    await page.getByRole('button', { name: '변경' }).first().click();
    // 입력칸은 20자까지라 짧은 이름을 쓴다
    await page.getByRole('textbox', { name: /학부모명/ }).fill('칸쵸엄마');
    await page.getByRole('button', { name: '저장' }).click();

    await expect(page.getByText('칸쵸엄마', { exact: true })).toBeVisible();

    // 다른 테스트가 기대하는 이름으로 되돌린다
    if (before.body?.user?.displayName) {
      await api(request, sessions.parent, 'PUT', '/api/parent/name', {
        parentName: before.body.user.displayName
      });
    }
  });

  test('대회를 신청하고 옵션을 바꾸고 취소한다', async ({ page, request }) => {
    // 신청할 대회를 선생님 쪽에서 하나 만들어 둔다
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'special',
      title: `e2e 러닝 ${run}`,
      date: '2026-11-28',
      startTime: '10:00',
      location: 'e2e 한강공원',
      options: ['5km', '10km']
    });
    expect(created.status).toBe(201);

    await loginAs(page, sessions.parent);
    await page.goto('/parent/schedule');

    const card = page.getByRole('button', { name: new RegExp(`e2e 러닝 ${run}`) }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('신청 가능');

    await card.click();
    await page.getByRole('button', { name: '5km' }).click();
    await page.getByRole('button', { name: /신청하기|참가 신청/ }).click();

    await expect(page.getByText(/신청 완료/).first()).toBeVisible();

    // 옵션 변경
    await page.getByRole('button', { name: '10km' }).click();
    await page.getByRole('button', { name: '옵션 변경' }).click();
    await expect(page.getByText(/5km, 10km|10km/).first()).toBeVisible();

    // 선생님 쪽에서도 같은 내용이 보인다
    const events = await api(request, sessions.teacher, 'GET', '/api/events?includePast=true');
    const target = events.body.find((e) => e.title === `e2e 러닝 ${run}`);
    const regs = await api(request, sessions.teacher, 'GET', `/api/events/${target.id}/registrations`);
    expect(regs.body.activeCount).toBe(1);
    expect(regs.body.registrations[0].studentName).toBe(childName);

    // 취소하면 카드 배지가 되돌아간다
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '신청 취소' }).click();
    await expect(page.getByText('신청을 취소했어요')).toBeVisible();
  });

  test('휴관일은 신청 영역 없이 안내만 보여준다', async ({ page, request }) => {
    await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'closure',
      title: `e2e 휴관안내 ${run}`,
      date: '2026-12-28',
      description: '연말 휴관입니다.'
    });

    await loginAs(page, sessions.parent);
    await page.goto('/parent/schedule');

    await page.getByRole('button', { name: new RegExp(`e2e 휴관안내 ${run}`) }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('휴관일 안내예요. 신청은 필요 없어요.')).toBeVisible();
    // 시트 안에는 닫기만 있고 신청 관련 버튼이 없다
    await expect(sheet.getByRole('button', { name: /신청/ })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: '닫기' })).toBeVisible();
  });

  test('학부모 토큰으로는 선생님 API 에 닿지 않는다', async ({ request }) => {
    for (const path of ['/api/students', '/api/events', '/api/parents', '/api/competitions',
      '/api/drive/account', `/api/events/${sessions.album.eventId}/album`,
      `/api/events/${sessions.album.eventId}/media`]) {
      const res = await api(request, sessions.parent, 'GET', path);
      expect(res.status, `${path} 는 막혀야 한다`).toBe(403);
    }

    // 학부모가 써야 하는 경로는 열려 있다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    expect(me.status).toBe(200);
  });
});

test.describe('학부모 — 사진', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, sessions.parent);
  });

  test('사진 탭에 확정된 이벤트의 앨범만 보인다', async ({ page }) => {
    await page.goto('/parent/photos');

    await expect(page.getByText(/e2e확정대회/)).toBeVisible();
    await expect(page.getByText(/e2e미확정대회/)).toHaveCount(0);
  });

  test('앨범을 열면 갤러리가 보이고 우리 아이만 토글이 걸러 준다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.eventId}`);

    const tiles = page.getByRole('button', { name: /사진 열기|영상 열기/ });
    await expect(tiles).toHaveCount(sessions.album.totalCount);

    await page.getByRole('button', { name: /우리 아이 사진만 보기/ }).click();
    await expect(tiles).toHaveCount(sessions.album.taggedCount);

    // 다시 끄면 전체로 돌아온다
    await page.getByRole('button', { name: /우리 아이 사진만 보기/ }).click();
    await expect(tiles).toHaveCount(sessions.album.totalCount);
  });

  test('사진을 누르면 뷰어가 열리고 원본을 저장할 수 있다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '사진 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    await expect(viewer).toBeVisible();

    const save = viewer.getByRole('link', { name: /저장/ });
    await expect(save).toHaveAttribute('href', /drive\.google\.com\/uc\?export=download/);

    // 좌우로 넘길 수 있다
    await viewer.getByRole('button', { name: '다음 사진' }).click();
    await expect(viewer).toBeVisible();

    await viewer.getByRole('button', { name: '닫기' }).click();
    await expect(viewer).toHaveCount(0);
  });

  test('내가 올린 사진에만 삭제가 보인다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: /내가 올린 것/ }).click();

    await page.getByRole('button', { name: '사진 열기' }).first().click();
    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    await expect(viewer.getByRole('button', { name: '삭제' })).toBeVisible();
  });

  test('확정되지 않은 이벤트의 앨범은 열리지 않는다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.lockedEventId}`);

    await expect(page.getByText('아직 사진을 볼 수 없어요')).toBeVisible();
  });

  test('내 정보에서 자녀 얼굴을 등록할 수 있다', async ({ page }) => {
    await page.goto('/parent/settings');

    await expect(page.getByRole('heading', { name: '우리 아이 사진 찾기' })).toBeVisible();
    await page.getByRole('button', { name: /얼굴 사진 등록/ }).first().click();
    // 동의를 끄면 사진을 고를 수 없다
    await expect(page.getByRole('button', { name: '사진 고르기' })).toBeEnabled();
    await page.getByRole('checkbox').first().uncheck();
    await expect(page.getByRole('button', { name: '사진 고르기' })).toBeDisabled();
  });
});
