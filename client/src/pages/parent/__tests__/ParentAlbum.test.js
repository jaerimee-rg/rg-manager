import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/copyToClipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn(), detectSingleFace: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import ParentAlbum from '../ParentAlbum';

const media = (overrides = {}) => ({
  id: 1,
  kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w400',
  largeUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w1600',
  originalUrl: 'https://drive.google.com/file/d/f1/view',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=f1',
  previewUrl: null,
  fileName: 'IMG_1.jpg',
  takenAt: '2026-09-12T10:24:00',
  uploader: 'teacher',
  canDelete: false,
  myTags: [],
  ...overrides
});

const payload = (overrides = {}) => ({
  event: { id: 3, title: '서울시 대회', date: '2026-09-12', uploadOpen: true, albumStatus: 'ready' },
  children: [{ studentId: 5, name: '김하은' }],
  items: [media({ id: 1 }), media({ id: 2, kind: 'video', durationMs: 64000 })],
  candidates: [],
  nextCursor: null,
  ...overrides
});

const jsonResponse = (data, { ok = true, status = 200 } = {}) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(data) });

const renderAlbum = async (entry = '/parent/photos/3') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/parent/photos/:eventId" element={<ParentAlbum />} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
});

describe('ParentAlbum', () => {
  it('앨범을 열면 사진이 갤러리로 보인다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum();

    expect(screen.getByText('서울시 대회')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
  });

  it('우리 아이 사진만 보기를 켜면 mine=1 로 다시 불러온다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    const urls = fetchWithAuth.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes('mine=1'))).toBe(true);
  });

  it('영상 칩을 누르면 영상만 남는다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /영상 1/ }));
    });

    expect(screen.getAllByRole('button', { name: '영상 열기' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '사진 열기' })).not.toBeInTheDocument();
  });

  it('사진을 누르면 뷰어가 열리고 저장 버튼이 원본 주소를 가리킨다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });

    const viewer = screen.getByRole('dialog', { name: '사진 보기' });
    expect(viewer).toBeInTheDocument();
    const save = screen.getByRole('link', { name: /저장/ });
    expect(save).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=f1');
  });

  it('내가 올린 사진에만 삭제가 보인다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({
      items: [media({ id: 1, uploader: 'me', canDelete: true })]
    })));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });

    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('미확정이면 안내 화면을 보여준다', async () => {
    fetchWithAuth.mockImplementation(() =>
      jsonResponse({ error: '자녀가 확정된 이벤트의 사진만 볼 수 있어요.', reason: 'not_confirmed' }, { ok: false, status: 403 }));

    await renderAlbum();

    expect(screen.getByText('아직 사진을 볼 수 없어요')).toBeInTheDocument();
    expect(screen.getByText(/확정된 이벤트의 사진만/)).toBeInTheDocument();
  });

  it('선생님이 공개하지 않은 앨범이면 기다려 달라는 안내 (docs/photo-menu FR-541)', async () => {
    fetchWithAuth.mockImplementation(() =>
      jsonResponse({ error: '선생님이 아직 공개하지 않은 앨범이에요.', reason: 'album_private' }, { ok: false, status: 403 }));

    await renderAlbum();

    expect(screen.getByText('선생님이 아직 공개하지 않은 앨범이에요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 목록으로' })).toBeInTheDocument();
    expect(screen.queryByText(/신청 후 선생님이 확정하면/)).not.toBeInTheDocument();
  });

  it('이벤트 상세에서 누른 사진(?open=)은 바로 크게 열린다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum('/parent/photos/3?open=2');

    expect(screen.getByRole('dialog', { name: '사진 보기' })).toBeInTheDocument();
  });

  it('업로드가 마감이면 올리기 버튼이 잠긴다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({
      event: { id: 3, title: '서울시 대회', date: '2026-09-12', uploadOpen: false }
    })));

    await renderAlbum();

    expect(screen.getByRole('button', { name: '업로드 마감' })).toBeDisabled();
  });

  it('혹시 우리 아이? 후보에서 맞아요를 누르면 확인을 보낸다', async () => {
    fetchWithAuth.mockImplementation((url, options) => {
      if (options?.method === 'POST') return jsonResponse({ tag: { studentId: 5, source: 'parent_confirmed' } });
      return jsonResponse(payload({
        items: [],
        candidates: [media({ id: 9, myTags: [{ studentId: 5, name: '김하은', source: 'candidate' }] })]
      }));
    });

    await renderAlbum();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    expect(screen.getByText(/혹시 우리 아이/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '맞아요' }));
    });

    const call = fetchWithAuth.mock.calls.find(([url]) => url.includes('/confirm'));
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).toEqual({ studentId: 5, confirmed: true });
  });

  it('우리 아이만 켰는데 찾은 사진이 없으면 얼굴 등록을 안내한다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ items: [], candidates: [] })));

    await renderAlbum();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    expect(screen.getByRole('button', { name: /얼굴 사진 등록하러 가기/ })).toBeInTheDocument();
  });
});

