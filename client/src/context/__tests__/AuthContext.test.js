import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../utils/api';
import { AuthProvider, useAuth } from '../AuthContext';

const ADMIN = { id: 1, username: 'admin', role: 'admin' };
const TEACHER = { id: 9, username: '이재림', role: 'user' };
const ACTOR = { id: 1, username: 'admin', token: 'admin-token', user: ADMIN };

// 컨텍스트 값을 화면에 그대로 뿌려 상태를 읽는다
function Probe() {
  const { user, impersonator, impersonate, stopImpersonating, logout } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? `${user.id}:${user.username}` : '-'}</div>
      <div data-testid="impersonator">
        {impersonator ? `${impersonator.username}:${impersonator.token ? 'token' : 'no-token'}` : '-'}
      </div>
      <button onClick={() => impersonate(9).catch(() => {})}>impersonate</button>
      <button onClick={() => stopImpersonating()}>stop</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

const jsonResponse = (data, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 401, json: () => Promise.resolve(data) });

const renderProvider = async () => {
  await act(async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
};

const seedSession = (user, token) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

const clearCookies = () => {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  });
};

describe('AuthContext — 다른 계정으로 로그인 (FR-388)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    clearCookies(); // getToken 은 cookie 에서도 복구하므로 같이 비운다
    global.fetch = jest.fn(() => jsonResponse({ user: ADMIN }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('들어가면 관리자 세션을 챙겨 두고 대상 세션으로 바꾼다 (마지막 역할은 그대로)', async () => {
    seedSession(ADMIN, 'admin-token');
    localStorage.setItem('lastRole', 'admin');
    fetchWithAuth.mockResolvedValue(
      jsonResponse({ user: TEACHER, token: 'teacher-token', role: 'user', impersonator: { id: 1, username: 'admin' } })
    );

    await renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByText('impersonate'));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/auth/users/9/impersonate', { method: 'POST' });
    expect(screen.getByTestId('user')).toHaveTextContent('9:이재림');
    expect(screen.getByTestId('impersonator')).toHaveTextContent('admin:token');
    expect(localStorage.getItem('token')).toBe('teacher-token');
    expect(JSON.parse(localStorage.getItem('impersonator'))).toMatchObject(ACTOR);
    // 다음 카카오 로그인 힌트는 더럽히지 않는다
    expect(localStorage.getItem('lastRole')).toBe('admin');
  });

  it('서버가 거절하면 세션을 바꾸지 않는다', async () => {
    seedSession(ADMIN, 'admin-token');
    fetchWithAuth.mockResolvedValue(jsonResponse({ error: '지금 로그인한 계정입니다.' }, false));

    await renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByText('impersonate'));
    });

    expect(screen.getByTestId('user')).toHaveTextContent('1:admin');
    expect(localStorage.getItem('token')).toBe('admin-token');
    expect(localStorage.getItem('impersonator')).toBeNull();
  });

  it('돌아가면 관리자 세션을 복구하고 확인 요청은 관리자 토큰으로 보낸다', async () => {
    seedSession(TEACHER, 'teacher-token');
    localStorage.setItem('impersonator', JSON.stringify(ACTOR));
    global.fetch = jest.fn(() => jsonResponse({ user: TEACHER, impersonatedBy: { id: 1, username: 'admin' } }));

    await renderProvider();
    expect(screen.getByTestId('impersonator')).toHaveTextContent('admin:token');

    global.fetch = jest.fn(() => jsonResponse({ user: { ...ADMIN, username: '관리자' } }));
    await act(async () => {
      fireEvent.click(screen.getByText('stop'));
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/verify', {
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(screen.getByTestId('user')).toHaveTextContent('1:관리자');
    expect(screen.getByTestId('impersonator')).toHaveTextContent('-');
    expect(localStorage.getItem('token')).toBe('admin-token');
    expect(localStorage.getItem('impersonator')).toBeNull();
  });

  it('돌아갈 관리자 토큰마저 끝났으면 로그아웃한다', async () => {
    seedSession(TEACHER, 'teacher-token');
    localStorage.setItem('impersonator', JSON.stringify({ ...ACTOR, token: 'old-admin-token' }));
    global.fetch = jest.fn(() => jsonResponse({ user: TEACHER, impersonatedBy: { id: 1, username: 'admin' } }));

    await renderProvider();
    global.fetch = jest.fn(() => jsonResponse({ error: 'expired', tokenExpired: true }, false));
    await act(async () => {
      fireEvent.click(screen.getByText('stop'));
    });

    expect(screen.getByTestId('user')).toHaveTextContent('-');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('impersonator')).toBeNull();
  });

  it('새로고침했는데 대상 토큰이 끝났으면 로그인 화면 대신 관리자로 돌아간다', async () => {
    seedSession(TEACHER, 'teacher-token');
    localStorage.setItem('impersonator', JSON.stringify(ACTOR));
    global.fetch = jest.fn(() => jsonResponse({ error: 'expired', tokenExpired: true }, false));

    await renderProvider();

    expect(screen.getByTestId('user')).toHaveTextContent('1:admin');
    expect(screen.getByTestId('impersonator')).toHaveTextContent('-');
    expect(localStorage.getItem('token')).toBe('admin-token');
    expect(localStorage.getItem('impersonator')).toBeNull();
  });

  it('돌아갈 세션 없이 대신 로그인 토큰만 있으면 배너용 정보만 채운다', async () => {
    seedSession(TEACHER, 'teacher-token');
    global.fetch = jest.fn(() => jsonResponse({ user: TEACHER, impersonatedBy: { id: 1, username: 'admin' } }));

    await renderProvider();

    expect(screen.getByTestId('impersonator')).toHaveTextContent('admin:no-token');
  });

  it('다시 로그인해 보통 토큰이 되면 남은 기록을 버린다', async () => {
    seedSession(ADMIN, 'admin-token');
    localStorage.setItem('impersonator', JSON.stringify(ACTOR));

    await renderProvider(); // verify → { user: ADMIN } (impersonatedBy 없음)

    expect(screen.getByTestId('impersonator')).toHaveTextContent('-');
    expect(localStorage.getItem('impersonator')).toBeNull();
  });

  it('로그아웃은 관리자 세션 기록도 지운다', async () => {
    seedSession(TEACHER, 'teacher-token');
    localStorage.setItem('impersonator', JSON.stringify(ACTOR));
    global.fetch = jest.fn(() => jsonResponse({ user: TEACHER, impersonatedBy: { id: 1, username: 'admin' } }));

    await renderProvider();
    await act(async () => {
      fireEvent.click(screen.getByText('logout'));
    });

    expect(screen.getByTestId('user')).toHaveTextContent('-');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('impersonator')).toBeNull();
  });
});
