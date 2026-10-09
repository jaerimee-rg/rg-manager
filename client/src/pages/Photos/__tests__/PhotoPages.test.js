import React from 'react';
import { render, screen, fireEvent, act, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/copyToClipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn((url, covers) => Promise.resolve(covers.map(() => 'data:image/jpeg;base64,x'))) }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

import { fetchWithAuth } from '../../../utils/api';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import PhotoAlbums from '../PhotoAlbums';
import PhotoAlbum from '../PhotoAlbum';

const ok = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const DRIVE = { configured: true, connected: true, status: 'connected', email: 't@gmail.com', rootFolderName: 'RG Manager' };

const LIST = {
  drive: DRIVE,
  albums: [
    { eventId: 31, title: '회장배 대회', date: '2026-10-12', type: 'competition', published: true, audience: 'participants', counts: { images: 42, videos: 3, hidden: 1, fromParents: 5 }, previews: ['https://drive/t1'] },
    { eventId: 29, title: '가을 공개 수업', date: '2026-10-05', type: 'special', published: false, audience: 'participants', counts: { images: 0, videos: 0, hidden: 0, fromParents: 0 }, previews: [] }
  ],
  targets: [
    { eventId: 31, title: '회장배 대회', date: '2026-10-12', type: 'competition', hasAlbum: true, published: true, count: 45, folderName: '2026-10-12 회장배 대회' }
  ]
};

const renderList = async (body = LIST) => {
  fetchWithAuth.mockImplementation(() => ok(body));
  await act(async () => { render(<MemoryRouter><PhotoAlbums /></MemoryRouter>); });
};

describe('PhotoAlbums — 사진 목록 (docs/photo-menu FR-510~516)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('앨범 카드에 공개 상태와 학부모가 올린 수를 보여 준다', async () => {
    await renderList();

    expect(screen.getByRole('heading', { name: '사진' })).toBeInTheDocument();
    const first = screen.getByRole('button', { name: /회장배 대회/ });
    expect(within(first).getByText('공개')).toBeInTheDocument();
    expect(within(first).getByText('학부모가 올린 5장')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /가을 공개 수업/ })).getByText('비공개')).toBeInTheDocument();
  });

  it('카드를 누르면 그 앨범으로 간다', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /회장배 대회/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/photos/31');
  });

  it('[사진 올리기] 는 이벤트 고르기부터 연다', async () => {
    await renderList();
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '사진 올리기' })[0]); });
    expect(screen.getByText('어느 이벤트 사진인가요? 이벤트가 없으면 새 폴더를 만들어 올려요.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /새 폴더 만들기/ })).toBeInTheDocument();
  });

  it('Google 연결 전이면 설정으로 보내고 [사진 올리기] 를 막는다', async () => {
    await renderList({ ...LIST, drive: { ...DRIVE, connected: false, status: 'none' }, albums: [] });

    expect(screen.getByText(/설정에서 Google 계정을 먼저 연결해 주세요/)).toBeInTheDocument();
    screen.getAllByRole('button', { name: '사진 올리기' }).forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /설정으로 가기/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('앨범이 없으면 빈 화면 안내', async () => {
    await renderList({ ...LIST, albums: [] });
    expect(screen.getByText('아직 앨범이 없어요')).toBeInTheDocument();
  });
});

const ALBUM = {
  eventId: 31, eventType: 'competition', eventTitle: '회장배 대회', eventDate: '2026-10-12',
  albumStatus: 'ready', driveFolderId: 'f-31', driveFolderName: '2026-10-12 회장배 대회', expectedFolderName: '2026-10-12 회장배 대회',
  folderUrl: 'https://drive.google.com/drive/folders/f-31', albumUploadOpen: true,
  published: false, audience: 'participants', publishedAt: null, viewerCounts: { participants: 7, all: 33 },
  foreignAccount: false, drive: { ...DRIVE, quota: { limit: 15e9, remaining: 9e9 } },
  counts: { images: 2, videos: 0, hidden: 1, fromParents: 1, fromTeacher: 2 }, totalSize: 1000
};
const MEDIA = [
  { id: 1, kind: 'image', thumbnailUrl: 'https://t/1', uploaderRole: 'teacher', isHidden: false },
  { id: 2, kind: 'image', thumbnailUrl: 'https://t/2', uploaderRole: 'parent', uploaderName: '하은엄마', isHidden: false },
  { id: 3, kind: 'image', thumbnailUrl: 'https://t/3', uploaderRole: 'teacher', isHidden: true }
];

