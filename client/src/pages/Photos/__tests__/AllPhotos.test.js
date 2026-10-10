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
import AllPhotos from '../AllPhotos';

const ok = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const cover = { url: 'https://lh3.googleusercontent.com/d/f1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
const PEOPLE = [{ key: 'p11', photoCount: 2, cover }, { key: 'p42', photoCount: 1, cover }];
const album = (eventId, title) => ({ eventId, title, date: '2026-10-12', type: 'competition' });
// 두 폴더(31 회장배 대회 · 29 여름 합숙)의 사진이 한 목록에
const MEDIA = [
  { id: 8, eventId: 29, album: album(29, '여름 합숙'), kind: 'image', thumbnailUrl: 'https://t/8', uploaderRole: 'teacher', isHidden: false, takenAt: '2026-10-12T01:00:00Z' },
  { id: 1, eventId: 31, album: album(31, '회장배 대회'), kind: 'image', thumbnailUrl: 'https://t/1', uploaderRole: 'parent', uploaderName: '하은엄마', isHidden: false, takenAt: '2026-10-11T01:00:00Z' },
  { id: 3, eventId: 31, album: album(31, '회장배 대회'), kind: 'video', thumbnailUrl: 'https://t/3', uploaderRole: 'teacher', isHidden: true, takenAt: '2026-10-10T01:00:00Z' }
];

/** 응답을 정해 두고 그린다. person=p11 이면 두 폴더에 걸친 그 아이의 사진 2장 */
const renderPage = async ({ people = PEOPLE, media = MEDIA, missing = null, nextCursor = null, more = [], failMedia = false } = {}) => {
  const calls = { people: 0 };
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url === '/api/albums/people') { calls.people += 1; return ok({ people }); }
    if (failMedia && url.startsWith('/api/albums/media')) return ok({ error: '서버 오류가 발생했습니다.' }, 500);
    if (missing && url.includes(`person=${missing}`)) return ok({ items: [], nextCursor: null, personMissing: true });
    if (url.includes('person=p11')) return ok({ items: [MEDIA[0], MEDIA[1]], nextCursor: null });
    if (url.includes('cursorId=')) return ok({ items: more, nextCursor: null });
    if (url.startsWith('/api/albums/media?')) return ok({ items: media, nextCursor });
    if (options.method === 'PATCH') return ok({ id: 1, caption: JSON.parse(options.body).caption });
    return ok({});
  });
  await act(async () => { render(<MemoryRouter><AllPhotos /></MemoryRouter>); });
  return calls;
};
const mediaUrls = () => fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/albums/media?'));
const tiles = () => document.querySelectorAll('.ui-media-tile');

beforeEach(() => jest.clearAllMocks());