describe('ParentAlbum — 공유 링크의 초대 (docs/photo-menu FR-518)', () => {
  const notFound = () => jsonResponse({ error: '이벤트를 찾을 수 없습니다.' }, { ok: false, status: 404 });

  it('이 선생님과 아직 연결되지 않아 404 면 링크의 초대로 연결한 뒤 다시 읽는다', async () => {
    let linked = false;
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (url === '/api/parent/teachers') { linked = true; return jsonResponse({ teachers: [], alreadyLinked: false }, { status: 201 }); }
      if (url.startsWith('/api/parent/events/3/media')) return linked ? jsonResponse(payload()) : notFound();
      return jsonResponse({});
    });

    await renderAlbum('/parent/photos/3?invite=tok');

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/teachers', { method: 'POST', body: JSON.stringify({ invite: 'tok' }) });
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
    expect(screen.queryByText(/사진을 불러오지 못했어요/)).not.toBeInTheDocument();
  });

  it('이미 연결된 학부모에게는 초대를 쓰지 않는다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum('/parent/photos/3?invite=tok');

    expect(fetchWithAuth.mock.calls.some(([url]) => url === '/api/parent/teachers')).toBe(false);
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
  });

  it('초대가 죽었으면 한 번만 시도하고 못 불러왔다고 알린다', async () => {
    fetchWithAuth.mockImplementation((url) => {
      if (url === '/api/parent/teachers') return jsonResponse({ error: '유효하지 않은 초대 링크입니다.' }, { ok: false, status: 400 });
      return notFound();
    });

    await renderAlbum('/parent/photos/3?invite=gone');

    expect(fetchWithAuth.mock.calls.filter(([url]) => url === '/api/parent/teachers')).toHaveLength(1);
    expect(fetchWithAuth.mock.calls.filter(([url]) => url.startsWith('/api/parent/events/3/media'))).toHaveLength(1);
    expect(screen.getByText(/사진을 불러오지 못했어요/)).toBeInTheDocument();
  });

  it('초대 없이 404 면 연결을 시도하지 않는다', async () => {
    fetchWithAuth.mockImplementation(() => notFound());

    await renderAlbum('/parent/photos/3');

    expect(fetchWithAuth.mock.calls.some(([url]) => url === '/api/parent/teachers')).toBe(false);
  });
});

describe('ParentAlbum — 학부모도 공유 링크를 복사한다 (docs/photo-menu FR-518)', () => {
  it('오른쪽 위 링크 아이콘을 누르면 선생님 것과 같은 공유 주소를 복사하고 알린다', async () => {
    copyToClipboard.mockResolvedValue(true);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ sharePath: '/parent/photos/3?invite=inv-tok' })));
    await renderAlbum();

    const button = screen.getByRole('button', { name: '공유 링크 복사' });
    expect(button.closest('.ui-mobile-app__head-action')).not.toBeNull();   // 제목 줄 오른쪽 끝
    await act(async () => { fireEvent.click(button); });

    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/photos/3?invite=inv-tok`);
    expect(screen.getByText(/공유 링크를 복사했어요/)).toBeInTheDocument();
  });

  it('서버가 공유 주소를 주지 않아도(옛 서버) 앨범 주소를 복사한다', async () => {
    copyToClipboard.mockResolvedValue(true);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유 링크 복사' })); });

    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/photos/3`);
  });

  it('복사가 막힌 브라우저에서는 주소를 그대로 보여 준다', async () => {
    copyToClipboard.mockResolvedValue(false);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ sharePath: '/parent/photos/3?invite=inv-tok' })));
    await renderAlbum();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유 링크 복사' })); });

    expect(screen.getByText(`${window.location.origin}/parent/photos/3?invite=inv-tok`)).toBeInTheDocument();
  });

  it('볼 수 없는 앨범(미확정 · 비공개)에는 공유 아이콘이 없다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse({ error: '아직 볼 수 없어요', reason: 'not_confirmed' }, { ok: false, status: 403 }));
    await renderAlbum();

    expect(screen.queryByRole('button', { name: '공유 링크 복사' })).not.toBeInTheDocument();
  });
});
