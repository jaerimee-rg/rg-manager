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

describe('PhotoAlbums — 대표 사진 표지', () => {
  beforeEach(() => jest.clearAllMocks());

  const withCovers = (covers) => ({ ...LIST, albums: [{ ...LIST.albums[0], previews: ['https://drive/t1', 'https://drive/t2'], covers }] });
  const coverOf = () => screen.getByRole('button', { name: /회장배 대회/ }).querySelector('.ui-album-card__cover');

  it('선생님이 고른 보일 부분을 칸마다 object-position 으로 — 없으면 가운데', async () => {
    await renderList({ ...withCovers(['https://lh3/c1', 'https://lh3/c2']), albums: [{ ...withCovers(['https://lh3/c1', 'https://lh3/c2']).albums[0], coverPositions: ['10% 90%', null] }] });

    const images = coverOf().querySelectorAll('img');
    expect(images[0].style.objectPosition).toBe('10% 90%');
    expect(images[1].style.objectPosition).toBe('');
  });

  it('대표 사진을 한 장 골랐으면 그 한 장이 표지를 채운다 — 최근 사진 대신', async () => {
    await renderList(withCovers(['https://lh3/c1=w800-h500-c-rw']));

    const cover = coverOf();
    expect(cover).toHaveAttribute('data-covers', '1');
    const images = cover.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://lh3/c1=w800-h500-c-rw');
  });

  it('여러 장이면 고른 것만 고른 순서대로 — 장수가 표지 모양을 정한다', async () => {
    await renderList(withCovers(['https://lh3/c3', 'https://lh3/c1', 'https://lh3/c2']));

    const cover = coverOf();
    expect(cover).toHaveAttribute('data-covers', '3');
    expect([...cover.querySelectorAll('img')].map((img) => img.getAttribute('src')))
      .toEqual(['https://lh3/c3', 'https://lh3/c1', 'https://lh3/c2']);
  });

  it('고르지 않았으면 예전처럼 최근 사진들', async () => {
    await renderList(withCovers([]));

    const cover = coverOf();
    expect(cover).not.toHaveAttribute('data-covers');
    expect(cover.querySelectorAll('img')).toHaveLength(2);
  });
});

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