describe('AllPhotos — 전체 사진 (모든 폴더)', () => {
  it('모든 폴더의 사진을 한 칸 목록으로 — 숨긴 사진·학부모가 올린 사진 표시는 폴더 화면과 같다', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: '전체 사진' })).toBeInTheDocument();
    expect(mediaUrls()).toEqual(['/api/albums/media?limit=60']);
    expect(tiles()).toHaveLength(3);
    expect(screen.getByText('하은엄마')).toBeInTheDocument();
    expect(screen.getByText('숨김')).toBeInTheDocument();
  });

  it('뒤로 가면 사진 목록', async () => {
    await renderPage();
    // 사진 칸의 이름도 '사진' 이라 머리말의 뒤로 가기 버튼을 집어 고른다
    fireEvent.click(document.querySelector('.ui-page-header__back'));
    expect(mockNavigate).toHaveBeenCalledWith('/photos');
  });

  it('얼굴 목록(모든 폴더에 나온 사람) — 누르면 그 사람 사진만 모든 폴더에서, 다시 누르면 전체', async () => {
    await renderPage();

    const group = screen.getByRole('group', { name: '얼굴로 사진 찾기' });
    const grid = document.querySelector('.ui-media-grid');
    expect(group.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // 사진 칸보다 위

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });
    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&person=p11');
    expect(tiles()).toHaveLength(2);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });
    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(tiles()).toHaveLength(3);
  });

  it('[모든 사진] 을 누르면 고른 얼굴을 푼다', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '모든 사진' })); });

    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('얼굴을 길게 누르면(오른쪽 클릭) X — 누르면 모든 폴더에서 그 사람을 빼고(본 사진 수와 함께) 목록·사진을 다시 읽는다', async () => {
    const calls = await renderPage();
    const before = calls.people;
    const removeCalls = () => fetchWithAuth.mock.calls.filter(([, options]) => options?.method === 'DELETE');

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 목록에서 빼기' })); });

    expect(removeCalls()).toEqual([['/api/albums/people/p42?photoCount=1', { method: 'DELETE' }]]);
    expect(screen.getByText('얼굴을 목록에서 뺐어요 · 사진은 그대로 있어요')).toBeInTheDocument();
    expect(calls.people).toBeGreaterThan(before);
  });

  it('고른 사람을 빼면 고른 것을 풀고 전체 사진으로 돌아간다', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });
    expect(mediaUrls().at(-1)).toContain('person=p11');

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 목록에서 빼기' })); });

    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60');
  });

  it('[얼굴 빼기] 로 여러 얼굴을 골라 한 번에 — 모든 폴더에서 빼고(본 사진 수와 함께) 목록·사진을 다시 읽는다', async () => {
    const calls = await renderPage({ people: [{ ...PEOPLE[0], removable: false }, PEOPLE[1], { key: 'p57', photoCount: 4, cover }] });
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options = {}) => (
      url === '/api/albums/people/remove' ? ok({ removedPeople: 2, removedFaces: 5, photos: 5, removedTags: 0 }) : base(url, options)
    ));
    const before = calls.people;
    const bar = () => screen.getByRole('region', { name: '얼굴 빼기' });

    await act(async () => { fireEvent.click(within(bar()).getByRole('button', { name: '얼굴 빼기' })); });
    expect(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })).toBeDisabled();   // 등록된 아이는 고를 수 없다
    fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
    fireEvent.click(screen.getByRole('button', { name: '얼굴 3 · 사진 4장' }));
    fireEvent.click(within(bar()).getByRole('button', { name: '2개 빼기' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '빼기' })); });

    const removeCalls = fetchWithAuth.mock.calls.filter(([url]) => url === '/api/albums/people/remove');
    expect(removeCalls).toEqual([['/api/albums/people/remove', {
      method: 'POST', body: JSON.stringify({ people: [{ key: 'p42', photoCount: 1 }, { key: 'p57', photoCount: 4 }] })
    }]]);
    expect(screen.getByText('얼굴 2개를 목록에서 뺐어요 · 사진은 그대로 있어요')).toBeInTheDocument();
    expect(calls.people).toBeGreaterThan(before);
    expect(mediaUrls().length).toBeGreaterThan(1);   // 사진도 다시 읽었다
  });

  it('그 사이 묶음이 바뀌었으면(409 person_changed) 아무것도 안 지워졌다고 알리고 목록을 다시 읽는다 · 등록된 아이(removable: false)에는 X 가 없다', async () => {
    const calls = await renderPage({ people: [{ ...PEOPLE[0], removable: false }, PEOPLE[1]] });
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options = {}) => (
      options.method === 'DELETE' ? ok({ error: '얼굴 목록이 바뀌었어요.', reason: 'person_changed' }, 409) : base(url, options)
    ));

    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' }));
    expect(screen.queryByRole('button', { name: '얼굴 1 목록에서 빼기' })).not.toBeInTheDocument();

    const before = calls.people;
    fireEvent.contextMenu(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 목록에서 빼기' })); });

    expect(screen.getByText('얼굴 목록이 바뀌었어요. 다시 확인해 주세요.')).toBeInTheDocument();
    expect(calls.people).toBeGreaterThan(before);
  });

  it('고른 사람이 그 사이 사라졌으면 고른 것을 풀고 얼굴 목록을 다시 읽는다', async () => {
    const calls = await renderPage({ missing: 'p42' });
    const before = calls.people;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' })); });

    expect(calls.people).toBeGreaterThan(before);
    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(tiles()).toHaveLength(3);
  });

  it('얼굴을 빨리 바꿔 누르면 마지막 것만 — 늦게 온 앞 응답이 목록을 덮지 않는다', async () => {
    let releaseFirst;
    await renderPage();
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options) => {
      if (url.includes('person=p11')) return new Promise((resolve) => { releaseFirst = () => resolve(base(url, options)); });
      if (url.includes('person=p42')) return ok({ items: [MEDIA[2]], nextCursor: null });
      return base(url, options);
    });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' })); });
    await act(async () => { releaseFirst(); });

    expect(tiles()).toHaveLength(1);
  });

  it('사진을 열면 어느 폴더의 사진인지 보이고, 설명은 그 폴더의 주소로 저장한다 — 지우기·대표 사진 버튼은 없다', async () => {
    await renderPage();

    await act(async () => { fireEvent.click(tiles()[1]); });
    const viewer = screen.getByRole('dialog', { name: '사진 보기' });
    expect(within(viewer).getByTestId('media-album')).toHaveTextContent('회장배 대회');
    expect(within(viewer).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    expect(within(viewer).queryByRole('button', { name: /대표 사진/ })).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(within(viewer).getByRole('button', { name: '설명 추가' })); });
    const form = within(viewer).getByRole('form', { name: /설명/ });
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: '단체전 결승' } });
    await act(async () => { fireEvent.click(within(form).getByRole('button', { name: '저장' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/1', { method: 'PATCH', body: JSON.stringify({ caption: '단체전 결승' }) });
    expect(within(viewer).getByTestId('media-caption')).toHaveTextContent('단체전 결승');

    // 넘기면 다른 폴더의 사진 — 폴더 이름도 바뀐다
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
    expect(within(viewer).getByTestId('media-album')).toHaveTextContent('여름 합숙');
  });

  it('더 있으면 [더 보기] — 받은 커서로 이어 붙인다', async () => {
    const more = [{ ...MEDIA[0], id: 99, thumbnailUrl: 'https://t/99' }];
    await renderPage({ nextCursor: { takenAt: '2026-10-10T01:00:00Z', id: 3 }, more });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '더 보기' })); });

    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&cursorTakenAt=2026-10-10T01%3A00%3A00Z&cursorId=3');
    expect(tiles()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('얼굴을 바꿔 다시 읽는 동안에는 [더 보기] 가 없다 — 앞 목록의 커서를 새 얼굴에 쓰지 않는다', async () => {
    await renderPage({ nextCursor: { takenAt: '2026-10-10T01:00:00Z', id: 3 } });
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument();
    const base = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options) => (url.includes('person=p11') ? new Promise(() => {}) : base(url, options)));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });

    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('올린 사진이 하나도 없으면 안내하고 사진 목록으로 보낸다 — 얼굴 목록도 없다', async () => {
    await renderPage({ people: [], media: [] });

    expect(screen.getByText('아직 올린 사진이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '얼굴로 사진 찾기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '사진 목록으로' }));
    expect(mockNavigate).toHaveBeenCalledWith('/photos');
  });

  it('불러오지 못하면 서버의 안내를 보여 준다', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderPage({ failMedia: true });

    expect(screen.getByText('서버 오류가 발생했습니다.')).toBeInTheDocument();
    expect(screen.queryByText('아직 올린 사진이 없어요')).not.toBeInTheDocument();
  });
});

