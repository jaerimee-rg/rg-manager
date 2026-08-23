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

    if (await onboarding.isVisible()) {
      await page.getByLabel('이름').first().fill(childName);
      await page.getByLabel('생년월일').first().fill(sessions.students[0].birthdate);
      await page.getByRole('button', { name: '시작하기' }).click();
      await expect(page).toHaveURL(/\/parent\/schedule$/);
    }

    await expect(page.getByText(/년 남은 일정/)).toBeVisible();

    // 이름·생년월일이 정확히 맞았으므로 학생과 연결돼 있어야 한다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    const child = me.body.children.find((c) => c.childName === childName);
    expect(child.status).toBe('linked');
    expect(child.studentName).toBe(childName);
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
    for (const path of ['/api/students', '/api/events', '/api/parents', '/api/competitions']) {
      const res = await api(request, sessions.parent, 'GET', path);
      expect(res.status, `${path} 는 막혀야 한다`).toBe(403);
    }

    // 학부모가 써야 하는 경로는 열려 있다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    expect(me.status).toBe(200);
  });
});
