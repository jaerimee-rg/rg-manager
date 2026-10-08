import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn().mockResolvedValue([]) }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

import { fetchWithAuth } from '../../../utils/api';
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
    expect(screen.getByText('어느 이벤트 사진인가요? 고른 이벤트에 연결돼요.')).toBeInTheDocument();
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
