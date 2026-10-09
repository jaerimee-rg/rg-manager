import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import ParentAlbumList from '../ParentAlbumList';

const album = (overrides = {}) => ({
  eventId: 33,
  title: '선생님이랑 브런치',
  type: 'special',
  date: '2026-10-05',
  location: '서초중앙로14 더화이트베일 웨딩홀 정문 공터',
  uploadOpen: true,
  albumStatus: 'ready',
  counts: { images: 1, videos: 19, mine: 0 },
  previews: [1, 2, 3, 4, 5].map((n) => `https://drive.google.com/thumbnail?id=v${n}&sz=w400`),
  ...overrides
});

const renderList = async (items) => {
  fetchWithAuth.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ items }) });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/parent/photos']}>
        <Routes>
          <Route path="/parent/photos" element={<ParentAlbumList />} />
          <Route path="/parent/photos/:eventId" element={<div>앨범 화면</div>} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => jest.clearAllMocks());

describe('ParentAlbumList — 앨범 카드', () => {
  it('미리보기 줄은 행 높이를 묶고 넘침을 잘라, 세로 썸네일이 아래 글자를 덮지 않는다', async () => {
    await renderList([album()]);

    const strip = screen.getByTestId('album-previews');
    // 줄 높이를 이미지가 정하게 두면 세로 썸네일이 행을 늘려 제목·날짜 위로 넘친다
    expect(strip.style.gridTemplateRows).toBe('minmax(0, 1fr)');
    expect(strip.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(strip.style.overflow).toBe('hidden');
    expect(strip.style.height).toBe('');
  });

  it('썸네일은 최대 4장, 그 아래에 배지·제목·날짜·장소·개수가 보인다', async () => {
    await renderList([album()]);

    const card = screen.getByRole('button', { name: /선생님이랑 브런치/ });
    expect(screen.getByTestId('album-previews').querySelectorAll('img')).toHaveLength(4);
    expect(within(card).getByText('⭐ 스페셜')).toBeInTheDocument();
    expect(within(card).getByText('사진 올릴 수 있어요')).toBeInTheDocument();
    expect(within(card).getByText(/2026-10-05/)).toBeInTheDocument();
    expect(within(card).getByText(/더화이트베일/)).toBeInTheDocument();
    expect(within(card).getByText('우리 아이 사진 없음')).toBeInTheDocument();
  });

  it('이벤트 없이 만든 사진 폴더는 "사진" 배지로 보인다 — 스페셜로 보이지 않는다 (photo-menu FR-517)', async () => {
    await renderList([album({ type: 'folder', title: '가을 소풍', location: null })]);

    const card = screen.getByRole('button', { name: /가을 소풍/ });
    expect(within(card).getByText('📁 사진')).toBeInTheDocument();
    expect(within(card).queryByText('⭐ 스페셜')).not.toBeInTheDocument();
  });

  it('미리보기가 없어도 줄 자리는 남고, 카드를 누르면 그 앨범으로 간다', async () => {
    await renderList([album({ previews: [] })]);

    expect(screen.getByTestId('album-previews').querySelectorAll('img')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /선생님이랑 브런치/ }));
    expect(screen.getByText('앨범 화면')).toBeInTheDocument();
  });
});

describe('ParentAlbumList — 선생님이 고른 대표 사진', () => {
  it('대표 사진이 있으면 그것만 보인다 — 최근 사진 줄 대신 선생님 목록과 같은 표지', async () => {
    const covers = ['https://lh3/c2', 'https://lh3/c1'];
    await renderList([album({ covers })]);

    const card = screen.getByRole('button', { name: /선생님이랑 브런치/ });
    const cover = within(card).getByTestId('album-covers');
    expect(cover).toHaveClass('ui-album-card__cover');
    expect(cover).toHaveAttribute('data-covers', '2');
    expect([...cover.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual(covers);
    expect(within(card).queryByTestId('album-previews')).not.toBeInTheDocument();
    // 아래 글자는 그대로
    expect(within(card).getByText('⭐ 스페셜')).toBeInTheDocument();
  });

  it('선생님이 고른 보일 부분을 그대로 — 선생님 목록과 같은 표지', async () => {
    await renderList([album({ covers: ['https://lh3/c1', 'https://lh3/c2'], coverPositions: [null, '30% 0%'] })]);

    const images = screen.getByTestId('album-covers').querySelectorAll('img');
    expect(images[0].style.objectPosition).toBe('');
    expect(images[1].style.objectPosition).toBe('30% 0%');
  });

  it('한 장이면 표지를 꽉 채운다', async () => {
    await renderList([album({ covers: ['https://lh3/c1=w800-h500-c-rw'] })]);

    const cover = screen.getByTestId('album-covers');
    expect(cover).toHaveAttribute('data-covers', '1');
    expect(cover.querySelectorAll('img')).toHaveLength(1);
  });

  it('대표 사진이 없으면(빈 목록 · 옛 응답) 최근 사진 줄', async () => {
    await renderList([album({ covers: [] }), album({ eventId: 34, title: '옛 응답' })]);

    expect(screen.queryByTestId('album-covers')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('album-previews')).toHaveLength(2);
  });
});
