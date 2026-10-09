import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import AdminPhotoViewLogs from '../AdminPhotoViewLogs';

const ok = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const row = (overrides = {}) => ({
  id: 1, kind: 'media', createdAt: '2026-10-09T01:05:00.000Z', viewerName: '예림엄마', teacherName: '이재림',
  eventId: 3, eventTitle: '회장배 대회', eventDate: '2026-10-12', mediaId: 41, mediaKind: 'image', fileName: 'IMG_1.jpg',
  mediaDeleted: false, thumbnailUrl: 'https://lh3/d41', ...overrides
});

describe('AdminPhotoViewLogs — 관리자 사진 보기 로그', () => {
  beforeEach(() => jest.clearAllMocks());

  it('누가 · 어느 선생님 · 어느 앨범 · 무엇을 · 언제(한국 시각) 봤는지', async () => {
    fetchWithAuth.mockImplementation(() => ok({ total: 3, items: [row(), row({ id: 2, kind: 'album', mediaId: null }), row({ id: 3, mediaId: null, mediaDeleted: true, thumbnailUrl: null })] }));
    await act(async () => { render(<AdminPhotoViewLogs />); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/logs/photo-views?limit=50&offset=0');
    expect(screen.getAllByText('예림엄마').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-10-12 회장배 대회').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IMG_1.jpg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('앨범 열기').length).toBeGreaterThan(1);   // 칩 + 칸
    expect(screen.getAllByText('(지운 사진)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026\. 10\. 09\.? (오전|AM) 10:05/).length).toBeGreaterThan(0);
    expect(screen.getByText(/모두 3건/)).toBeInTheDocument();
  });

  it('칩으로 거르면 그 종류만 다시 읽는다 · 더 있으면 [더 보기] 로 이어서', async () => {
    fetchWithAuth.mockImplementation(() => ok({ total: 120, items: Array.from({ length: 50 }, (_, i) => row({ id: i + 1 })) }));
    await act(async () => { render(<AdminPhotoViewLogs />); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 보기' })); });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/logs/photo-views?limit=50&offset=0&kind=media');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '더 보기' })); });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/logs/photo-views?limit=50&offset=50&kind=media');
  });

  it('안 되면 이유를 알린다', async () => {
    fetchWithAuth.mockImplementation(() => ok({ error: '관리자만 볼 수 있습니다.' }, 403));
    await act(async () => { render(<AdminPhotoViewLogs />); });
    expect(screen.getByRole('alert')).toHaveTextContent('관리자만 볼 수 있습니다.');
  });
});
