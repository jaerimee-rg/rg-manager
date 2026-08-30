import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, loginOnceAs, api } from './helpers.mjs';

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

  test('좁은 관리자 사이드바에서도 전환 항목이 한 줄로 들어간다', async ({ page }) => {
    await loginAs(page, sessions.admin);
    await page.goto('/admin/users');

    // 픽스처의 관리자는 선생님(e2e선생님_<stamp>, 긴 이름)과 카카오 계정을 공유하므로
    // 첫 항목이 "선생님 화면으로 + 계정 이름" 이다.
    const item = page.locator('.admin-sidebar-footer .role-switch-item').first();
    await expect(item).toBeVisible();
    await expect(item.locator('small')).toHaveText(sessions.teacher.user.username);

    // 긴 계정 이름이 라벨을 밀어 네 줄로 접히던 문제: 수정 전 107px, 후 39px
    const box = await item.boundingBox();
    expect(box.height).toBeLessThan(48);

    // 라벨은 한 줄로 남고, 이름 쪽이 항목 안에서 말줄임된다(항목 밖으로 삐져나오지 않는다).
    const metrics = await item.evaluate((el) => {
      const me = el.getBoundingClientRect();
      const name = el.querySelector('small');
      return {
        labelHeight: el.querySelector('span').getBoundingClientRect().height,
        nameOverhang: name.getBoundingClientRect().right - me.right,
        nameClipped: name.scrollWidth > name.clientWidth
      };
    });
    expect(metrics.labelHeight).toBeLessThan(30);
    expect(metrics.nameOverhang).toBeLessThanOrEqual(1);
    // 양성 대조: 픽스처 이름이 항목 폭을 넘지 않으면 이 테스트는 접힘을 증명하지 못한다.
    expect(metrics.nameClipped, '픽스처 이름이 항목 폭보다 길어야 한다').toBe(true);
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

test.describe('학부모 — 연결된 선생님의 일정만 (docs/accounts-roles FR-357)', () => {
  test('선생님 한 명과 연결된 학부모에게는 다른 선생님의 일정이 목록에 없다', async ({ request }) => {
    const res = await api(request, sessions.parent, 'GET', '/api/parent/events');

    expect(res.status).toBe(200);
    expect(res.body.teachers.map((t) => t.id)).toEqual([sessions.teacher.user.id]);
    // 두 번째 선생님의 공개 이벤트(e2eB러닝)는 이 학부모와 무관하다
    expect(res.body.events.some((e) => e.id === sessions.teacher2.eventId)).toBe(false);
    expect(res.body.events.every((e) => e.teacherId === sessions.teacher.user.id)).toBe(true);
  });

  test('연결되지 않은 선생님 id 로 필터해도 그 선생님 일정은 오지 않는다', async ({ request }) => {
    const res = await api(request, sessions.parent, 'GET', `/api/parent/events?teacherId=${sessions.teacher2.id}`);

    expect(res.status).toBe(200);
    expect(res.body.events.some((e) => e.teacherId === sessions.teacher2.id)).toBe(false);
  });

  test('연결되지 않은 선생님의 이벤트 상세는 404', async ({ request }) => {
    const res = await api(request, sessions.parent, 'GET', `/api/parent/events/${sessions.teacher2.eventId}`);
    expect(res.status).toBe(404);
  });
});

test.describe('학부모에게 보이는 선생님 이름 — 표시 이름 (users.displayName)', () => {
  test('내 정보의 연결된 선생님은 카카오 식별자가 아니라 표시 이름으로 나온다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'GET', '/api/parent/me');

    expect(res.status).toBe(200);
    const teacherB = res.body.teachers.find((t) => t.id === sessions.teacher2.id);
    expect(teacherB.name).toBe(sessions.teacher2.displayName);
    expect(JSON.stringify(res.body)).not.toContain(sessions.teacher2.username);

    // 자녀에 붙는 선생님 이름도 같다
    const childOfB = res.body.children.find((c) => c.teacherId === sessions.teacher2.id);
    expect(childOfB.teacherName).toBe(sessions.teacher2.displayName);
  });

  test('일정 카드의 선생님 이름도 표시 이름이다', async ({ request }) => {
    const res = await api(request, sessions.parentMulti, 'GET', '/api/parent/events');

    const card = res.body.events.find((e) => e.id === sessions.teacher2.eventId);
    expect(card.teacherName).toBe(sessions.teacher2.displayName);
    expect(res.body.teachers.find((t) => t.id === sessions.teacher2.id).name).toBe(sessions.teacher2.displayName);
  });

  test('초대 링크 확인도 표시 이름을 준다', async ({ request }) => {
    const response = await request.get(`/api/invite/${sessions.teacher2.invite}`);
    const body = await response.json();
    expect(body.teacherName).toBe(sessions.teacher2.displayName);
  });

  test('내 정보 화면에 표시 이름이 보인다', async ({ page }) => {
    await loginAs(page, sessions.parentMulti);
    await page.goto('/parent/settings');

    await expect(page.getByText(`${sessions.teacher2.displayName} 선생님`).first()).toBeVisible();
    await expect(page.getByText(sessions.teacher2.username)).toHaveCount(0);
  });

  test('선생님은 같은 사람의 다른 역할과 겹치는 이름도 표시 이름으로 쓸 수 있다', async ({ request }) => {
    // 첫 선생님의 username 과 같은 이름을 두 번째 선생님이 표시 이름으로 쓴다 (UNIQUE 는 username 에만 걸린다)
    const teacher2Session = { token: sessions.teacher2Token };
    test.skip(!teacher2Session.token, '두 번째 선생님 세션이 없다');

    const res = await api(request, teacher2Session, 'PUT', '/api/auth/username', { username: sessions.teacher.user.username });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe(sessions.teacher.user.username);
    expect(res.body.user.username).toBe(sessions.teacher2.username);

    // 되돌려 두어 다른 테스트가 표시 이름을 그대로 본다
    await api(request, teacher2Session, 'PUT', '/api/auth/username', { username: sessions.teacher2.displayName });
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

test.describe('다른 계정으로 로그인 (관리자, FR-388)', () => {
  const impersonate = (request, session, targetId) =>
    api(request, session, 'POST', `/api/auth/users/${targetId}/impersonate`);

  test('관리자는 선생님 계정의 토큰을 받고, 그 토큰은 누가 들어왔는지 안다', async ({ request }) => {
    const res = await impersonate(request, sessions.admin, sessions.teacher.user.id);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('user');
    expect(res.body.user.id).toBe(sessions.teacher.user.id);
    expect(res.body.impersonator).toMatchObject({ id: sessions.admin.user.id, username: sessions.admin.user.username });

    const asTeacher = { token: res.body.token };
    // 선생님 API 가 열린다
    expect((await api(request, asTeacher, 'GET', '/api/students')).status).toBe(200);
    // 토큰 확인 응답이 원래 관리자를 알려준다 (화면 배너가 이걸 쓴다)
    const verify = await api(request, asTeacher, 'GET', '/api/auth/verify');
    expect(verify.status).toBe(200);
    expect(verify.body.user.id).toBe(sessions.teacher.user.id);
    expect(verify.body.impersonatedBy.id).toBe(sessions.admin.user.id);
    // 그 상태로는 역할 전환도, 또 다른 계정으로 들어가기도 막힌다
    expect((await api(request, asTeacher, 'POST', '/api/auth/switch-role', { role: 'admin' })).status).toBe(403);
    expect((await impersonate(request, asTeacher, sessions.parentMulti.user.id)).status).toBe(403);
  });

  test('학부모 계정으로 들어가면 학부모 API 만 열린다', async ({ request }) => {
    const res = await impersonate(request, sessions.admin, sessions.parentMulti.user.id);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('parent');

    const asParent = { token: res.body.token };
    expect((await api(request, asParent, 'GET', '/api/parent/me')).status).toBe(200);
    expect((await api(request, asParent, 'GET', '/api/students')).status).toBe(403);
  });

  test('선생님·학부모는 쓸 수 없고, 관리자도 자기 자신으로는 안 된다', async ({ request }) => {
    expect((await impersonate(request, sessions.teacher, sessions.parentMulti.user.id)).status).toBe(403);
    expect((await impersonate(request, sessions.parentMulti, sessions.teacher.user.id)).status).toBe(403);
    expect((await impersonate(request, sessions.admin, sessions.admin.user.id)).status).toBe(400);
    expect((await impersonate(request, sessions.admin, 999999999)).status).toBe(404);
  });

  test('사용자 관리에서 들어갔다가 배너로 관리자에게 돌아온다', async ({ page }) => {
    // 전체 새로고침을 거치므로 세션은 한 번만 넣는다 (init script 면 매번 관리자로 되돌아간다)
    await loginOnceAs(page, sessions.admin);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible();

    // 내 행에는 버튼이 없다
    const myRow = page.locator('tr', { hasText: sessions.admin.user.username }).first();
    await expect(myRow.getByRole('button', { name: '이 계정으로 로그인' })).toHaveCount(0);

    page.once('dialog', (dialog) => dialog.accept()); // confirm
    const teacherRow = page.locator('tr', { hasText: sessions.teacher.user.username }).first();
    await teacherRow.getByRole('button', { name: '이 계정으로 로그인' }).click();

    // 선생님 시작 화면 + 배너
    await expect(page).toHaveURL(/\/$/);
    const banner = page.getByTestId('impersonation-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(sessions.admin.user.username);
    await expect(banner).toContainText(sessions.teacher.user.username);
    // 선생님 헤더의 역할 메뉴는 숨는다 (전환이 막혀 있으므로)
    await expect(page.locator('.role-switch-trigger')).toHaveCount(0);
    // 저장된 세션은 선생님, 돌아갈 관리자 세션은 따로
    const stored = await page.evaluate(() => ({
      user: JSON.parse(localStorage.getItem('user')),
      impersonator: JSON.parse(localStorage.getItem('impersonator'))
    }));
    expect(stored.user.id).toBe(sessions.teacher.user.id);
    expect(stored.impersonator.user.id).toBe(sessions.admin.user.id);

    await banner.getByRole('button', { name: '관리자로 돌아가기' }).click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole('heading', { name: '사용자 관리' })).toBeVisible();
    await expect(page.getByTestId('impersonation-banner')).toHaveCount(0);
    const after = await page.evaluate(() => ({
      user: JSON.parse(localStorage.getItem('user')),
      impersonator: localStorage.getItem('impersonator')
    }));
    expect(after.user.id).toBe(sessions.admin.user.id);
    expect(after.impersonator).toBeNull();
  });

  test('학부모 계정으로 들어가면 학부모 화면 위에 배너가 붙는다', async ({ page }) => {
    await loginOnceAs(page, sessions.admin);
    await page.goto('/admin/users');

    page.once('dialog', (dialog) => dialog.accept());
    const row = page.locator('tr', { hasText: sessions.parentMulti.user.username }).first();
    await row.getByRole('button', { name: '이 계정으로 로그인' }).click();

    await expect(page).toHaveURL(/\/parent\/schedule$/);
    await expect(page.getByTestId('impersonation-banner')).toContainText(sessions.parentMulti.user.username);
  });
});