describe('PhotoAlbum — 대표 사진 고르기 (4장까지)', () => {
  beforeEach(() => jest.clearAllMocks());

  const VIDEO = { id: 4, kind: 'video', thumbnailUrl: 'https://t/4', previewUrl: 'https://drive/v4/preview', uploaderRole: 'teacher', isHidden: false };

  // 앨범의 대표 사진을 서버처럼 기억한다 — PATCH {add|removeCoverMediaId} 로 바뀌고, 다시 읽으면 바뀐 목록이 온다
  const renderCover = async ({ covers = [], media = MEDIA, album = ALBUM, patch } = {}) => {
    let current = [...covers];
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (url === '/api/events/31/album' && !options.method) {
        const covers = current.map((id) => ({ id, kind: 'image', thumbnailUrl: `https://t/${id}` }));
        return ok({ ...album, coverMediaIds: current, covers, maxCovers: 4 });
      }
      if (url === '/api/events/31/album' && options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        if (patch) return patch(body);
        if (body.coverMediaIds) current = [...body.coverMediaIds];
        if (body.removeCoverMediaId) current = current.filter((id) => id !== body.removeCoverMediaId);
        if (body.addCoverMediaId) current = [...current, body.addCoverMediaId];
        return ok({ coverMediaIds: current });
      }
      if (url.startsWith('/api/events/31/media?')) return ok({ items: media, nextCursor: null });
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
  const tiles = () => document.querySelectorAll('.ui-media-tile');
  const openTile = async (index) => {
    await act(async () => { fireEvent.click(tiles()[index]); });
    return screen.getByRole('dialog', { name: '사진 보기' });
  };
  const patches = () => fetchWithAuth.mock.calls.filter(([url, options]) => url === '/api/events/31/album' && options?.method === 'PATCH');

  it('대표 사진 칸마다 [대표 n] — 고른 순서 · 숨긴 사진이면 표지로 안 쓰이니 표시도 없다', async () => {
    await renderCover({ covers: [2, 1, 3] });

    expect(within(tiles()[0]).getByText('대표 2')).toBeInTheDocument();
    expect(tiles()[0]).toHaveAccessibleName(/대표 사진 2/);
    expect(within(tiles()[1]).getByText('대표 1')).toBeInTheDocument();
    expect(within(tiles()[2]).queryByText(/대표/)).not.toBeInTheDocument();   // 3 은 숨김
  });

  it('사진을 열어 [대표 사진으로] → PATCH {addCoverMediaId}, 칸과 버튼이 바로 바뀐다 — 토스트로 버튼을 덮지 않는다', async () => {
    await renderCover({ covers: [1] });

    const viewer = await openTile(1);
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '대표 사진으로' })); });

    expect(patches()).toHaveLength(1);
    expect(JSON.parse(patches()[0][1].body)).toEqual({ addCoverMediaId: 2 });
    expect(document.querySelector('.ui-toast')).toBeNull();
    expect(within(viewer).getByRole('button', { name: '대표 사진 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(tiles()[1]).getByText('대표 2')).toBeInTheDocument();
  });

  it('[대표 사진 n] 을 다시 누르면 PATCH {removeCoverMediaId} 로 푼다 — 뒤의 것이 한 칸씩 당겨진다', async () => {
    await renderCover({ covers: [1, 2] });

    const viewer = await openTile(0);
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '대표 사진 1' })); });

    expect(JSON.parse(patches()[0][1].body)).toEqual({ removeCoverMediaId: 1 });
    expect(within(viewer).getByRole('button', { name: '대표 사진으로' })).toBeInTheDocument();
    expect(within(tiles()[1]).getByText('대표 1')).toBeInTheDocument();
  });

  it('4장이 다 찼으면 다른 사진의 버튼이 잠긴다', async () => {
    await renderCover({ covers: [1, 4, 8, 9], media: [MEDIA[0], MEDIA[1], VIDEO] });

    const viewer = await openTile(1);
    expect(within(viewer).getByRole('button', { name: '대표 사진 4장 다 골랐어요' })).toBeDisabled();
  });

  it('영상도 대표로 고를 수 있다', async () => {
    await renderCover({ media: [MEDIA[0], VIDEO] });

    const viewer = await openTile(1);
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '대표 사진으로' })); });

    expect(JSON.parse(patches()[0][1].body)).toEqual({ addCoverMediaId: 4 });
    expect(within(tiles()[1]).getByText('대표 1')).toBeInTheDocument();
  });

  it('서버가 거절하면(그 사이 다른 창에서 4장을 채웠다 등) 그 이유를 알리고 버튼은 그대로', async () => {
    await renderCover({ patch: () => ok({ error: '대표 사진은 4장까지 고를 수 있어요. 하나를 먼저 풀어 주세요.', reason: 'covers_full' }, 409) });

    const viewer = await openTile(0);
    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '대표 사진으로' })); });

    expect(screen.getByText('대표 사진은 4장까지 고를 수 있어요. 하나를 먼저 풀어 주세요.')).toBeInTheDocument();
    expect(within(viewer).getByRole('button', { name: '대표 사진으로' })).toBeEnabled();
  });

  describe('고르기에서 한 번에 [대표 사진 만들기]', () => {
    const many = [1, 2, 4, 5, 6].map((id) => ({ id, kind: 'image', thumbnailUrl: `https://t/${id}`, uploaderRole: 'teacher', isHidden: false }));
    const pick = async (...indexes) => {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
      for (const index of indexes) fireEvent.click(tiles()[index]);
    };
    const makeButton = () => screen.getByRole('button', { name: '대표 사진 만들기' });

    it('고른 순서대로 PATCH {coverMediaIds} — 지금 대표 사진을 바꾸고, 알리고, 고르기를 끝낸다', async () => {
      await renderCover({ covers: [4], media: many });

      await pick(3, 0);   // 5 → 1
      expect(makeButton()).toBeEnabled();
      await act(async () => { fireEvent.click(makeButton()); });

      expect(JSON.parse(patches()[0][1].body)).toEqual({ coverMediaIds: [5, 1] });
      expect(screen.getByText(/대표 사진 2장을 정했어요/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '대표 사진 만들기' })).not.toBeInTheDocument();
      expect(within(tiles()[3]).getByText('대표 1')).toBeInTheDocument();
      expect(within(tiles()[0]).getByText('대표 2')).toBeInTheDocument();
      expect(within(tiles()[2]).queryByText(/대표/)).not.toBeInTheDocument();   // 4 는 빠졌다
    });

    it('5장 이상 골랐으면 잠기고 4장까지라고 알려 준다', async () => {
      await renderCover({ media: many });

      await pick(0, 1, 2, 3, 4);

      expect(makeButton()).toBeDisabled();
      expect(makeButton()).toHaveAttribute('title', '대표 사진은 4장까지 골라 주세요');
      expect(screen.getByText('대표 사진은 4장까지')).toBeInTheDocument();
    });

    it('숨긴 사진이 섞였으면 잠긴다 · 하나도 안 골랐으면 잠긴다', async () => {
      await renderCover();

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
      expect(makeButton()).toBeDisabled();

      fireEvent.click(tiles()[0]);
      fireEvent.click(tiles()[2]);   // 3 은 숨김
      expect(makeButton()).toBeDisabled();
      expect(makeButton()).toHaveAttribute('title', '숨긴 사진은 대표 사진이 될 수 없어요');
    });

    it('서버가 거절하면 이유를 알리고 고르기는 그대로', async () => {
      await renderCover({ media: many, patch: () => ok({ error: '이 앨범의 사진만 대표 사진으로 고를 수 있어요.' }, 400) });

      await pick(0);
      await act(async () => { fireEvent.click(makeButton()); });

      expect(screen.getByText('이 앨범의 사진만 대표 사진으로 고를 수 있어요.')).toBeInTheDocument();
      expect(screen.getByText('1장 골랐어요')).toBeInTheDocument();
    });
  });

  describe('대표 사진 칸 — 순서 바꾸기', () => {
    const panel = () => screen.getByRole('region', { name: '대표 사진' });
    const panelOrder = () => within(panel()).getAllByRole('button', { name: /^대표 사진 \d.*—/ }).map((b) => b.getAttribute('data-cover-id'));

    it('지금 대표 사진을 순서대로 보여 주고, ←→ 로 옮기면 그 순서를 PATCH {coverMediaIds} 로 저장한다', async () => {
      await renderCover({ covers: [1, 2] });

      expect(panelOrder()).toEqual(['1', '2']);
      await act(async () => {
        fireEvent.keyDown(within(panel()).getAllByRole('button', { name: /^대표 사진 \d.*—/ })[0], { key: 'ArrowRight' });
      });

      expect(JSON.parse(patches()[0][1].body)).toEqual({ coverMediaIds: [2, 1] });
      expect(panelOrder()).toEqual(['2', '1']);
      expect(within(tiles()[1]).getByText('대표 1')).toBeInTheDocument();
    });

    it('저장이 안 되면 알리고 앨범을 다시 읽어 원래 순서로 돌린다', async () => {
      await renderCover({ covers: [1, 2], patch: () => ok({ error: '바꾸지 못했어요.' }, 500) });
      const albumReads = () => fetchWithAuth.mock.calls.filter(([url, options]) => url === '/api/events/31/album' && !options?.method).length;
      const before = albumReads();

      await act(async () => {
        fireEvent.keyDown(within(panel()).getAllByRole('button', { name: /^대표 사진 \d.*—/ })[0], { key: 'ArrowRight' });
      });

      expect(screen.getByText('바꾸지 못했어요.')).toBeInTheDocument();
      expect(albumReads()).toBe(before + 1);
      expect(panelOrder()).toEqual(['1', '2']);
    });

    it('대표 사진이 없으면 정하는 방법을 알려 준다', async () => {
      await renderCover();
      expect(within(panel()).getByText(/\[고르기\] 로 4장까지/)).toBeInTheDocument();
    });

    it('✕ 는 PATCH {removeCoverMediaId}, [모두 빼기] 는 PATCH {coverMediaIds: []}', async () => {
      await renderCover({ covers: [1, 2] });

      await act(async () => { fireEvent.click(within(panel()).getByRole('button', { name: '대표 사진 1 빼기' })); });
      expect(JSON.parse(patches()[0][1].body)).toEqual({ removeCoverMediaId: 1 });
      expect(panelOrder()).toEqual(['2']);
      expect(screen.getByText('대표 사진에서 뺐어요')).toBeInTheDocument();

      await act(async () => { fireEvent.click(within(panel()).getByRole('button', { name: '모두 빼기' })); });
      expect(JSON.parse(patches()[1][1].body)).toEqual({ coverMediaIds: [] });
      expect(within(panel()).getByText('0/4')).toBeInTheDocument();
    });

    it('칸을 눌러 보일 부분을 고르고 저장하면 그 사진에 PATCH {coverFocus} 한 뒤 앨범을 다시 읽는다', async () => {
      await renderCover({ covers: [1] });
      const base = fetchWithAuth.getMockImplementation();
      fetchWithAuth.mockImplementation((url, options = {}) => {
        if (url === '/api/events/31/media/1' && options.method === 'PATCH') return ok({ id: 1, coverFocus: JSON.parse(options.body).coverFocus });
        return base(url, options);
      });

      fireEvent.click(within(panel()).getAllByRole('button', { name: /^대표 사진 \d.*—/ })[0]);
      const dialog = screen.getByRole('dialog', { name: '보일 부분 고르기' });
      fireEvent.keyDown(within(dialog).getByTestId('cover-focus-frame'), { key: 'ArrowDown' });
      await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); });

      expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/1', {
        method: 'PATCH', body: JSON.stringify({ coverFocus: { x: 50, y: 45 } })
      });
      expect(screen.queryByRole('dialog', { name: '보일 부분 고르기' })).not.toBeInTheDocument();
      expect(screen.getByText('보일 부분을 바꿨어요')).toBeInTheDocument();
    });

    it('보일 부분 저장이 거절되면 창에 이유를 보여 주고 열어 둔다', async () => {
      await renderCover({ covers: [1] });
      const base = fetchWithAuth.getMockImplementation();
      fetchWithAuth.mockImplementation((url, options = {}) => {
        if (url === '/api/events/31/media/1' && options.method === 'PATCH') return ok({ error: '보일 부분을 다시 골라 주세요.' }, 400);
        return base(url, options);
      });

      fireEvent.click(within(panel()).getAllByRole('button', { name: /^대표 사진 \d.*—/ })[0]);
      fireEvent.keyDown(screen.getByTestId('cover-focus-frame'), { key: 'ArrowDown' });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })); });

      expect(screen.getByRole('alert')).toHaveTextContent('보일 부분을 다시 골라 주세요.');
      expect(screen.getByRole('dialog', { name: '보일 부분 고르기' })).toBeInTheDocument();
    });
  });

  it('Google 연결이 끊겨도 고를 수 있다 — 앱 안의 값이다', async () => {
    await renderCover({ album: { ...ALBUM, drive: { ...DRIVE, status: 'error' } } });

    const viewer = await openTile(0);
    expect(within(viewer).getByRole('button', { name: '대표 사진으로' })).toBeEnabled();
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
