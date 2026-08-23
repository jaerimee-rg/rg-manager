import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

import { fetchWithAuth } from '../../../utils/api';
import DriveAccountCard from '../DriveAccountCard';

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

const respondWith = (account, extra = {}) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    const method = options.method || 'GET';
    if (url === '/api/drive/account' && method === 'GET') return ok(account);
    if (url === '/api/drive/account' && method === 'PATCH') {
      return ok({ connected: true, rootFolderName: JSON.parse(options.body).rootFolderName });
    }
    if (url === '/api/drive/account' && method === 'DELETE') return ok({ message: 'ok' });
    if (url === '/api/drive/connect') return ok({ url: 'https://accounts.google.com/o/oauth2/v2/auth' });
    return ok(extra);
  });
};

const CONNECTED = {
  configured: true,
  connected: true,
  email: 'jaerim.rg@gmail.com',
  rootFolderName: 'RG Manager',
  status: 'connected',
  lastError: null,
  quota: { limit: 15 * 1024 * 1024 * 1024, usage: 4 * 1024 * 1024 * 1024, remaining: 11 * 1024 * 1024 * 1024 }
};

const renderCard = async () => {
  await act(async () => {
    render(<DriveAccountCard />);
  });
};

describe('DriveAccountCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/settings');
  });

  it('연동이 설정되지 않았으면 관리자 안내만 보여주고 연결 버튼은 없다', async () => {
    respondWith({ connected: false, configured: false });
    await renderCard();

    expect(screen.getByText(/관리자/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google 계정 연결하기/ })).not.toBeInTheDocument();
  });

  it('연결 전에는 Google 계정 연결하기 버튼을 보여준다', async () => {
    respondWith({ connected: false, configured: true });
    await renderCard();

    expect(screen.getByRole('button', { name: /Google 계정 연결하기/ })).toBeInTheDocument();
    expect(screen.queryByText('연결 해제')).not.toBeInTheDocument();
  });

  it('연결되면 계정 이메일 · 연결됨 배지 · 사용량을 보여준다', async () => {
    respondWith(CONNECTED);
    await renderCard();

    expect(screen.getByText('jaerim.rg@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('연결됨')).toBeInTheDocument();
    expect(screen.getByText('4.0GB / 15.0GB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Drive 사용량' })).toHaveAttribute('aria-valuenow', '27');
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeInTheDocument();
  });

  it('용량이 85% 를 넘으면 경고를 보여준다', async () => {
    respondWith({
      ...CONNECTED,
      quota: { limit: 15 * 1024 * 1024 * 1024, usage: 14.6 * 1024 * 1024 * 1024, remaining: 0.4 * 1024 * 1024 * 1024 }
    });
    await renderCard();

    expect(screen.getByText(/용량이 거의 찼습니다/)).toBeInTheDocument();
  });

  it('연결 오류면 다시 연결 버튼이 있는 빨간 안내를 보여준다', async () => {
    respondWith({ ...CONNECTED, status: 'error', lastError: 'invalid_grant' });
    await renderCard();

    expect(screen.getByRole('alert')).toHaveTextContent('Google Drive 연결이 끊어졌어요');
    expect(screen.getByRole('button', { name: '다시 연결' })).toBeInTheDocument();
    expect(screen.getByText('연결 오류')).toBeInTheDocument();
  });

  it('루트 폴더 이름을 바꾸면 PATCH 로 보낸다', async () => {
    respondWith(CONNECTED);
    await renderCard();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이름 변경' }));
    });
    fireEvent.change(screen.getByLabelText('루트 폴더 이름'), { target: { value: '리듬체조 앨범' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/drive/account', {
      method: 'PATCH',
      body: JSON.stringify({ rootFolderName: '리듬체조 앨범' })
    });
    expect(screen.getByText('리듬체조 앨범')).toBeInTheDocument();
  });

  it('연결 콜백 결과를 한 줄로 알려주고 주소에서 지운다', async () => {
    respondWith(CONNECTED);
    window.history.replaceState({}, '', '/settings?drive=connected&tab=1');

    await renderCard();

    expect(screen.getByText('Google 계정을 연결했습니다.')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=1');
  });

  it('알 수 없는 콜백 결과는 실패 안내로 보여준다', async () => {
    respondWith({ connected: false, configured: true });
    window.history.replaceState({}, '', '/settings?drive=denied');

    await renderCard();

    expect(screen.getByText('Google 계정 연결을 취소했습니다.')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('조회에 실패하면 안내만 보여주고 깨지지 않는다', async () => {
    fetchWithAuth.mockImplementation(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    await renderCard();

    expect(screen.getByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });
});
