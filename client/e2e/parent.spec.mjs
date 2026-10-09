import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api, stubPortraitThumbnails, swipeTouch, PORTRAIT_SVG, FACELESS_PNG } from './helpers.mjs';
import { stubKakaoMaps } from './kakao-fakes.mjs';

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

  test('내 아이 줄에는 생년월일과 선생님 이름만 보인다 — 연결된 학생 이름은 적지 않는다', async ({ page, request }) => {
    await loginAs(page, sessions.parent);
    await page.goto('/parent/settings');

    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    const child = me.body.children.find((c) => c.childName === childName);
    expect(child.teacherName).toBeTruthy();

    // 선생님이 한 명이어도 이름이 붙는다. 줄 전체가 정확히 이 글자라 학생 이름이 끼어 있지 않다.
    await expect(
      page.getByText(`${child.childBirthdate} · ${child.teacherName} 선생님`, { exact: true })
    ).toBeVisible();
  });

  test('내 정보에서 아이를 추가했다가 삭제한다 — 확인 창을 거치고 다른 아이는 그대로다', async ({ page, request }) => {
    await loginAs(page, sessions.parent);
    await page.goto('/parent/settings');

    // 학생 명단에 없는 이름이라 확인 대기로 들어간다 (입력칸은 20자까지)
    const extra = `삭제${run.slice(-5)}`;
    await page.getByRole('button', { name: '+ 아이 추가' }).click();
    await page.getByLabel('아이 이름').fill(extra);
    await page.getByLabel('생년월일').fill('2019-01-01');
    await page.getByRole('button', { name: '추가', exact: true }).click();

    const remove = page.getByRole('button', { name: `${extra} 삭제` });
    await expect(remove).toBeVisible();
    const before = await api(request, sessions.parent, 'GET', '/api/parent/me');

    // 확인 창에서 취소하면 그대로 남는다
    await remove.click();
    const dialog = page.getByRole('dialog', { name: '아이를 삭제할까요?' });
    await expect(dialog).toContainText(`${extra} 정보를 내 정보에서 삭제해요.`);
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeVisible();

    // 삭제하면 그 아이만 사라진다
    await remove.click();
    await dialog.getByRole('button', { name: '삭제', exact: true }).click();
    await expect(page.getByText(`${extra} 정보를 삭제했어요.`)).toBeVisible();
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole('button', { name: `${childName} 삭제` })).toBeVisible();

    const after = await api(request, sessions.parent, 'GET', '/api/parent/me');
    expect(after.body.children.map((c) => c.childName)).not.toContain(extra);
    expect(after.body.children).toHaveLength(before.body.children.length - 1);
    // 남은 아이의 학생 연결은 그대로다
    expect(after.body.children.find((c) => c.childName === childName).status).toBe('linked');
  });

  test('마지막 아이를 삭제하면 등록 화면으로 가고, 정해 둔 학부모명과 나갈 길이 있다 — 다시 등록하면 그 이름 그대로다', async ({ page, request }) => {
    // 전용 학부모를 쓴다 — 공용 학부모의 아이를 지우면 그 학부모의 얼굴 사진·태그가 사라져 뒤의 사진 테스트가 깨진다
    const solo = sessions.parentSolo;
    await loginAs(page, solo);
    await page.goto('/parent/settings');

    await page.getByRole('button', { name: `${solo.child.name} 삭제` }).click();
    const dialog = page.getByRole('dialog', { name: '아이를 삭제할까요?' });
    await expect(dialog).toContainText('마지막 아이라서, 삭제하면 아이를 다시 등록하는 화면으로 이동해요.');
    await dialog.getByRole('button', { name: '삭제', exact: true }).click();

    // 아이가 없으면 일정·내 정보가 닫히고 등록 화면만 남는다
    await expect(page.getByRole('heading', { name: '아이 정보를 알려 주세요' })).toBeVisible();
    await expect(page).toHaveURL(/\/parent\/onboarding$/);
    expect((await api(request, solo, 'GET', '/api/parent/me')).body.children).toHaveLength(0);

    // 아이 이름에서 만든 제안값이 정해 둔 이름을 덮어쓰지 않고, 여기서 나갈 수도 있다
    const nameField = page.getByRole('textbox', { name: /학부모명/ });
    await expect(nameField).toHaveValue(solo.displayName);
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();

    await page.getByLabel('이름').first().fill(solo.child.name);
    await page.getByLabel('생년월일').first().fill(solo.child.birthdate);
    await expect(nameField).toHaveValue(solo.displayName);
    await page.getByRole('button', { name: '시작하기' }).click();
    // 떠나온 화면(내 정보)으로 돌아온다
    await expect(page).toHaveURL(/\/parent\/settings$/);
    await expect(page.getByRole('button', { name: `${solo.child.name} 삭제` })).toBeVisible();

    const after = await api(request, solo, 'GET', '/api/parent/me');
    expect(after.body.user.displayName).toBe(solo.displayName);
    expect(after.body.children.map((c) => c.childName)).toEqual([solo.child.name]);
  });

  test('다른 학부모의 아이는 삭제할 수 없다 (404, 지워지지 않는다)', async ({ request }) => {
    const theirs = await api(request, sessions.parentMulti, 'GET', '/api/parent/me');
    const target = theirs.body.children[0];

    const res = await api(request, sessions.parent, 'DELETE', `/api/parent/children/${target.id}`);
    expect(res.status).toBe(404);

    const again = await api(request, sessions.parentMulti, 'GET', '/api/parent/me');
    expect(again.body.children.map((c) => c.id)).toContain(target.id);
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
    // 아직 아무도 신청하지 않았다
    await expect(card).toContainText('신청 0명');

    await card.click();
    // 시트가 아니라 전체 화면 상세 페이지다
    await expect(page).toHaveURL(/\/parent\/events\/\d+$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '5km' }).click();
    await page.getByRole('button', { name: /신청하기|참가 신청/ }).click();

    await expect(page.getByText(/신청 완료/).first()).toBeVisible();

    // 일정으로 돌아가면 카드의 신청 인원이 1명으로 바뀌어 있다
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule$/);
    await expect(page.getByRole('button', { name: new RegExp(`e2e 러닝 ${run}`) }).first()).toContainText('신청 1명');
    await page.getByRole('button', { name: new RegExp(`e2e 러닝 ${run}`) }).first().click();
    await expect(page.getByText(/신청 완료/).first()).toBeVisible();

    // 아래 신청한 학생 명단에 우리 아이가 바로 보인다
    const roster = page.getByTestId('roster-section');
    await expect(roster.getByRole('heading', { name: /신청한 학생 1명/ })).toBeVisible();
    await expect(roster.getByText(childName)).toBeVisible();
    await expect(roster.getByText('우리 아이')).toBeVisible();

    // 옵션(신청 영역)이 명단보다 위에 있다
    const optionsY = (await page.getByTestId('registration-section').boundingBox()).y;
    const rosterY = (await roster.boundingBox()).y;
    expect(optionsY).toBeLessThan(rosterY);

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

    await expect(page).toHaveURL(/\/parent\/events\/\d+$/);
    await expect(page.getByText('휴관일 안내예요. 신청은 필요 없어요.')).toBeVisible();
    // 신청 관련 버튼도, 신청한 학생 명단도 없다
    await expect(page.getByRole('button', { name: /신청/ })).toHaveCount(0);
    await expect(page.getByTestId('roster-section')).toHaveCount(0);
    // 뒤로 가기로 일정에 돌아온다
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule$/);
  });

  test('지난 일정 보기 — 링크 모양 버튼으로 끝난 일정을 보고, 상세에서 돌아와도 그 목록이다', async ({ page, request }) => {
    // 오늘(KST, 서버와 같은 기준) 상대 날짜 — 고정 날짜는 언젠가 "지난" 쪽으로 넘어가 테스트가 썩는다.
    // 다가올 일정은 오늘로 둔다: 오늘 일정은 남은 일정이고, 연말에도 "올해" 밖으로 넘어가지 않는다.
    const kstDay = (days) => new Date(Date.now() + 9 * 3600000 + days * 86400000).toISOString().slice(0, 10);
    const pastTitle = `e2e 지난행사 ${run}`;
    const upcomingTitle = `e2e 다가올행사 ${run}`;
    for (const [title, date] of [[pastTitle, kstDay(-30)], [upcomingTitle, kstDay(0)]]) {
      const created = await api(request, sessions.teacher, 'POST', '/api/events', {
        type: 'special', title, date, location: 'e2e 체육관'
      });
      expect(created.status).toBe(201);
    }

    await loginAs(page, sessions.parent);
    await page.goto('/parent/schedule');
    await expect(page.getByRole('button', { name: new RegExp(upcomingTitle) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(pastTitle) })).toHaveCount(0);

    // 채운 버튼이 아니라 링크처럼 보인다 — 배경 없음 · 테두리 없음 · 밑줄
    const toggle = page.getByRole('banner').getByRole('button', { name: '지난 일정 보기' });
    await expect(toggle).toBeVisible();
    const look = await toggle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, border: s.borderTopWidth, underline: s.textDecorationLine };
    });
    expect(look.bg).toBe('rgba(0, 0, 0, 0)');
    expect(look.border).toBe('0px');
    expect(look.underline).toContain('underline');

    await toggle.click();
    await expect(page).toHaveURL(/\/parent\/schedule\?view=past$/);
    await expect(page.getByText('지난 일정', { exact: true })).toBeVisible();
    const pastCard = page.getByRole('button', { name: new RegExp(pastTitle) });
    await expect(pastCard).toBeVisible();
    await expect(pastCard).toContainText('종료');
    await expect(page.getByRole('button', { name: new RegExp(upcomingTitle) })).toHaveCount(0);

    // 상세에 갔다가 뒤로 오면 지난 일정 목록으로 돌아온다
    await pastCard.click();
    await expect(page).toHaveURL(/\/parent\/events\/\d+$/);
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule\?view=past$/);
    await expect(page.getByRole('button', { name: new RegExp(pastTitle) })).toBeVisible();

    // 남은 일정 보기로 처음 화면에 돌아간다
    await page.getByRole('button', { name: '남은 일정 보기' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule$/);
    await expect(page.getByText(/년 남은 일정/)).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(upcomingTitle) })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(pastTitle) })).toHaveCount(0);
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

  test('휴대폰 사진 탭 — 세로 썸네일이 앨범 카드의 제목·날짜를 덮지 않는다', async ({ page }) => {
    await stubPortraitThumbnails(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/parent/photos');

    const card = page.getByRole('button', { name: /e2e확정대회/ });
    const strip = card.getByTestId('album-previews');
    const thumbs = strip.locator('img');
    await expect(thumbs.first()).toBeVisible();
    // 세로 그림이 실제로 그려졌는지 — 안 그려지면 넘침도 생기지 않아 검사가 헛돈다
    await expect.poll(() => thumbs.first().evaluate((img) => img.naturalHeight)).toBe(711);

    const stripBox = await strip.boundingBox();
    // 휴대폰 폭에서 칸이 정사각형(4:1 줄)
    expect(Math.abs(stripBox.height - stripBox.width / 4)).toBeLessThan(2);
    for (const box of await Promise.all((await thumbs.all()).map((thumb) => thumb.boundingBox()))) {
      expect(box.y + box.height).toBeLessThanOrEqual(stripBox.y + stripBox.height + 0.5);
    }
    const titleBox = await card.getByText(/e2e확정대회/).boundingBox();
    expect(titleBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height);
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

  test('휴대폰에서 사진을 누르면 화면 전체에 뜨고, 저장은 위쪽 아이콘 버튼, 날짜·올린 사람은 사진 아래쪽에 겹쳐 보인다', async ({ page }) => {
    await stubPortraitThumbnails(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '사진 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const photo = viewer.getByRole('img');
    await expect.poll(() => photo.evaluate((img) => img.naturalHeight)).toBe(711);

    // 사진 칸이 화면 전체다 — 위·아래 막대가 자리를 떼어 가지 않는다
    expect(await photo.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });

    // 저장: 오른쪽 위의 작은 동그란 아이콘 버튼, 별 노랑 위에 잉크
    const save = viewer.getByRole('link', { name: '저장' });
    await expect(save).toHaveAttribute('href', /drive\.google\.com\/uc\?export=download/);
    await expect(save).toHaveText('');
    const saveBox = await save.boundingBox();
    expect(saveBox.width).toBeLessThanOrEqual(44);
    expect(saveBox.height).toBe(saveBox.width);
    expect(saveBox.y).toBeLessThan(60);
    expect(saveBox.x + saveBox.width).toBeGreaterThan(390 - 20);
    const colors = await save.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.cssText = 'background-color: var(--star); color: var(--ink)';
      document.body.appendChild(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(el);
      const result = { bg: got.backgroundColor === want.backgroundColor, ink: got.color === want.color, radius: got.borderRadius };
      probe.remove();
      return result;
    });
    expect(colors).toEqual({ bg: true, ink: true, radius: '50%' });

    // 날짜와 올린 사람: 사진 아래쪽에 겹친다(화면 맨 아래까지), 터치는 사진으로 지나간다
    const info = viewer.getByTestId('media-info');
    await expect(info).toContainText(/\d+\/\d+\(.\) \d+:\d+/);
    await expect(info).toContainText(/선생님|내가 올림|학부모/);
    const infoBox = await info.boundingBox();
    expect(infoBox.y + infoBox.height).toBe(844);
    expect(infoBox.y).toBeGreaterThan(844 / 2);
    expect(await info.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    // 아래쪽 버튼 줄은 없다
    await expect(viewer.getByText('원본 보기')).toHaveCount(0);
    await expect(viewer.getByRole('link')).toHaveCount(1);
  });

  test('휴대폰에서 영상을 누르면 Drive 플레이어가 화면을 채우고, 컨트롤이 아래 막대로 가는 폭으로 그려진다', async ({ page }) => {
    // 진짜 Drive 플레이어 대신 빈 페이지 — 픽스처 파일 id 는 Drive 에 없다
    await page.route('https://drive.google.com/file/d/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#222"></body>' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '영상 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const player = viewer.locator('iframe');
    await expect(player).toHaveAttribute('src', /drive\.google\.com\/file\/d\/.+\/preview/);

    // 화면에 보이는 크기 — 16:9 상자였을 때는 높이가 206px 이었다
    const box = await player.boundingBox();
    expect(box.width).toBeGreaterThan(360);
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThan(400);

    // 플레이어가 보는 자기 폭 — Drive 는 480px 이하에서 컨트롤을 영상 한가운데에 띄우고, 500px 부터 아래 막대로 그린다.
    // 그래서 좁은 화면에서는 넓게 그린 뒤 줄여 보여 준다.
    const frame = await (await player.elementHandle()).contentFrame();
    await expect.poll(() => frame.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(500);

    const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const name of ['이전 사진', '다음 사진']) {
      const button = await viewer.getByRole('button', { name }).boundingBox();
      expect(overlaps(button, box)).toBe(false);
    }

    // 원본 보기 버튼은 없다 — 저장은 위쪽 아이콘 버튼
    await expect(viewer.getByRole('link', { name: '저장' })).toBeVisible();
    await expect(viewer.getByText('원본 보기')).toHaveCount(0);

    // 영상일 때 날짜·올린 사람은 플레이어에 겹치지 않고 바로 아래 한 줄 — 겹치면 맨 아래 Drive 컨트롤을 가린다
    const info = await viewer.getByTestId('media-info').boundingBox();
    expect(info.y).toBeGreaterThanOrEqual(box.y + box.height - 0.5);
    expect(overlaps(await viewer.getByRole('link', { name: '저장' }).boundingBox(), box)).toBe(false);

    // 넓은 화면으로 바뀌면(휴대폰을 돌리거나 태블릿) 줄이지 않고 그대로 채운다
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(async () => {
      const wide = await player.boundingBox();
      return Math.abs((await frame.evaluate(() => window.innerWidth)) - wide.width);
    }).toBeLessThan(1);

    // 다음으로 넘기면 플레이어가 사라지고 사진이 뜬다
    await viewer.getByRole('button', { name: '다음 사진' }).click();
    await expect(player).toHaveCount(0);
  });

  test('휴대폰에서 사진을 옆으로 밀면 다음·이전 장으로 넘어가고, 영상으로도 넘어간다', async ({ page }) => {
    await stubPortraitThumbnails(page);
    await page.route('https://drive.google.com/file/d/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#222"></body>' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '사진 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const counter = viewer.getByTestId('viewer-top').getByText(/^\d+ \/ \d+$/);
    const position = async () => (await counter.textContent()).split(' / ').map(Number);
    const [start, total] = await position();
    expect(total).toBeGreaterThan(2);
    const after = (n, step) => ((n - 1 + step + total) % total) + 1;
    const middle = { y: 844 / 2 };

    // 왼쪽으로 밀면 다음 장, 오른쪽으로 밀면 다시 이전 장
    await swipeTouch(page, { x: 320, ...middle }, { x: 70, ...middle });
    await expect(counter).toHaveText(`${after(start, 1)} / ${total}`);
    await swipeTouch(page, { x: 70, ...middle }, { x: 320, ...middle });
    await expect(counter).toHaveText(`${start} / ${total}`);

    // 조금만 밀거나 위아래로 움직이면 그대로
    await swipeTouch(page, { x: 200, ...middle }, { x: 180, ...middle }, { steps: 20 });
    await swipeTouch(page, { x: 200, y: 300 }, { x: 190, y: 600 });
    await expect(counter).toHaveText(`${start} / ${total}`);
    // 밀던 장은 제자리로 돌아와 있다
    await expect.poll(() => viewer.getByTestId('viewer-track').evaluate((el) => el.style.transform)).toBe('');

    // 영상이 나올 때까지 넘긴다 — 사진에서 영상으로도 밀어서 간다
    const player = viewer.locator('iframe');
    for (let i = 0; i < total && !(await player.count()); i += 1) {
      const [now] = await position();
      await swipeTouch(page, { x: 320, ...middle }, { x: 70, ...middle });
      await expect(counter).toHaveText(`${after(now, 1)} / ${total}`);
    }
    await expect(player).toHaveCount(1);

    // 영상일 때는 플레이어 안이 아니라 위쪽 막대를 밀어 넘긴다
    const [onVideo] = await position();
    const top = await viewer.getByTestId('viewer-top').boundingBox();
    const bar = { y: top.y + top.height / 2 };
    await swipeTouch(page, { x: 320, ...bar }, { x: 70, ...bar });
    await expect(counter).toHaveText(`${after(onVideo, 1)} / ${total}`);
  });

  test('앨범 썸네일은 Drive 사진 주소(lh3)를 바로 부른다 — drive.google.com/thumbnail 의 302 를 거치지 않는다', async ({ page }) => {
    const thumbnailHops = [];
    page.on('request', (req) => { if (req.url().startsWith('https://drive.google.com/thumbnail')) thumbnailHops.push(req.url()); });
    await stubPortraitThumbnails(page);
    await page.goto(`/parent/photos/${sessions.album.eventId}`);

    const thumbs = page.getByRole('button', { name: /사진 열기|영상 열기/ }).locator('img');
    await expect(thumbs).toHaveCount(sessions.album.totalCount);
    for (const thumb of await thumbs.all()) {
      await expect(thumb).toHaveAttribute('src', /^https:\/\/lh3\.googleusercontent\.com\/d\/e2e-file-.+=w400-h400-c-rw$/);
      await expect.poll(() => thumb.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    }

    // 뷰어의 큰 사진도 같은 곳에서 자르지 않고
    await page.getByRole('button', { name: '사진 열기' }).first().click();
    await expect(page.getByRole('dialog', { name: '사진 보기' }).getByRole('img'))
      .toHaveAttribute('src', /^https:\/\/lh3\.googleusercontent\.com\/d\/e2e-file-.+=w1600$/);
    expect(thumbnailHops).toEqual([]);
  });

  test('썸네일이 처음에 실패해도 잠시 뒤 다시 불러 뜬다', async ({ page }) => {
    const failedOnce = new Set();
    await page.route('https://lh3.googleusercontent.com/d/**', (route) => {
      const url = new URL(route.request().url());
      // 처음 부를 때는 Drive 가 아직 썸네일을 못 만든 것처럼 실패
      if (!url.searchParams.has('retry')) {
        failedOnce.add(url.pathname);
        return route.fulfill({ status: 404, contentType: 'text/html', body: 'not ready' });
      }
      return route.fulfill({ contentType: 'image/svg+xml', body: PORTRAIT_SVG });
    });
    await page.goto(`/parent/photos/${sessions.album.eventId}`);

    const thumbs = page.getByRole('button', { name: /사진 열기|영상 열기/ }).locator('img');
    await expect(thumbs).toHaveCount(sessions.album.totalCount);
    for (const thumb of await thumbs.all()) {
      await expect(thumb).toHaveAttribute('src', /\?retry=1$/);
      await expect.poll(() => thumb.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(thumb).toBeVisible();
    }
    expect(failedOnce.size).toBeGreaterThanOrEqual(sessions.album.totalCount);
  });

  test('썸네일이 끝내 안 뜨면 빈칸 대신 사진 아이콘이 보인다', async ({ page }) => {
    await page.route('https://lh3.googleusercontent.com/d/**', (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: 'gone' }));
    await page.goto(`/parent/photos/${sessions.album.eventId}`);

    // 1초 · 3초 · 8초 뒤 세 번 더 불러 보고 그만둔다
    const tiles = page.getByRole('button', { name: /사진 열기|영상 열기/ });
    await expect(tiles.getByTestId('image-failed')).toHaveCount(sessions.album.totalCount, { timeout: 20_000 });
    await expect(tiles.locator('img')).toHaveCount(0);
    await expect(tiles.getByTestId('image-failed').first().locator('svg')).toBeVisible();
  });

  test('내가 올린 사진에만 삭제가 보인다', async ({ page }) => {
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: /내가 올린 것/ }).click();

    await page.getByRole('button', { name: '사진 열기' }).first().click();
    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    await expect(viewer.getByRole('button', { name: '삭제' })).toBeVisible();
  });

  test('선생님이 공개하면 사진 탭과 이벤트 상세에 보이고, 비공개로 돌리면 사라진다 (docs/photo-menu)', async ({ page, request }) => {
    const id = sessions.album.privateEventId;
    const title = sessions.album.privateTitle;
    const setAlbum = async (body) => {
      const res = await api(request, sessions.teacher, 'PATCH', `/api/events/${id}/album`, body);
      expect(res.status).toBe(200);
    };

    try {
      // 비공개일 때: 사진 탭에도 없고, 주소로 들어가면 기다려 달라는 안내
      await page.goto('/parent/photos');
      await expect(page.getByText(/e2e확정대회/)).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);
      await page.goto(`/parent/photos/${id}`);
      await expect(page.getByText('선생님이 아직 공개하지 않은 앨범이에요')).toBeVisible();

      // 모든 학부모에게 공개 — 이 학부모의 아이는 신청하지 않았지만 보인다
      await setAlbum({ audience: 'all', published: true });

      await page.goto('/parent/photos');
      await expect(page.getByText(title)).toBeVisible();

      await page.goto(`/parent/events/${id}`);
      await expect(page.getByRole('heading', { name: '사진 · 영상' })).toBeVisible();
      await expect(page.locator('.ui-media-tile')).toHaveCount(2);
      await expect(page.getByRole('button', { name: /올리기/ })).toHaveCount(0);
      await page.locator('.ui-media-tile').first().click();
      await expect(page).toHaveURL(new RegExp(`/parent/photos/${id}\\?open=`));
      await expect(page.getByRole('dialog', { name: '사진 보기' })).toBeVisible();

      // 비공개로 돌리면 바로 사라진다
      await setAlbum({ published: false });
      await page.goto(`/parent/events/${id}`);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('heading', { name: '사진 · 영상' })).toHaveCount(0);
    } finally {
      await setAlbum({ published: false, audience: 'participants' });
    }
  });

  // 이벤트 없이 만든 사진 전용 폴더 (docs/photo-menu FR-517)
  test('사진 전용 폴더는 공개하면 사진 탭에만 보인다 — 일정에도 이벤트 상세에도 없다', async ({ page, request }) => {
    const id = sessions.album.folderEventId;
    const title = sessions.album.folderTitle;
    const setAlbum = async (body) => api(request, sessions.teacher, 'PATCH', `/api/events/${id}/album`, body);

    try {
      // 비공개일 때: 사진 탭에 없다
      await page.goto('/parent/photos');
      await expect(page.getByText(/e2e확정대회/)).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);

      // 폴더는 "참가 확정" 범위로 바꿀 수 없다 — 신청한 학생이 없다
      expect((await setAlbum({ audience: 'participants' })).status).toBe(400);
      expect((await setAlbum({ published: true })).status).toBe(200);

      // 사진 탭: "사진" 배지로 보이고(스페셜이 아니다), 누르면 사진이 열린다
      await page.goto('/parent/photos');
      const card = page.getByRole('button', { name: new RegExp(title) });
      await expect(card).toBeVisible();
      await expect(card.getByText('📁 사진')).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/parent/photos/${id}$`));
      await expect(page.getByRole('button', { name: '사진 열기' })).toHaveCount(1);

      // 일정(다가오는 · 지난)에는 없다
      for (const view of ['', '?view=past']) {
        const schedule = await api(request, sessions.parent, 'GET', `/api/parent/events${view}`);
        expect(schedule.body.events.some((e) => e.id === id)).toBe(false);
      }
      await page.goto('/parent/schedule');
      const pastToggle = page.getByRole('button', { name: /지난 일정 보기/ });
      if (await pastToggle.count()) await pastToggle.first().click();
      await expect(page.getByText(title)).toHaveCount(0);

      // 이벤트 상세 주소로 들어가도 없는 이벤트다
      const detail = await api(request, sessions.parent, 'GET', `/api/parent/events/${id}`);
      expect(detail.status).toBe(404);

      // 비공개로 돌리면 사진 탭에서 사라진다
      expect((await setAlbum({ published: false })).status).toBe(200);
      await page.goto('/parent/photos');
      await expect(page.getByText(/e2e확정대회/)).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);
    } finally {
      await setAlbum({ published: false });
    }
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

  test('등록한 얼굴 사진을 지울 수 있다 — 확인을 거쳐 한 장을 지우면 목록과 개수가 준다', async ({ page, request }) => {
    await page.goto('/parent/settings');

    const list = page.getByRole('list', { name: `${childName} 등록한 얼굴 사진` });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('얼굴 사진 2장 등록됨')).toBeVisible();

    // 취소하면 그대로
    await list.getByRole('button', { name: /얼굴 사진 1 삭제/ }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: '얼굴 사진을 지울까요?' });
    await dialog.getByRole('button', { name: '취소' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);

    await list.getByRole('button', { name: /얼굴 사진 1 삭제/ }).click();
    await dialog.getByRole('button', { name: '지우기' }).click();

    await expect(page.getByText(/얼굴 사진을 지웠어요/)).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByText('얼굴 사진 1장 등록됨')).toBeVisible();

    // 서버에서도 지워졌고, 새로고침해도 한 장이다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    const child = me.body.children.find((c) => c.childName === childName);
    const faces = await api(request, sessions.parent, 'GET', `/api/parent/children/${child.id}/faces`);
    expect(faces.body.items).toHaveLength(1);
    await page.reload();
    await expect(list.getByRole('listitem')).toHaveCount(1);
  });

  const pickFacePhoto = async (page) => {
    await page.goto('/parent/settings');
    await page.getByRole('button', { name: /얼굴 사진 등록/ }).first().click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '사진 고르기' }).click()
    ]);
    await chooser.setFiles(FACELESS_PNG);
  };

  test('얼굴 분석 서버에 닿지 못하면 "얼굴이 없다" 가 아니라 분석하지 못했다고 알린다', async ({ page }) => {
    await page.route('**/api/face-engine/**', (route) => route.abort());

    await pickFacePhoto(page);

    const status = page.getByRole('status');
    await expect(status).toContainText('얼굴을 분석하지 못했어요', { timeout: 20_000 });
    await expect(status).not.toContainText('얼굴이 보이지 않아요');
  });

  test('얼굴이 없는 사진은 분석 서버를 거쳐 "얼굴 없음" 을 받고 정면 사진을 달라고 한다', async ({ page, request }) => {
    const engine = await request.get('/api/face-engine/health');
    test.skip(!engine.ok(), '얼굴 분석 서버가 없다 — e2e/fake-face-engine.mjs 를 띄우고 서버에 FACE_ENGINE_URL 을 주면 돈다');

    // 브라우저가 로그인 토큰과 함께 JPEG 로 보내는지 본다(Express 가 분석 서버로 그대로 넘긴다)
    const sent = page.waitForRequest((req) => req.url().endsWith('/api/face-engine/detect') && req.method() === 'POST');
    await pickFacePhoto(page);
    const detect = await sent;
    expect(detect.headers()['content-type']).toBe('image/jpeg');
    expect(detect.headers().authorization).toMatch(/^Bearer /);

    const status = page.getByRole('status');
    await expect(status).toContainText('얼굴이 보이지 않아요', { timeout: 20_000 });
    await expect(status).not.toContainText('분석하지 못했어요');
  });
});

test.describe('학부모 — 휴대폰에서 영상을 누르는 즉시 재생 (터치 기기)', () => {
  // 손가락만 쓰는 기기로 흉내 낸다 — (hover: none) and (pointer: coarse)
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  const TAP_KEY = 'rg.drivePlayer.tapSignal';

  test('첫 영상은 예전 그대로, 플레이어 안을 한 번 누른 뒤부터는 준비 상태 + 미리보기 사진 — 누르면 사진이 바로 사라진다', async ({ page }) => {
    await loginAs(page, sessions.parent);
    await stubPortraitThumbnails(page);
    // 진짜 Drive 플레이어 대신 빈 페이지 — 다른 출처의 iframe 이라는 점은 같다
    await page.route('https://drive.google.com/file/d/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#222"></body>' }));
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    expect(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches)).toBe(true);

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const player = viewer.locator('iframe');
    const poster = viewer.getByTestId('video-poster');
    const tapPlayer = async () => {
      const box = await player.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };

    // ① 이 기기에서 신호를 본 적이 없다 → Drive 의 재생 버튼 그대로, 겹친 사진 없음
    await page.getByRole('button', { name: '영상 열기' }).first().click();
    await expect(player).toHaveAttribute('src', /\/preview$/);
    await expect(poster).toHaveCount(0);

    // 플레이어 안을 누르면 포커스가 iframe 으로 넘어가고, 그 신호를 기억한다
    await tapPlayer();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), TAP_KEY)).toBe('1');
    await viewer.getByRole('button', { name: '닫기' }).click();

    // ② 다음부터: 준비 상태(autoplay=1, 자동 재생 권한은 넘기지 않음) + 미리보기 사진과 재생 표시
    await page.getByRole('button', { name: '영상 열기' }).first().click();
    await expect(player).toHaveAttribute('src', /\/preview\?autoplay=1$/);
    await expect(player).toHaveAttribute('allow', 'fullscreen');
    await expect(poster).toBeVisible();
    await expect.poll(() => poster.locator('img').evaluate((img) => img.naturalHeight)).toBe(711);
    // 사진은 플레이어 칸을 그대로 덮고, 터치는 지나간다
    const posterBox = await poster.boundingBox();
    const playerBox = await player.boundingBox();
    expect(Math.abs(posterBox.width - playerBox.width)).toBeLessThan(1);
    expect(Math.abs(posterBox.height - playerBox.height)).toBeLessThan(1);
    expect(await poster.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    // ③ 누르는 순간 사진이 사라지고, 같은 플레이어가 그대로 남는다(다시 불러오지 않는다)
    await tapPlayer();
    await expect(poster).toHaveCount(0, { timeout: 1000 });
    await expect(player).toHaveAttribute('src', /\/preview\?autoplay=1$/);
  });

  test('영상 위에서 옆으로 밀어도 넘어간다 — Drive 의 재생 버튼(가운데)·아래 막대·오른쪽 위 버튼 자리는 그대로 눌린다', async ({ page }) => {
    await loginAs(page, sessions.parent);
    await stubPortraitThumbnails(page);
    await page.route('https://drive.google.com/file/d/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#222"></body>' }));
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '영상 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const player = viewer.locator('iframe');
    const counter = viewer.getByTestId('viewer-top').getByText(/^\d+ \/ \d+$/);
    await expect(viewer.getByTestId('video-swipe-cover')).toHaveCount(1);
    const box = await player.boundingBox();
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    const hit = ({ x, y }) => page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el.dataset.band || el.tagName;
    }, [x, y]);

    // 누르면 Drive 로 가는 자리 — 가운데 재생 버튼 · 맨 아래 막대 · 오른쪽 위 버튼
    expect(await hit(at(0.5, 0.5))).toBe('IFRAME');
    expect(await hit({ x: box.x + box.width / 2, y: box.y + box.height - 20 })).toBe('IFRAME');
    // 재생 중 진행 막대 — 플레이어 바닥에서 102px(플레이어 자신의 px, 520px 로 그려 줄인 만큼 줄어든다) 위
    expect(await hit({ x: box.x + box.width * 0.7, y: box.y + box.height - Math.round((102 * box.width) / 520) })).toBe('IFRAME');
    expect(await hit({ x: box.x + box.width - 20, y: box.y + 20 })).toBe('IFRAME');
    // 그 밖은 넘기기 판
    expect(await hit(at(0.85, 0.5))).toBe('right');
    expect(await hit(at(0.15, 0.5))).toBe('left');
    expect(await hit(at(0.5, 0.25))).toBe('above');
    expect(await hit(at(0.5, 0.75))).toBe('below');

    // 영상 한가운데 줄을 오른쪽에서 왼쪽으로 민다 → 다음 장, 플레이어가 사라진다
    const [now, total] = (await counter.textContent()).split(' / ').map(Number);
    await swipeTouch(page, at(0.85, 0.4), at(0.15, 0.4));
    await expect(counter).toHaveText(`${(now % total) + 1} / ${total}`);
    await expect(player).toHaveCount(0);

    // 되돌아와서 아래쪽 판을 왼쪽에서 오른쪽으로 밀면 이전 장
    await swipeTouch(page, { x: 70, y: 422 }, { x: 330, y: 422 });
    await expect(counter).toHaveText(`${now} / ${total}`);
    await expect(player).toHaveCount(1);
    await swipeTouch(page, at(0.2, 0.7), at(0.9, 0.7));
    await expect(counter).toHaveText(`${((now - 2 + total) % total) + 1} / ${total}`);
  });
});

test.describe('학부모 — 선생님이 보낸 이벤트 공유 링크', () => {
  const createEvent = async (request, overrides = {}) => {
    const created = await api(request, sessions.teacher, 'POST', '/api/events', {
      type: 'special',
      title: `e2e 공유링크 ${run}`,
      date: '2026-12-19',
      startTime: '10:00',
      location: 'e2e 잠실',
      options: [],
      isPublished: true,
      registrationOpen: true,
      ...overrides
    });
    expect(created.status).toBe(201);
    return created.body;
  };

  test('로그인한 학부모가 링크를 열면 그 이벤트 신청 화면이 바로 뜬다', async ({ page, request }) => {
    const event = await createEvent(request);

    // 아이가 연결돼 있는 학부모 (parentMulti 는 setup 에서 아이까지 넣어 둔다)
    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/events/${event.id}`);

    // 전체 화면 상세 페이지가 바로 뜬다
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
    await expect(page.getByRole('button', { name: /신청하기|참가 신청/ })).toBeVisible();
    await expect(page.getByTestId('roster-section')).toBeVisible();

    // 뒤로 가기로 일정에 돌아간다
    await page.getByRole('button', { name: '뒤로' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule$/);
  });

  test('로그인 전에 링크를 열면 로그인을 거쳐 그 이벤트로 돌아온다', async ({ page, request }) => {
    const event = await createEvent(request, { title: `e2e 로그인후 ${run}` });

    // 세션을 넣지 않았으니 로그인 화면으로 간다 — 돌아갈 곳은 브라우저가 기억한다
    await page.goto(`/parent/events/${event.id}`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('공유받은 이벤트가 있어요.')).toBeVisible();

    // 카카오 인가 화면은 자동화할 수 없으므로 콜백 API 의 응답만 흉내 낸다
    await page.route('**/api/auth/kakao/callback', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: sessions.parentMulti.token,
          user: sessions.parentMulti.user,
          role: 'parent',
          isNewUser: false,
          needsOnboarding: false,
          accounts: []
        })
      })
    );
    await page.goto('/oauth/kakao/callback?code=e2e-fake-code');

    await expect(page).toHaveURL(new RegExp(`/parent/events/${event.id}$`));
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
  });

  test('선생님이 주소를 고른 이벤트는 오시는 길에 지도와 카카오맵 링크가 보인다', async ({ page, request }) => {
    await stubKakaoMaps(page);
    const event = await createEvent(request, {
      title: `e2e 오시는길 ${run}`,
      location: '여의도 한강공원',
      address: '서울 영등포구 여의동로 330',
      latitude: 37.5284,
      longitude: 126.9327
    });

    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/events/${event.id}`);

    const section = page.getByTestId('place-section');
    await expect(section.getByRole('heading', { name: '오시는 길' })).toBeVisible();
    await expect(section.getByText('서울 영등포구 여의동로 330')).toBeVisible();
    await expect(section.getByRole('img', { name: /위치 지도/ })).toContainText('가짜 지도 37.5284,126.9327');

    const label = encodeURIComponent('여의도 한강공원');
    await expect(section.getByRole('link', { name: '카카오맵에서 보기' }))
      .toHaveAttribute('href', `https://map.kakao.com/link/map/${label},37.5284,126.9327`);
    await expect(section.getByRole('link', { name: '길찾기' }))
      .toHaveAttribute('href', `https://map.kakao.com/link/to/${label},37.5284,126.9327`);

    // 휴대폰 폭에서 지도가 화면 밖으로 넘치지 않는다
    const box = await section.getByRole('img', { name: /위치 지도/ }).boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.x + box.width).toBeLessThanOrEqual(414);

    // 신청이 먼저, 오시는 길은 그 아래
    const registrationY = (await page.getByTestId('registration-section').boundingBox()).y;
    expect(registrationY).toBeLessThan((await section.boundingBox()).y);
  });

  test('지도 키가 없으면 지도 없이 주소와 카카오맵 링크만 보인다', async ({ page, request }) => {
    await stubKakaoMaps(page, { key: null });
    const event = await createEvent(request, {
      title: `e2e 지도키없음 ${run}`,
      address: '서울 송파구 올림픽로 25',
      latitude: 37.5122,
      longitude: 127.0719
    });

    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/events/${event.id}`);

    const section = page.getByTestId('place-section');
    await expect(section.getByText('서울 송파구 올림픽로 25')).toBeVisible();
    await expect(section.getByRole('img', { name: /위치 지도/ })).toHaveCount(0);
    await expect(section.getByRole('link', { name: '카카오맵에서 보기' })).toBeVisible();
  });

  test('주소를 고르지 않은 이벤트에는 오시는 길이 없다', async ({ page, request }) => {
    const event = await createEvent(request, { title: `e2e 주소없음 ${run}` });

    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/events/${event.id}`);

    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
    await expect(page.getByTestId('place-section')).toHaveCount(0);
  });

  test('열 수 없는 이벤트(비공개) 링크는 안내를 보여주고 일정으로 갈 수 있다', async ({ page, request }) => {
    const event = await createEvent(request, { title: `e2e 비공개링크 ${run}`, isPublished: false });

    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/events/${event.id}`);

    await expect(page.getByText('이벤트를 찾을 수 없어요')).toBeVisible();
    await page.getByRole('button', { name: '일정으로 가기' }).click();
    await expect(page).toHaveURL(/\/parent\/schedule$/);
  });
});

/**
 * 학부모가 올린 사진을 선생님이 볼 때 — 올린 사람은 카카오 식별자가 아니라 학부모가 정한 이름(학부모명)이다.
 * 픽스처 앨범에는 이 학부모가 올린 사진이 한 장 있다(setup.mjs i:3).
 */
test.describe('선생님 사진 화면 — 학부모가 올린 사진의 이름', () => {
  test('올린 사람은 학부모 계정 이름(username)이 아니라 학부모명으로 보인다', async ({ page, request }) => {
    // 앞 테스트(가입)가 학부모명을 정해 뒀으면 그 이름을, 혼자 돌려 아직 없으면 지금 정한다
    const me = await api(request, sessions.parent, 'GET', '/api/parent/me');
    let parentName = me.body.user.displayName;
    if (!parentName) {
      parentName = `${childName}엄마`;
      const named = await api(request, sessions.parent, 'PUT', '/api/parent/name', { parentName });
      expect(named.status).toBe(200);
    }
    expect(parentName).not.toBe(sessions.parent.user.username);

    // API: 선생님용 목록의 올린 사람 이름
    const list = await api(request, sessions.teacher, 'GET', `/api/events/${sessions.album.eventId}/media?includeHidden=true`);
    expect(list.status).toBe(200);
    const fromParent = list.body.items.filter((item) => item.uploaderRole === 'parent');
    expect(fromParent.length).toBeGreaterThan(0);
    for (const item of fromParent) expect(item.uploaderName).toBe(parentName);

    // 화면: 사진 칸의 이름표와, 크게 봤을 때의 올린 사람
    await loginAs(page, sessions.teacher);
    await page.goto(`/photos/${sessions.album.eventId}`);
    const who = page.locator('.ui-media-tile__who');
    await expect(who).toHaveCount(fromParent.length);
    await expect(who.first()).toHaveText(parentName);
    await expect(page.getByText(sessions.parent.user.username)).toHaveCount(0);

    await page.locator('.ui-media-tile', { has: who.first() }).click();
    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    await expect(viewer.getByText(parentName)).toBeVisible();
  });
});

/**
 * 선생님(또는 다른 학부모)이 보낸 사진 폴더 링크 (docs/photo-menu FR-518).
 * 링크 = 학부모 앨범 주소 + 그 선생님의 학부모 초대. 가입한 학부모는 로그인 뒤 그 사진으로,
 * 처음 온 사람은 그 초대로 가입해서, 다른 선생님 쪽으로만 가입한 학부모는 이 선생님과 연결돼서 열린다.
 */
test.describe('학부모 — 공유받은 사진 폴더 링크', () => {
  test('로그인 전에 열면 누가 보냈는지 알려 주고, 로그인한 뒤 연결할지 물은 다음 사진이 열린다', async ({ page, request }) => {
    const id = sessions.album.folderEventId;
    const title = sessions.album.folderTitle;
    const setAlbum = (body) => api(request, sessions.teacher, 'PATCH', `/api/events/${id}/album`, body);
    const mediaAs = (session) => api(request, session, 'GET', `/api/parent/events/${id}/media`);

    expect((await setAlbum({ published: true })).status).toBe(200);
    try {
      // parentOther 는 두 번째 선생님 쪽으로만 가입해 있다 — 이 앨범은 아직 "없는 이벤트"
      expect((await mediaAs(sessions.parentOther)).status).toBe(404);

      // 세션 없이 링크를 연다 → 로그인 화면. 누가 보냈는지와 처음 온 사람이 할 일을 알려 준다.
      await page.goto(`/parent/photos/${id}?invite=${sessions.invite}`);
      await expect(page).toHaveURL(/\/login$/);
      const notice = page.getByRole('status');
      await expect(notice).toContainText(`${sessions.teacher.user.username} 선생님이 사진을 공유했어요.`);
      await expect(notice).toContainText('처음이라면 로그인 뒤 아이 정보만 등록하면 돼요.');
      await expect(page.getByText('받은 사진 링크로 바로 가입할 수 있어요.')).toBeVisible();

      // 카카오 인가 화면은 자동화할 수 없다 — 로그인 주소 요청만 확인하고(초대가 soft 로 실려 나간다)
      // 콜백 API 응답을 흉내 내 "다른 선생님 쪽으로만 가입한 학부모" 로 로그인시킨다.
      await page.route(/\/api\/auth\/kakao\?/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/oauth/kakao/callback?code=e2e-fake-code' }) }));
      await page.route('**/api/auth/kakao/callback', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            token: sessions.parentOther.token,
            user: sessions.parentOther.user,
            role: 'parent',
            isNewUser: false,
            needsOnboarding: false,
            accounts: []
          })
        }));
      const started = page.waitForRequest(/\/api\/auth\/kakao\?/);
      await page.getByRole('button', { name: '카카오로 시작하기' }).click();
      const startUrl = new URL((await started).url());
      expect(startUrl.searchParams.get('invite')).toBe(sessions.invite);
      expect(startUrl.searchParams.get('soft')).toBe('1');

      // 로그인 뒤 그 사진 폴더로 돌아온다. 아직 이 선생님과 연결되지 않았으니 **먼저 묻는다** —
      // 링크를 눌렀다고 바로 연결하지 않는다(선생님의 학부모 목록에 이름이 나타나므로 본인이 눌러야 한다).
      await expect(page.getByText(`${sessions.teacher.user.username} 선생님이 공유한 사진이에요`)).toBeVisible();
      expect((await mediaAs(sessions.parentOther)).status).toBe(404);   // 아직 연결 전

      // [연결하고 사진 보기] → 이 선생님과 연결되고 사진이 열린다. 주소의 초대는 지워진다.
      await page.getByRole('button', { name: '연결하고 사진 보기' }).click();
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('button', { name: '사진 열기' })).toHaveCount(1);
      await expect(page).toHaveURL(new RegExp(`/parent/photos/${id}$`));

      const linked = await mediaAs(sessions.parentOther);
      expect(linked.status).toBe(200);
      // 이제 이 선생님의 학부모다
      const me = await api(request, sessions.parentOther, 'GET', '/api/parent/me');
      expect(me.body.teachers.map((t) => t.id)).toContain(sessions.teacher.user.id);
    } finally {
      await setAlbum({ published: false });
    }
  });

  test('학부모도 사진 폴더 화면 오른쪽 위 아이콘으로 같은 공유 링크를 복사한다', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const id = sessions.album.eventId;

    // parentMulti 의 아이는 이 대회에 확정돼 있다 (setup)
    await loginAs(page, sessions.parentMulti);
    await page.goto(`/parent/photos/${id}`);

    const icon = page.getByRole('button', { name: '공유 링크 복사' });
    await expect(icon).toBeVisible();
    // 제목 줄 오른쪽 끝에 있다
    const box = await icon.boundingBox();
    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(box.x).toBeGreaterThan(title.x + title.width - 1);
    expect(Math.abs((box.y + box.height / 2) - (title.y + title.height / 2))).toBeLessThan(40);
    expect(box.x + box.width).toBeGreaterThan(page.viewportSize().width - 48);

    await icon.click();
    await expect(page.getByText(/공유 링크를 복사했어요/)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${baseURL}/parent/photos/${id}?invite=${sessions.invite}`);
  });

  test('앨범을 볼 수 없는 학부모에게는 공유 주소(초대)를 주지 않는다', async ({ page, request }) => {
    // 공개 범위(참가 확정) 밖인 앨범
    const denied = await api(request, sessions.parent, 'GET', `/api/parent/events/${sessions.album.lockedEventId}/media`);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain(sessions.invite);

    await loginAs(page, sessions.parent);
    await page.goto(`/parent/photos/${sessions.album.lockedEventId}`);
    await expect(page.getByText('아직 사진을 볼 수 없어요')).toBeVisible();
    await expect(page.getByRole('button', { name: '공유 링크 복사' })).toHaveCount(0);
  });
});
