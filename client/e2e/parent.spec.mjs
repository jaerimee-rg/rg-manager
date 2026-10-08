import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { loginAs, api, stubPortraitThumbnails } from './helpers.mjs';
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

  test('휴대폰에서 영상을 누르면 Drive 플레이어가 화면을 채우고, 이전/다음 버튼이 플레이어를 가리지 않는다', async ({ page }) => {
    // 진짜 Drive 플레이어 대신 빈 페이지 — 픽스처 파일 id 는 Drive 에 없다
    await page.route('https://drive.google.com/file/d/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#222"></body>' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/parent/photos/${sessions.album.eventId}`);
    await page.getByRole('button', { name: '영상 열기' }).first().click();

    const viewer = page.getByRole('dialog', { name: '사진 보기' });
    const player = viewer.locator('iframe');
    await expect(player).toHaveAttribute('src', /drive\.google\.com\/file\/d\/.+\/preview/);

    // 16:9 상자였을 때는 높이가 206px 이었다 — 그 높이에서 Drive 컨트롤이 영상을 덮었다
    const box = await player.boundingBox();
    expect(box.width).toBeGreaterThan(360);
    expect(box.height).toBeGreaterThan(400);

    const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const name of ['이전 사진', '다음 사진']) {
      const button = await viewer.getByRole('button', { name }).boundingBox();
      expect(overlaps(button, box)).toBe(false);
    }

    // 다음으로 넘기면 플레이어가 사라지고 사진이 뜬다
    await viewer.getByRole('button', { name: '다음 사진' }).click();
    await expect(player).toHaveCount(0);
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
