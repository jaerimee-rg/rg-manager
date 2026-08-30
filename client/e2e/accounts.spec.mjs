import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api } from './helpers.mjs';

/**
 * 계정 · 역할 · 초대 체계 (docs/accounts-roles).
 * 카카오 인가 화면은 자동화할 수 없으므로 **콜백 이후** 흐름만 검증한다.
 */
const sessions = JSON.parse(readFileSync(new URL('./.sessions.json', import.meta.url)));

test.describe('선생님 초대 (관리자만 발급)', () => {
  test('초대 랜딩은 유효한 링크에서만 카카오 버튼을 보여준다', async ({ page }) => {
    await page.goto(`/teacher-invite/${sessions.teacherInvite.token}`);

    await expect(page.getByRole('button', { name: /카카오/ })).toBeVisible();
  });

  test('없는 토큰이면 유효하지 않다고 알려준다', async ({ page }) => {
    await page.goto('/teacher-invite/definitely-not-a-real-token');

    await expect(page.getByText(/유효하지 않은 초대 링크/)).toBeVisible();
    await expect(page.getByRole('button', { name: /카카오/ })).toHaveCount(0);
  });

  test('관리자는 초대를 발급하고 회수할 수 있다', async ({ page, request }) => {
    await loginAs(page, sessions.admin);
    await page.goto('/admin/teachers');

    await expect(page.getByRole('heading', { name: '선생님 초대' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초대 링크 만들기' })).toBeVisible();
    // 픽스처로 넣어 둔 미사용 초대가 목록에 보인다
    await expect(page.getByText(`e2e초대_${sessions.stamp}`)).toBeVisible();

    const created = await api(request, sessions.admin, 'POST', '/api/teacher-invites', {
      label: 'e2e 발급', expiresInDays: 7
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(created.body.url).toContain('/teacher-invite/');
    // 토큰 원문은 목록·응답에 따로 노출하지 않는다
    expect(created.body.token).toBeUndefined();

    const revoked = await api(request, sessions.admin, 'POST', `/api/teacher-invites/${created.body.id}/revoke`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('revoked');
  });

  test('선생님·학부모는 초대 API 에 접근할 수 없다', async ({ request }) => {
    expect((await api(request, sessions.teacher, 'GET', '/api/teacher-invites')).status).toBe(403);
    expect((await api(request, sessions.parentMulti, 'GET', '/api/teacher-invites')).status).toBe(403);
  });
});

test.describe('역할 전환 (같은 카카오 계정)', () => {
  test('관리자 → 선생님 계정으로 카카오 없이 전환된다', async ({ request }) => {
    const roles = await api(request, sessions.admin, 'GET', '/api/auth/roles');
    expect(roles.status).toBe(200);
    expect(roles.body.accounts.map((a) => a.role).sort()).toEqual(['admin', 'user']);

    const switched = await api(request, sessions.admin, 'POST', '/api/auth/switch-role', { role: 'user' });
    expect(switched.status).toBe(200);
    expect(switched.body.role).toBe('user');
    expect(switched.body.user.id).toBe(sessions.teacher.user.id);

    // 받은 토큰으로 선생님 API 가 열린다
    const asTeacher = { token: switched.body.token };
    expect((await api(request, asTeacher, 'GET', '/api/students')).status).toBe(200);
  });

  test('없는 역할로는 전환되지 않는다', async ({ request }) => {
    const res = await api(request, sessions.admin, 'POST', '/api/auth/switch-role', { role: 'parent' });
    expect(res.status).toBe(404);
  });

  test('본문에 남의 kakaoId 를 넣어도 전환되지 않는다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'POST', '/api/auth/switch-role', {
      role: 'admin', kakaoId: sessions.sharedKakao, id: sessions.admin.user.id
    });
    expect(res.status).toBe(404);
  });

  test('선생님 헤더에 역할 메뉴가 보인다', async ({ page }) => {
    await loginAs(page, sessions.teacher);
    await page.goto('/');

    await expect(page.getByRole('button', { name: /관리자 화면으로|선생님/ }).first()).toBeVisible();
  });

  test('관리자 계정은 이 경로로 만들 수 없다', async ({ request }) => {
    const res = await api(request, sessions.teacher, 'POST', '/api/auth/roles', { role: 'admin' });
    expect(res.status).toBe(400);
  });
});

test.describe('학부모 — 여러 선생님', () => {
  test('연결된 두 선생님의 일정이 함께 보인다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'GET', '/api/parent/events');

    expect(res.status).toBe(200);
    expect(res.body.teachers.length).toBeGreaterThanOrEqual(2);

    const owners = new Set(res.body.events.map((e) => e.teacherId));
    expect(owners.has(sessions.teacher2.id)).toBe(true);
    // 카드마다 어느 선생님 일정인지 담긴다
    expect(res.body.events.every((e) => e.teacherName)).toBe(true);
  });

  test('선생님 필터를 주면 그 선생님 일정만 온다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'GET', `/api/parent/events?teacherId=${sessions.teacher2.id}`);

    expect(res.status).toBe(200);
    expect(res.body.events.every((e) => e.teacherId === sessions.teacher2.id)).toBe(true);
  });

  test('내 정보에 연결된 선생님이 모두 나온다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'GET', '/api/parent/me');

    expect(res.status).toBe(200);
    expect(res.body.teachers.length).toBeGreaterThanOrEqual(2);
  });

  test('연결되지 않은 선생님의 이벤트는 404 (존재를 알리지 않는다)', async ({ request }) => {
    // 관리자 계정으로 만든 이벤트가 없으므로 아주 큰 id 로 확인한다
    const res = await api(request, sessions.parentMulti, 'GET', '/api/parent/events/99999999');
    expect(res.status).toBe(404);
  });

  test('다른 선생님의 아이로는 그 이벤트에 신청할 수 없다', async ({ request }) => {
    const me = await api(request, sessions.parentMulti, 'GET', '/api/parent/me');
    const childOfB = me.body.children.find((c) => c.teacherId === sessions.teacher2.id);
    test.skip(!childOfB, '두 번째 선생님 자녀가 없다');

    // 첫 번째 선생님의 앨범 이벤트에 두 번째 선생님 아이로 신청 시도
    const res = await api(
      request, sessions.parentMulti, 'PUT',
      `/api/parent/events/${sessions.album.eventId}/registrations/${childOfB.id}`,
      { optionIds: [] }
    );
    expect(res.status).toBe(404);
  });

  test('학부모 화면 일정이 열린다 (선생님 2명)', async ({ page }) => {
    await loginAs(page, sessions.parentMulti);
    await page.goto('/parent/schedule');

    await expect(page.getByText(/일정/).first()).toBeVisible();
  });
});

test.describe('관리자 > 사용자', () => {
  test('학부모는 관리자 계정 부여를 호출할 수 없다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'POST', `/api/auth/users/${sessions.teacher.user.id}/grant-admin`);
    expect(res.status).toBe(403);
  });

  test('자기 자신은 삭제할 수 없다', async ({ request }) => {
    const res = await api(request, sessions.admin, 'DELETE', `/api/auth/users/${sessions.admin.user.id}`);
    expect(res.status).toBe(400);
  });

  test('이미 관리자 계정이 있는 카카오 계정에는 중복 부여되지 않는다', async ({ request }) => {
    // 선생님과 관리자가 같은 카카오 계정을 쓴다
    const res = await api(request, sessions.admin, 'POST', `/api/auth/users/${sessions.teacher.user.id}/grant-admin`);
    expect(res.status).toBe(409);
  });
});
