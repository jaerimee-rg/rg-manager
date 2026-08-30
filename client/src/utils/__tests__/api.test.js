jest.mock('../navigation', () => ({ hardNavigate: jest.fn() }));

import { hardNavigate } from '../navigation';
import { fetchWithAuth } from '../api';

const ACTOR = { id: 1, username: 'admin', token: 'admin-token', user: { id: 1, username: 'admin', role: 'admin' } };

const expired = () =>
  Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: '만료', tokenExpired: true }) });

const clearCookies = () => {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  });
};

describe('fetchWithAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    clearCookies();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('저장된 토큰을 Authorization 헤더로 보낸다', async () => {
    localStorage.setItem('token', 't1');
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }));

    await fetchWithAuth('/api/students');

    expect(global.fetch).toHaveBeenCalledWith('/api/students', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer t1' })
    }));
  });

  it('토큰이 끝나면 세션을 지우고 로그인 화면으로 보낸다', async () => {
    localStorage.setItem('token', 't1');
    global.fetch = jest.fn(expired);

    await expect(fetchWithAuth('/api/students')).rejects.toThrow('토큰이 만료되었습니다');

    expect(localStorage.getItem('token')).toBeNull();
    expect(hardNavigate).toHaveBeenCalledWith('/login');
  });

  it('다른 계정으로 로그인 중이었으면 관리자 세션으로 되돌리고 사용자 관리로 보낸다 (FR-388)', async () => {
    localStorage.setItem('token', 'teacher-token');
    localStorage.setItem('user', JSON.stringify({ id: 9, username: '이재림', role: 'user' }));
    localStorage.setItem('impersonator', JSON.stringify(ACTOR));
    global.fetch = jest.fn(expired);

    await expect(fetchWithAuth('/api/students')).rejects.toThrow('관리자로 돌아갑니다');

    expect(localStorage.getItem('token')).toBe('admin-token');
    expect(JSON.parse(localStorage.getItem('user')).id).toBe(1);
    expect(localStorage.getItem('impersonator')).toBeNull();
    expect(hardNavigate).toHaveBeenCalledWith('/admin/users');
    expect(hardNavigate).not.toHaveBeenCalledWith('/login');
  });
});
