import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn((url, covers) => Promise.resolve(covers.map(() => 'data:image/jpeg;base64,x'))) }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

import { fetchWithAuth } from '../../../utils/api';
import ParentAllPhotos, { toParentAllPhotosViewerItem } from '../ParentAllPhotos';

const ok = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const cover = { url: 'https://lh3.googleusercontent.com/d/f1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
// 우리 아이(p11, 두 앨범에 2장) 가 맨 앞
const PEOPLE = [{ key: 'p11', photoCount: 2, mine: true, cover }, { key: 'p42', photoCount: 1, mine: false, cover }];
const album = (eventId, title) => ({ eventId, title, date: '2026-10-12', type: 'competition' });
const media = (id, eventId, title, takenAt) => ({
  id, eventId, album: album(eventId, title), kind: 'image', thumbnailUrl: `https://t/${id}`, largeUrl: `https://l/${id}`,
  downloadUrl: `https://d/${id}`, uploader: 'teacher', canDelete: false, myTags: [], takenAt
});
const MEDIA = [
  media(8, 33, '여름 합숙', '2026-10-12T01:00:00Z'),
  media(1, 31, '회장배 대회', '2026-10-11T01:00:00Z'),
  media(3, 31, '회장배 대회', '2026-10-10T01:00:00Z')
];

const renderPage = async ({ people = PEOPLE, items = MEDIA, nextCursor = null, more = [], missing = null } = {}) => {
  const calls = { people: 0 };
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url === '/api/parent/albums/people') { calls.people += 1; return ok({ people }); }
    if (missing && url.includes(`person=${missing}`)) return ok({ items: [], nextCursor: null, personMissing: true });
    if (url.includes('person=p11')) return ok({ items: [MEDIA[0], MEDIA[1]], nextCursor: null });
    if (url.includes('cursorId=')) return ok({ items: more, nextCursor: null });
    if (url.startsWith('/api/parent/albums/media?')) return ok({ items, nextCursor });
    if (options.method === 'POST') return ok({ recorded: true });
    return ok({});
  });
  await act(async () => { render(<MemoryRouter><ParentAllPhotos /></MemoryRouter>); });
  return calls;
};
const mediaUrls = () => fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/parent/albums/media?'));
const thumbs = () => document.querySelectorAll('img[src^="https://t/"]');

beforeEach(() => jest.clearAllMocks());

describe('ParentAllPhotos — 학부모 전체 사진 (모든 앨범)', () => {
  it('볼 수 있는 모든 앨범의 사진을 한 화면에, 우리 아이 얼굴이 맨 앞', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: '전체 사진' })).toBeInTheDocument();
    expect(mediaUrls()).toEqual(['/api/parent/albums/media?limit=60']);
    expect(thumbs()).toHaveLength(3);
    const faces = screen.getByRole('group', { name: '얼굴로 사진 찾기' });
    expect(within(faces).getAllByRole('button')[1]).toHaveAccessibleName(/우리 아이/);
  });

  it('얼굴을 누르면 그 사람이 나온 사진만 모든 앨범에서, 다시 누르면 전체', async () => {
    await renderPage();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /우리 아이 · 사진 2장/ })); });
    expect(mediaUrls().at(-1)).toBe('/api/parent/albums/media?limit=60&person=p11');
    expect(thumbs()).toHaveLength(2);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /우리 아이 · 사진 2장/ })); });
    expect(mediaUrls().at(-1)).toBe('/api/parent/albums/media?limit=60');
  });

  it('고른 사람이 그 사이 사라졌으면 고른 것을 풀고 얼굴 목록을 다시 읽는다', async () => {
    const calls = await renderPage({ missing: 'p42' });
    const before = calls.people;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /사진 1장/ })); });

    expect(calls.people).toBeGreaterThan(before);
    expect(mediaUrls().at(-1)).toBe('/api/parent/albums/media?limit=60');
  });

  it('사진을 열면 어느 앨범의 사진인지 보이고, 크게 본 사진은 그 사진의 앨범에 본 기록을 남긴다 — 지우기 버튼은 없다', async () => {
    await renderPage();

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /사진/ }).find((button) => button.querySelector('img[src="https://t/1"]'))); });
    const viewer = screen.getByRole('dialog', { name: '사진 보기' });
    expect(within(viewer).getByTestId('media-album')).toHaveTextContent('회장배 대회');
    expect(within(viewer).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/events/31/views', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ mediaId: 1 })
    }));

    // 넘기면 다른 앨범의 사진 — 기록도 그 앨범으로
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
    expect(within(viewer).getByTestId('media-album')).toHaveTextContent('여름 합숙');
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/events/33/views', expect.objectContaining({ body: JSON.stringify({ mediaId: 8 }) }));
    // 앨범을 연 기록은 남기지 않는다
    expect(fetchWithAuth.mock.calls.filter(([, options]) => options?.body === '{}')).toHaveLength(0);
  });

  it('더 있으면 [더 보기] — 받은 커서로 이어 붙인다', async () => {
    await renderPage({ nextCursor: { takenAt: '2026-10-10T01:00:00Z', id: 3 }, more: [media(99, 31, '회장배 대회', '2026-10-09T01:00:00Z')] });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '더 보기' })); });

    expect(mediaUrls().at(-1)).toBe('/api/parent/albums/media?limit=60&cursorTakenAt=2026-10-10T01%3A00%3A00Z&cursorId=3');
    expect(thumbs()).toHaveLength(4);
  });

  it('볼 사진이 하나도 없으면 안내하고 사진 목록으로', async () => {
    await renderPage({ people: [], items: [] });

    expect(screen.getByText('아직 볼 수 있는 사진이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '사진 목록으로' }));
    expect(mockNavigate).toHaveBeenCalledWith('/parent/photos');
  });

  it('뷰어 항목에는 앨범 이름을 싣는다', () => {
    expect(toParentAllPhotosViewerItem(MEDIA[1]).albumTitle).toBe('회장배 대회');
    expect(toParentAllPhotosViewerItem({ id: 5, album: null }).albumTitle).toBeNull();
  });
});