describe('AllPhotos — 고른 얼굴에서 잘못 묶인 사진 빼기 · 다시 넣기', () => {
  // 얼굴 1(p11) 은 사진 8·1, 전에 뺀 사진 3 이 하나 있다
  const FACES = [{ key: 'p11', photoCount: 2, removedCount: 1, cover }, { key: 'p42', photoCount: 1, removedCount: 0, cover }];

  const renderWithEdits = async ({ editResponse = () => ok({ removed: 1, key: 'p11' }), people = FACES, peopleAfter = people } = {}) => {
    const calls = { people: 0 };
    let edited = false;
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (options.method === 'POST' && url.startsWith('/api/albums/people/')) { edited = true; return editResponse(url, JSON.parse(options.body)); }
      if (url === '/api/albums/people') { calls.people += 1; return ok({ people: edited ? peopleAfter : people }); }
      if (url.includes('removed=1')) return ok({ items: [MEDIA[2]], nextCursor: null });
      if (url.includes('person=p11') || url.includes('person=p12')) return ok({ items: [MEDIA[0], MEDIA[1]], nextCursor: null });
      if (url.startsWith('/api/albums/media?')) return ok({ items: MEDIA, nextCursor: null });
      return ok({});
    });
    await act(async () => { render(<MemoryRouter><AllPhotos /></MemoryRouter>); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });
    return calls;
  };
  const editCalls = () => fetchWithAuth.mock.calls.filter(([, options]) => options?.method === 'POST');

  it('얼굴을 고르기 전에는 고르기·빼기가 없고, 고르면 [이 얼굴 사진 2] [뺀 사진 1] 과 [고르기]', async () => {
    fetchWithAuth.mockImplementation((url) => (url === '/api/albums/people' ? ok({ people: FACES }) : ok({ items: MEDIA, nextCursor: null })));
    await act(async () => { render(<MemoryRouter><AllPhotos /></MemoryRouter>); });
    expect(screen.queryByRole('button', { name: '고르기' })).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 1 · 사진 2장' })); });

    const bar = screen.getByRole('toolbar', { name: '고른 얼굴의 사진' });
    expect(within(bar).getByRole('button', { name: /이 얼굴 사진/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar).getByRole('button', { name: /뺀 사진/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: '고르기' })).toBeEnabled();
    expect(screen.getByText(/다른 사람 사진이 섞여 있으면/)).toBeInTheDocument();
  });

  it('[고르기] → 한 장 → [이 얼굴에서 빼기] 는 그 얼굴에서만 빼고(사진은 그대로) 목록·얼굴을 다시 읽는다', async () => {
    const calls = await renderWithEdits();
    const before = calls.people;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(tiles()[0]); });
    expect(screen.getByText('1장 골랐어요')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이 얼굴에서 빼기' })); });

    expect(editCalls()).toEqual([['/api/albums/people/p11/exclude', { method: 'POST', body: JSON.stringify({ mediaIds: [8] }) }]]);
    expect(screen.getByText('1장을 이 얼굴에서 뺐어요 · 사진은 그대로 있어요')).toBeInTheDocument();
    expect(calls.people).toBeGreaterThan(before);
    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&person=p11');
    expect(screen.queryByRole('button', { name: '이 얼굴에서 빼기' })).not.toBeInTheDocument();   // 고르기를 마쳤다
  });

  it('얼굴의 key 가 바뀌면(가장 작은 얼굴을 뺐다) 새 key 로 계속 본다', async () => {
    await renderWithEdits({
      editResponse: () => ok({ removed: 1, key: 'p12' }),
      peopleAfter: [{ key: 'p12', photoCount: 1, removedCount: 1, cover }, { key: 'p11', photoCount: 1, removedCount: 0, cover }]
    });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(tiles()[0]); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이 얼굴에서 빼기' })); });

    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&person=p12');
  });

  it('그 얼굴의 사진을 다 고르면 [이 얼굴에서 빼기] 가 잠긴다 — 얼굴이 없어진다', async () => {
    await renderWithEdits();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '모두 고르기' })); });

    const button = screen.getByRole('button', { name: '이 얼굴에서 빼기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', '이 얼굴의 사진을 모두 뺄 수는 없어요');
  });

  it('[뺀 사진] 에서 골라 [이 얼굴에 다시 넣기]', async () => {
    await renderWithEdits({ editResponse: () => ok({ restored: 1, key: 'p11' }) });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /뺀 사진/ })); });
    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&person=p11&removed=1');
    expect(tiles()).toHaveLength(1);
    expect(screen.getByText(/뺀 사진이에요/)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(tiles()[0]); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이 얼굴에 다시 넣기' })); });

    expect(editCalls()).toEqual([['/api/albums/people/p11/restore', { method: 'POST', body: JSON.stringify({ mediaIds: [3] }) }]]);
    expect(screen.getByText('1장을 이 얼굴에 다시 넣었어요')).toBeInTheDocument();
  });

  it('다른 얼굴을 고르면 뺀 사진 보기와 고르던 것이 풀린다', async () => {
    await renderWithEdits();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /뺀 사진/ })); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 1장' })); });

    expect(mediaUrls().at(-1)).toBe('/api/albums/media?limit=60&person=p42');
  });

  it('그 사이 묶음이 바뀌었으면(409 person_changed) 서버의 안내를 보이고 얼굴 목록을 다시 읽는다', async () => {
    const calls = await renderWithEdits({
      editResponse: () => ok({ error: '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.', reason: 'person_changed' }, 409)
    });
    const before = calls.people;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '고르기' })); });
    await act(async () => { fireEvent.click(tiles()[0]); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이 얼굴에서 빼기' })); });

    expect(screen.getByText('얼굴 목록이 바뀌었어요. 다시 확인해 주세요.')).toBeInTheDocument();
    expect(calls.people).toBeGreaterThan(before);
    expect(screen.getByRole('button', { name: '이 얼굴에서 빼기' })).toBeInTheDocument();   // 고른 것은 그대로
  });
});