const renderAlbum = async (album = ALBUM, media = MEDIA) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url === '/api/events/31/album' && !options.method) return ok(album);
    if (url.startsWith('/api/events/31/media?')) return ok({ items: media, nextCursor: null });
    if (options.method === 'PATCH') return ok({ published: true });
    if (url.endsWith('/media/bulk')) return ok({ affected: 2 });
    return ok({});
  });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/photos/31']}>
        <Routes><Route path="/photos/:eventId" element={<PhotoAlbum />} /></Routes>
      </MemoryRouter>
    );
  });
};

describe('PhotoAlbum — 앨범 (docs/photo-menu FR-520~529)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('비공개 앨범: 공개 범위 인원과 "공개하면 보이는 곳" 을 보여 준다', async () => {
    await renderAlbum();

    const panel = screen.getByLabelText('학부모 공개');
    expect(within(panel).getByText('비공개', { selector: '.ui-publish__state' })).toBeInTheDocument();
    expect(within(panel).getByText('참가 확정 학부모 · 7명')).toBeInTheDocument();
    expect(within(panel).getByText('모든 학부모 · 33명')).toBeInTheDocument();
    expect(within(panel).getByText('학부모 ‘사진’ 탭')).toBeInTheDocument();
    expect(within(panel).getByText('‘회장배 대회’ 이벤트 상세')).toBeInTheDocument();
  });

  it('사진 전용 폴더: 공개 범위를 고르지 않고(모든 학부모), 보이는 곳은 사진 탭뿐이다 (FR-517)', async () => {
    await renderAlbum({
      ...ALBUM, eventType: 'folder', eventTitle: '가을 소풍', audience: 'all', viewerCounts: { participants: 0, all: 33 }
    });

    const panel = screen.getByLabelText('학부모 공개');
    expect(within(panel).getByText(/모든 학부모 · 33명/)).toBeInTheDocument();
    expect(within(panel).queryByRole('group', { name: '공개 범위' })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/참가 확정 학부모/)).not.toBeInTheDocument();
    expect(within(panel).getByText('학부모 ‘사진’ 탭')).toBeInTheDocument();
    expect(within(panel).queryByText(/이벤트 상세/)).not.toBeInTheDocument();
    expect(within(panel).getByText('누르면 사진 탭에 바로 나타나요.')).toBeInTheDocument();
    // 참가 확정 0명 경고는 폴더에는 해당 없다
    expect(screen.queryByText(/확정된 학생이 없어요/)).not.toBeInTheDocument();
    expect(screen.getByText(/사진 폴더$/)).toBeInTheDocument();
  });

  describe('공유 — 학부모에게 보낼 사진 폴더 링크 (FR-518)', () => {
    const SHARED = { ...ALBUM, published: true, audience: 'all', sharePath: '/parent/photos/31?invite=inv-tok' };

    it('공개한 앨범의 [공유] 는 초대가 실린 학부모 앨범 주소를 복사하고 알린다', async () => {
      copyToClipboard.mockResolvedValue(true);
      await renderAlbum(SHARED);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유' })); });

      expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/photos/31?invite=inv-tok`);
      expect(screen.getByText(/공유 링크를 복사했어요 · 학부모가 로그인\(처음이면 가입\)하면 이 사진이 바로 열려요/)).toBeInTheDocument();
    });

    it('공개 범위가 참가 확정 학부모면 복사 알림에서 알려 준다', async () => {
      await renderAlbum({ ...SHARED, audience: 'participants' });

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유' })); });

      expect(screen.getByText(/참가 확정 학부모만 볼 수 있어요/)).toBeInTheDocument();
    });

    it('비공개 앨범은 [공유] 가 잠기고 이유를 알려 준다', async () => {
      await renderAlbum({ ...ALBUM, published: false, sharePath: '/parent/photos/31?invite=inv-tok' });

      const button = screen.getByRole('button', { name: '공유' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', '학부모에게 공개한 앨범만 공유할 수 있어요');
    });

    it('복사가 막힌 브라우저에서는 주소를 그대로 보여 준다', async () => {
      copyToClipboard.mockResolvedValue(false);
      await renderAlbum(SHARED);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유' })); });

      expect(screen.getByText(`${window.location.origin}/parent/photos/31?invite=inv-tok`)).toBeInTheDocument();
    });
  });

  it('[학부모에게 공개] 는 PATCH {published:true}', async () => {
    await renderAlbum();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '학부모에게 공개' })); });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album', { method: 'PATCH', body: JSON.stringify({ published: true }) });
  });

  it('공개 범위를 바꾸면 PATCH {audience}', async () => {
    await renderAlbum();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /모든 학부모 · 33명/ })); });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album', { method: 'PATCH', body: JSON.stringify({ audience: 'all' }) });
  });

  it('참가 확정 학부모가 0명이면 경고', async () => {
    await renderAlbum({ ...ALBUM, viewerCounts: { participants: 0, all: 33 } });
    expect(screen.getByText(/이 이벤트에는 확정된 학생이 없어요/)).toBeInTheDocument();
  });

  it('공개 중이면 [비공개로 전환] 과 공개 인원 문구', async () => {
    await renderAlbum({ ...ALBUM, published: true, publishedAt: '2026-10-13T01:00:00Z' });
    expect(screen.getByText('참가 확정 학부모 7명이 볼 수 있어요 · 10월 13일 공개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비공개로 전환' })).toBeInTheDocument();
  });

  it('학부모가 올린 사진에는 올린 사람, 숨긴 사진에는 숨김 표시', async () => {
    await renderAlbum();
    expect(screen.getByText('하은엄마')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 (숨김)' })).toBeInTheDocument();
  });

  it('고르기 → 두 장 → 숨기기 는 bulk hide', async () => {
    await renderAlbum();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    const tiles = document.querySelectorAll('.ui-media-tile');
    await act(async () => { fireEvent.click(tiles[0]); fireEvent.click(tiles[1]); });
    expect(screen.getByText('2장 골랐어요')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '숨기기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/bulk', {
      method: 'POST', body: JSON.stringify({ action: 'hide', mediaIds: [1, 2] })
    });
  });

  it('지우기는 확인 창을 거친다', async () => {
    await renderAlbum();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(document.querySelectorAll('.ui-media-tile')[0]); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '지우기' })); });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Drive 에서는 휴지통으로 옮겨져요');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '지우기' })); });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/bulk', {
      method: 'POST', body: JSON.stringify({ action: 'delete', mediaIds: [1] })
    });
  });

  it('Google 연결이 끊기면 올리기·지우기만 막고, 공개 설정과 숨기기는 열어 둔다 (읽기는 계속)', async () => {
    await renderAlbum({ ...ALBUM, published: true, drive: { ...DRIVE, status: 'error' } });

    expect(screen.getByText(/Google 계정 연결이 끊어졌어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 올리기' })).toBeDisabled();
    // 급히 내려야 할 때 막히면 안 된다
    expect(screen.getByRole('button', { name: '비공개로 전환' })).toBeEnabled();
    expect(screen.getByText('하은엄마')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(document.querySelectorAll('.ui-media-tile')[0]); });
    expect(screen.getByRole('button', { name: '숨기기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '지우기' })).toBeDisabled();
  });

  it('Drive 에서 폴더가 사라진 비공개 앨범은 공개 버튼이 잠긴다', async () => {
    await renderAlbum({ ...ALBUM, albumStatus: 'missing' });
    expect(screen.getByRole('button', { name: '학부모에게 공개' })).toBeDisabled();
  });

  it('아직 앨범이 없는 이벤트는 올리면 생길 폴더를 알려 준다', async () => {
    await renderAlbum({ ...ALBUM, driveFolderId: null, driveFolderName: null, albumStatus: 'none' });

    expect(screen.getByText('아직 이 이벤트에 올린 사진이 없어요')).toBeInTheDocument();
    expect(screen.getByText(/RG Manager \/ 2026-10-12 회장배 대회/)).toBeInTheDocument();
    expect(screen.queryByLabelText('학부모 공개')).not.toBeInTheDocument();
  });

  it('이벤트 제목이 바뀌어 폴더 이름이 어긋나면 맞추기 버튼', async () => {
    await renderAlbum({ ...ALBUM, driveFolderName: '2026-10-12 옛 이름' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /폴더 이름 맞추기/ })); });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album', {
      method: 'PATCH', body: JSON.stringify({ folderName: '2026-10-12 회장배 대회' })
    });
  });
});

// ───────── 사진·영상 설명: 사진을 눌러 뷰어에서 추가 · 수정 ─────────
describe('PhotoAlbum — 사진 설명', () => {
  beforeEach(() => jest.clearAllMocks());

  // 사진 설명 저장(PATCH .../media/:id) 응답을 정해 둔다 — 나머지 요청은 renderAlbum 의 가짜 응답 그대로
  const answerCaption = (respond) => {
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (/\/api\/events\/31\/media\/\d+$/.test(url) && options.method === 'PATCH') return respond(JSON.parse(options.body));
      return base(url, options);
    });
  };
  const openPhoto = async () => {
    await act(async () => { fireEvent.click(document.querySelectorAll('.ui-media-tile')[0]); });
    return screen.getByRole('dialog', { name: '사진 보기' });
  };
  const write = async (viewer, text) => {
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: /설명 (추가|수정)/ })); });
    const form = within(viewer).getByRole('form', { name: /설명/ });
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: text } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: '저장' })); });
  };

  it('사진을 누르면 뷰어에서 [설명 추가] → 저장하면 그 사진에 저장하고 바로 보여 준다', async () => {
    await renderAlbum();
    answerCaption(({ caption }) => ok({ id: 1, caption }));

    const viewer = await openPhoto();
    await write(viewer, '  단체전 결승 무대 ');

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/1', {
      method: 'PATCH', body: JSON.stringify({ caption: '단체전 결승 무대' })
    });
    expect(within(viewer).queryByRole('form', { name: /설명/ })).not.toBeInTheDocument();
    expect(within(viewer).getByTestId('media-caption')).toHaveTextContent('단체전 결승 무대');
    expect(within(viewer).getByRole('button', { name: '설명 수정' })).toBeInTheDocument();
    // 토스트는 띄우지 않는다 — 아래쪽에 뜬 설명을 덮는다
    expect(screen.queryByText(/설명을 저장했어요/)).not.toBeInTheDocument();

    // 뷰어를 닫았다 다시 열어도 남아 있다(목록의 그 사진에 반영됐다)
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '닫기' })); });
    const again = await openPhoto();
    expect(within(again).getByTestId('media-caption')).toHaveTextContent('단체전 결승 무대');
  });

  it('있는 설명을 비우고 저장하면 지운다', async () => {
    await renderAlbum(ALBUM, [{ ...MEDIA[0], caption: '옛 설명' }, MEDIA[1]]);
    answerCaption(() => ok({ id: 1, caption: null }));

    const viewer = await openPhoto();
    expect(within(viewer).getByTestId('media-caption')).toHaveTextContent('옛 설명');
    await write(viewer, '');

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/1', {
      method: 'PATCH', body: JSON.stringify({ caption: null })
    });
    expect(within(viewer).queryByTestId('media-caption')).not.toBeInTheDocument();
    expect(within(viewer).getByRole('button', { name: '설명 추가' })).toBeInTheDocument();
  });

  it('서버가 거절하면 그 이유를 입력 창에 보여 주고 창을 열어 둔다', async () => {
    await renderAlbum();
    answerCaption(() => ok({ error: '설명은 500자까지 쓸 수 있어요.' }, 400));

    const viewer = await openPhoto();
    await write(viewer, '무대');

    const form = within(viewer).getByRole('form', { name: /설명/ });
    expect(within(form).getByRole('alert')).toHaveTextContent('설명은 500자까지 쓸 수 있어요.');
    expect(within(viewer).queryByTestId('media-caption')).not.toBeInTheDocument();
  });

  it('네트워크가 끊겨도 쓴 글을 잃지 않는다', async () => {
    await renderAlbum();
    answerCaption(() => Promise.reject(new TypeError('Failed to fetch')));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const viewer = await openPhoto();
    await write(viewer, '무대');

    const form = within(viewer).getByRole('form', { name: /설명/ });
    expect(within(form).getByRole('alert')).toHaveTextContent('설명을 저장하지 못했어요');
    expect(within(form).getByRole('textbox')).toHaveValue('무대');
    console.error.mockRestore();
  });

  it('Google 연결이 끊겨도 설명은 고칠 수 있다 — 앱 안의 글이다', async () => {
    await renderAlbum({ ...ALBUM, published: true, drive: { ...DRIVE, status: 'error' } });

    const viewer = await openPhoto();
    expect(within(viewer).getByRole('button', { name: '설명 추가' })).toBeEnabled();
    // 지우기(Drive 를 거친다)는 그대로 막혀 있다
    expect(within(viewer).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });
});

// ───────── 사진 전용 폴더 관리: 이름·날짜 수정 · 폴더 삭제 (docs/photo-menu FR-519) ─────────
describe('PhotoAlbum — 얼굴 목록으로 거르기', () => {
  const cover = { url: 'https://lh3.googleusercontent.com/d/f1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
  const PEOPLE = [{ key: 'p11', photoCount: 3, cover }, { key: 'p21', photoCount: 1, cover }];

  const renderWithPeople = async ({ people = PEOPLE, missing = null, removeFails = null } = {}) => {
    const calls = { people: 0 };
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (options.method === 'DELETE' && url.startsWith('/api/events/31/album/people/')) {
        return removeFails ? ok(removeFails.body, removeFails.status) : ok({ removedFaces: 2, photos: 2 });
      }
      if (url === '/api/events/31/album' && !options.method) return ok(ALBUM);
      if (url === '/api/events/31/album/people') { calls.people += 1; return ok({ people }); }
      if (missing && url.includes(`person=${missing}`)) return ok({ items: [], nextCursor: null, personMissing: true });
      if (url.includes('person=p11')) return ok({ items: [MEDIA[0]], nextCursor: null });
      if (url.startsWith('/api/events/31/media?')) return ok({ items: MEDIA, nextCursor: null });
      return ok({});
    });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/photos/31']}>
          <Routes><Route path="/photos/:eventId" element={<PhotoAlbum />} /></Routes>
        </MemoryRouter>
      );
    });
    return calls;
  };
  const mediaUrls = () => fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/events/31/media?'));
  const photoCount = () => document.querySelectorAll('.ui-media-tile').length;

  beforeEach(() => jest.clearAllMocks());

  it('사진 칸 위에 얼굴 목록 — 누르면 그 사람 사진만, 칩과 함께 걸리고, 다시 누르면 전체', async () => {
    await renderWithPeople();
    expect(photoCount()).toBe(3);

    const group = screen.getByRole('group', { name: '얼굴로 사진 찾기' });
    const chips = screen.getByRole('button', { name: /^선생님/ });
    expect(group.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // 칩보다 위

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 3장' })); });
    expect(mediaUrls().at(-1)).toContain('person=p11');
    expect(photoCount()).toBe(1);

    await act(async () => { fireEvent.click(chips); });
    expect(mediaUrls().at(-1)).toMatch(/filter=teacher.*person=p11|person=p11.*filter=teacher/);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 3장' })); });
    expect(mediaUrls().at(-1)).not.toContain('person=');
  });

  it('고른 사람이 사라졌으면 고른 것을 풀고 얼굴 목록을 다시 읽는다', async () => {
    const calls = await renderWithPeople({ missing: 'p21' });
    const before = calls.people;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' })); });

    expect(calls.people).toBeGreaterThan(before);
    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'true');
    expect(photoCount()).toBe(3);
  });

  it('얼굴을 길게 눌러(오른쪽 클릭) 나온 X 를 누르면 그 사람을 목록에서 빼고, 목록·사진을 다시 읽는다', async () => {
    const calls = await renderWithPeople();
    const before = calls.people;

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 목록에서 빼기' })); });

    const removed = fetchWithAuth.mock.calls.find(([, options]) => options?.method === 'DELETE');
    expect(removed[0]).toBe('/api/events/31/album/people/p21?photoCount=1');   // 화면이 본 사진 수 — 서버가 같은 사람인지 확인한다
    expect(calls.people).toBeGreaterThan(before);
    expect(screen.getByText(/얼굴을 목록에서 뺐어요 · 사진은 그대로 있어요/)).toBeInTheDocument();
  });

  it('고른 사람을 빼면 고른 것을 풀고 전체 사진으로 돌아간다', async () => {
    await renderWithPeople();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 3장' })); });
    expect(mediaUrls().at(-1)).toContain('person=p11');

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 1 · 사진 3장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 목록에서 빼기' })); });

    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('그 사이 묶음이 바뀌었으면(409 person_changed · 404) 아무것도 안 지워졌다고 알리고 목록을 다시 읽는다', async () => {
    for (const fail of [
      { status: 409, body: { error: '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.', reason: 'person_changed' } },
      { status: 404, body: { error: '얼굴 목록이 바뀌었어요. 새로고침해 주세요.', personMissing: true } }
    ]) {
      const calls = await renderWithPeople({ removeFails: fail });
      const before = calls.people;

      fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 목록에서 빼기' })); });

      expect(screen.getByText('얼굴 목록이 바뀌었어요. 다시 확인해 주세요.')).toBeInTheDocument();
      expect(calls.people).toBeGreaterThan(before);
      cleanup();
    }
  });

  it('등록된 아이 얼굴이면(409 student_person) 서버의 안내만 보여 준다', async () => {
    const calls = await renderWithPeople({
      removeFails: { status: 409, body: { error: '등록된 아이 얼굴은 목록에서 뺄 수 없어요.', reason: 'student_person' } }
    });
    const before = calls.people;

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 목록에서 빼기' })); });

    expect(screen.getByText('등록된 아이 얼굴은 목록에서 뺄 수 없어요.')).toBeInTheDocument();
    expect(calls.people).toBe(before);
  });

  it('등록된 아이로 묶인 사람(removable: false)에는 X 가 없다', async () => {
    await renderWithPeople({ people: [{ ...PEOPLE[0], removable: false }, PEOPLE[1]] });

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 1 · 사진 3장' }));

    expect(screen.queryByRole('button', { name: /목록에서 빼기/ })).not.toBeInTheDocument();
  });

  it('얼굴이 없으면 목록을 그리지 않는다', async () => {
    await renderWithPeople({ people: [] });
    expect(screen.queryByRole('group', { name: '얼굴로 사진 찾기' })).not.toBeInTheDocument();
  });
});

describe('PhotoAlbum — 사진 폴더 관리 (FR-519)', () => {
  const FOLDER = {
    ...ALBUM, eventType: 'folder', eventTitle: '가을 소풍', eventDate: '2026-09-27', audience: 'all',
    driveFolderName: '2026-09-27 가을 소풍', expectedFolderName: '2026-09-27 가을 소풍',
    counts: { images: 10, videos: 2, hidden: 1, fromParents: 1, fromTeacher: 12 }
  };

  // PATCH · DELETE /api/albums/31 의 응답만 바꿔 끼운다
  const renderFolder = async ({ album = FOLDER, patch, del } = {}) => {
    await renderAlbum(album);
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (url === '/api/albums/31' && options.method === 'PATCH') {
        return patch ? patch() : ok({ eventId: 31, title: '가을 운동회', date: '2026-10-03', driveRenamed: true });
      }
      if (url === '/api/albums/31' && options.method === 'DELETE') {
        return del ? del() : ok({ deleted: true, driveFolderKept: true, driveFolderName: '2026-09-27 가을 소풍' });
      }
      return base(url, options);
    });
  };

  const openMenu = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 관리' })); });
  };
  const openEdit = async () => {
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /이름 · 날짜 수정/ })); });
  };

  beforeEach(() => jest.clearAllMocks());

  it('사진 폴더에는 [폴더 관리] 메뉴가 있고, 이벤트 앨범에는 없다', async () => {
    await renderFolder();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /이름 · 날짜 수정/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /폴더 삭제/ })).toBeInTheDocument();
  });

  it('이벤트 앨범에는 [폴더 관리] 가 없다 — 이벤트 관리에서 고치고 지운다', async () => {
    await renderAlbum();
    expect(screen.queryByRole('button', { name: '폴더 관리' })).not.toBeInTheDocument();
  });

  it('수정 창은 지금 이름·날짜로 시작하고, 고치면 바뀔 Drive 폴더 이름을 미리 보여 준다', async () => {
    await renderFolder();
    await openEdit();

    const dialog = screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });
    expect(within(dialog).getByLabelText(/이름/)).toHaveValue('가을 소풍');
    expect(within(dialog).getByLabelText(/날짜/)).toHaveValue('2026-09-27');
    // 바꾼 것이 없으면 저장할 것이 없다
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();

    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '가을: 운동회' } }); });
    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/날짜/), { target: { value: '2026-10-03' } }); });

    expect(within(dialog).getByText('바뀔 Drive 폴더 이름')).toBeInTheDocument();
    expect(within(dialog).getByText('2026-10-03 가을 운동회')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeEnabled();
  });

  it('저장하면 PATCH /api/albums/:id 로 보내고, 앨범을 다시 읽고 알린다', async () => {
    await renderFolder();
    await openEdit();
    const dialog = screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });
    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '  가을 운동회 ' } }); });
    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/날짜/), { target: { value: '2026-10-03' } }); });
    const reads = () => fetchWithAuth.mock.calls.filter(([url, options]) => url === '/api/events/31/album' && !options?.method).length;
    const before = reads();

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/albums/31', {
      method: 'PATCH', body: JSON.stringify({ title: '가을 운동회', date: '2026-10-03' })
    });
    expect(reads()).toBe(before + 1);
    expect(screen.queryByRole('dialog', { name: '폴더 이름 · 날짜 수정' })).not.toBeInTheDocument();
    expect(screen.getByText('폴더 이름·날짜를 바꿨어요')).toBeInTheDocument();
  });

  it('Drive 폴더 이름을 바꾸지 못했으면 [폴더 이름 맞추기] 를 안내한다', async () => {
    await renderFolder({ patch: () => ok({ eventId: 31, title: '가을 운동회', date: '2026-10-03', driveRenamed: false }) });
    await openEdit();
    const dialog = screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });
    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '가을 운동회' } }); });

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); });

    expect(screen.getByText(/Drive 폴더 이름은 \[폴더 이름 맞추기\] 로 맞춰 주세요/)).toBeInTheDocument();
  });

  it('같은 이름·날짜의 폴더가 있으면 창을 닫지 않고 서버 안내를 보여 준다', async () => {
    await renderFolder({ patch: () => ok({ error: '같은 이름·날짜의 사진 폴더가 이미 있어요.', reason: 'folder_exists' }, 409) });
    await openEdit();
    const dialog = screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });
    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '봄 소풍' } }); });

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); });

    expect(within(screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' })).getByText('같은 이름·날짜의 사진 폴더가 이미 있어요.')).toBeInTheDocument();
  });

  it('이름을 비우면 저장할 수 없다', async () => {
    await renderFolder();
    await openEdit();
    const dialog = screen.getByRole('dialog', { name: '폴더 이름 · 날짜 수정' });

    await act(async () => { fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '   ' } }); });

    expect(within(dialog).getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('[폴더 삭제] 는 무엇이 사라지고 무엇이 남는지 알리고 묻는다 — 묻기만 해서는 지우지 않는다', async () => {
    await renderFolder();
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /폴더 삭제/ })); });

    const dialog = screen.getByRole('dialog', { name: '‘가을 소풍’ 폴더를 지울까요?' });
    expect(dialog).toHaveTextContent('폴더와 사진·영상 13개가 앱에서 사라지고, 되돌릴 수 없어요.');
    expect(dialog).toHaveTextContent('Google Drive 의 폴더와 원본 파일은 그대로 남아요.');
    expect(fetchWithAuth.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '취소' })); });
    expect(fetchWithAuth.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });

  it('확인하면 DELETE /api/albums/:id 로 지우고, 사진 목록으로 가서 Drive 폴더는 남았다고 알린다', async () => {
    await renderFolder();
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /폴더 삭제/ })); });
    const dialog = screen.getByRole('dialog', { name: '‘가을 소풍’ 폴더를 지울까요?' });

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '폴더 삭제' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/albums/31', { method: 'DELETE' });
    expect(mockNavigate).toHaveBeenCalledWith('/photos', {
      replace: true,
      state: { toast: '폴더를 지웠어요 · Google Drive 의 폴더는 그대로 있어요' }
    });
  });

  it('지우지 못하면 그 자리에 남아 알린다', async () => {
    await renderFolder({ del: () => ok({ error: '사진 폴더를 찾을 수 없습니다.' }, 404) });
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /폴더 삭제/ })); });

    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '폴더 삭제' })); });

    expect(mockNavigate).not.toHaveBeenCalledWith('/photos', expect.anything());
    expect(screen.getByText('사진 폴더를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('공개 중인 폴더를 지울 때는 학부모 화면에서도 사라진다고 알린다', async () => {
    await renderFolder({ album: { ...FOLDER, published: true } });
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /폴더 삭제/ })); });

    expect(screen.getByRole('dialog')).toHaveTextContent('앱과 학부모 화면에서 사라지고');
  });

  it('아직 사진을 올리지 않은 폴더도 고치고 지울 수 있다 (Drive 폴더가 없는 상태)', async () => {
    await renderFolder({ album: { ...FOLDER, driveFolderId: null, driveFolderName: null, albumStatus: 'none', counts: {} } });
    await openMenu();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: /폴더 삭제/ })); });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('폴더가 앱에서 사라지고, 되돌릴 수 없어요.');
    expect(dialog).not.toHaveTextContent('Google Drive');
  });
});

describe('PhotoAlbums — 폴더를 지우고 돌아왔을 때 (FR-519)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('알림을 한 번 보여 주고, 주소 상태에서 지운다(새로고침해도 다시 뜨지 않게)', async () => {
    fetchWithAuth.mockImplementation(() => ok(LIST));
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[{ pathname: '/photos', state: { toast: '폴더를 지웠어요 · Google Drive 의 폴더는 그대로 있어요' } }]}>
          <PhotoAlbums />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('폴더를 지웠어요 · Google Drive 의 폴더는 그대로 있어요')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/photos', { replace: true, state: null });
  });

  it('보통 들어왔을 때는 알림이 없다', async () => {
    await renderList();

    expect(screen.queryByText(/폴더를 지웠어요/)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/photos', { replace: true, state: null });
  });
});
