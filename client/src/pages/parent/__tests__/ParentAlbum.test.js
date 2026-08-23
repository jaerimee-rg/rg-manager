import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn(), detectSingleFace: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
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

const renderAlbum = async () => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/parent/photos/3']}>
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
