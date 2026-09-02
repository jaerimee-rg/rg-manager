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

import { fetchWithAuth } from '../utils/api';

jest.mock('../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import App from '../App';
import { peekReturnTo } from '../utils/returnTo';

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
    localStorage.clear();
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

  it('비로그인 상태로 공유 링크를 열면 그 주소를 남기고 로그인으로 보낸다', async () => {
    mockAuth.user = null;
    mockAuth.loading = false;

    renderAt('/parent/events/12?from=kakao');

    await waitFor(() => expect(currentPath()).toBe('/login'));
    expect(peekReturnTo()).toBe('/parent/events/12?from=kakao');
  });

  it('로그인 화면 자체는 돌아갈 곳으로 남기지 않는다', async () => {
    mockAuth.user = null;
    mockAuth.loading = false;

    renderAt('/login');

    expect(currentPath()).toBe('/login');
    expect(peekReturnTo()).toBeNull();
  });

  it('학부모 공개 채팅은 인증 확인을 기다리지 않는다', async () => {
    mockAuth.user = null;
    mockAuth.loading = true;

    renderAt('/chat/abc123');

    expect(currentPath()).toBe('/chat/abc123');
    expect(screen.queryByText('로딩 중...')).not.toBeInTheDocument();
  });

  it('비로그인 상태에서 초대 링크는 로그인으로 튕기지 않는다', async () => {
    mockAuth.user = null;
    mockAuth.loading = false;

    renderAt('/invite/tok123');

    await waitFor(() => expect(currentPath()).toBe('/invite/tok123'));
  });

  it('옛 대회 목록 주소는 이벤트 관리로 보낸다', async () => {
    mockAuth.user = ADMIN;
    mockAuth.loading = false;

    renderAt('/competitions');

    await waitFor(() => expect(currentPath()).toBe('/events'));
  });

  it('대회 하위 화면 주소는 살아 있고, 대상 없이 열면 이벤트 목록으로 돌아간다', async () => {
    mockAuth.user = ADMIN;
    mockAuth.loading = false;

    // 참가 학생 관리는 어떤 대회인지 함께 넘겨받아야 열 수 있다.
    // 주소만 치고 들어오면 예전처럼 목록으로 돌려보내는데, 그 목록이 이제 이벤트 관리다.
    renderAt('/competitions/manage');

    await waitFor(() => expect(currentPath()).toBe('/events'));
  });
});

describe('App 라우팅 — 역할 분리', () => {
  const PARENT = { id: 20, username: '민서엄마', role: 'parent' };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockAuth.loading = false;
    // 학부모 앱은 진입 시 자기 정보를 먼저 읽는다 (아이가 있으면 온보딩을 건너뛴다)
    fetchWithAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: PARENT,
        teacher: { name: '이재림' },
        children: [{ id: 1, childName: '김민서', status: 'linked', studentId: 100 }]
      })
    });
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
    );
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('학부모가 선생님 화면 주소로 들어오면 일정으로 보낸다', async () => {
    mockAuth.user = PARENT;

    renderAt('/students');

    await waitFor(() => expect(currentPath()).toBe('/parent/schedule'));
  });

  it('학부모는 자기 화면 주소를 그대로 연다', async () => {
    mockAuth.user = PARENT;

    renderAt('/parent/settings');

    await waitFor(() => expect(currentPath()).toBe('/parent/settings'));
  });

  it('아이를 아직 등록하지 않았으면 온보딩으로 보낸다', async () => {
    mockAuth.user = PARENT;
    fetchWithAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: PARENT, teacher: { name: '이재림' }, children: [] })
    });

    renderAt('/parent/schedule');

    await waitFor(() => expect(currentPath()).toBe('/parent/onboarding'));
  });

  it('선생님이 학부모 화면 주소로 들어오면 대시보드로 보낸다', async () => {
    mockAuth.user = ADMIN;

    renderAt('/parent/schedule');

    await waitFor(() => expect(currentPath()).toBe('/'));
  });

  it('로그인한 학부모가 공유 링크를 열면 그 주소가 그대로 열린다', async () => {
    mockAuth.user = PARENT;

    renderAt('/parent/events/12');

    await waitFor(() => expect(currentPath()).toBe('/parent/events/12'));
    // 로그인돼 있으니 돌아갈 곳을 남길 일도 없다
    expect(peekReturnTo()).toBeNull();
  });

  it('아이 등록 전 학부모가 공유 링크를 열면 주소를 남기고 온보딩으로 보낸다', async () => {
    mockAuth.user = PARENT;
    fetchWithAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: PARENT, teacher: { name: '이재림' }, children: [] })
    });

    renderAt('/parent/events/12');

    await waitFor(() => expect(currentPath()).toBe('/parent/onboarding'));
    expect(peekReturnTo()).toBe('/parent/events/12');
  });
});
