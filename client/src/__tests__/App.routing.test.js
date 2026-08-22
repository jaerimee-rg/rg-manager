import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mockAuth = { user: null, loading: true, logout: jest.fn() };
jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth
}));

jest.mock('../utils/api', () => ({
  fetchWithAuth: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  API_BASE_URL: ''
}));

jest.mock('../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import App from '../App';

const ADMIN = { id: 1, username: 'admin', role: 'admin' };

// 현재 주소를 노출해 리다이렉트 여부를 확인한다.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>
  );

const currentPath = () => screen.getByTestId('path').textContent;

describe('App 라우팅 — 딥링크 유지', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    );
    mockAuth.user = null;
    mockAuth.loading = true;
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('토큰 확인 중에는 주소를 바꾸지 않는다', async () => {
    renderAt('/admin/users');

    // 예전에는 이 시점에 "*" 가 /login 으로 보내버려 딥링크가 사라졌다.
    expect(currentPath()).toBe('/admin/users');
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('확인이 끝나고 로그인 상태면 요청한 관리자 화면을 그대로 연다', async () => {
    mockAuth.user = ADMIN;
    mockAuth.loading = false;

    renderAt('/admin/users');

    expect(currentPath()).toBe('/admin/users');
    await waitFor(() => expect(screen.getByText('사용자 관리')).toBeInTheDocument());
  });

  it('일반 화면 딥링크도 유지된다', async () => {
    mockAuth.user = ADMIN;
    mockAuth.loading = false;

    renderAt('/students');

    expect(currentPath()).toBe('/students');
  });

  it('확인이 끝났는데 비로그인이면 로그인 화면으로 보낸다', async () => {
    mockAuth.user = null;
    mockAuth.loading = false;

    renderAt('/admin/users');

    await waitFor(() => expect(currentPath()).toBe('/login'));
  });

  it('학부모 공개 채팅은 인증 확인을 기다리지 않는다', async () => {
    mockAuth.user = null;
    mockAuth.loading = true;

    renderAt('/chat/abc123');

    expect(currentPath()).toBe('/chat/abc123');
    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
  });
});
