import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

const mockRefreshUser = jest.fn().mockResolvedValue({});
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'admin', role: 'admin' }, refreshUser: mockRefreshUser })
}));

import { fetchWithAuth } from '../../../utils/api';
import AdminUsers from '../AdminUsers';

const USERS = [
  { id: 1, username: 'admin', role: 'admin', createdAt: '2025-12-04T00:00:00.000Z' },
  { id: 2, username: '최재웅', role: 'user', createdAt: '2025-12-04T00:00:00.000Z' }
];

const jsonResponse = (data, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) });

const renderPage = async () => {
  await act(async () => {
    render(<AdminUsers />);
  });
};

// 목록 조회는 항상 성공, 수정 응답만 테스트마다 바꾼다.
const mockApi = (updateResponse) => {
  fetchWithAuth.mockImplementation((url, options) => {
    if (options?.method === 'PUT') return updateResponse;
    return jsonResponse(USERS);
  });
};

const openEditFor = async (name) => {
  const row = screen.getByText(name).closest('tr');
  await act(async () => {
    fireEvent.click(within(row).getByRole('button', { name: '수정' }));
  });
};

describe('AdminUsers — 사용자 이름 변경', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    mockApi(jsonResponse({ id: 2, username: '이재림', role: 'user' }));
  });

  it('수정 폼의 사용자 이름을 입력할 수 있다', async () => {
    await renderPage();
    await openEditFor('최재웅');

    const input = screen.getByPlaceholderText('사용자 이름');
    expect(input).toBeEnabled();
    expect(input).toHaveValue('최재웅');
  });

  it('바꾼 이름을 서버에 저장한다', async () => {
    await renderPage();
    await openEditFor('최재웅');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: '이재림' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(call[0]).toBe('/api/auth/users/2');
    expect(JSON.parse(call[1].body)).toMatchObject({ username: '이재림', role: 'user' });
  });

  it('이름 앞뒤 공백은 잘라서 보낸다', async () => {
    await renderPage();
    await openEditFor('최재웅');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: '  이재림  ' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(call[1].body).username).toBe('이재림');
  });

  it('중복 이름이면 오류를 보여주고 입력값을 지우지 않는다', async () => {
    mockApi(jsonResponse({ error: '이미 사용 중인 이름입니다.' }, false));

    await renderPage();
    await openEditFor('최재웅');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: 'admin' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 이름입니다.');
    // 폼이 닫히거나 입력이 초기화되지 않아야 다시 시도할 수 있다
    expect(screen.getByPlaceholderText('사용자 이름')).toHaveValue('admin');
  });

  it('빈 이름은 서버로 보내지 않는다', async () => {
    await renderPage();
    await openEditFor('최재웅');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: '   ' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    expect(fetchWithAuth.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('사용자 이름을 입력해주세요.');
  });

  it('내 이름을 바꾸면 로그인 정보도 갱신한다', async () => {
    mockApi(jsonResponse({ id: 1, username: '관리자', role: 'admin' }));

    await renderPage();
    await openEditFor('admin');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: '관리자' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  });

  it('다른 사용자를 바꿀 때는 내 로그인 정보를 건드리지 않는다', async () => {
    await renderPage();
    await openEditFor('최재웅');

    fireEvent.change(screen.getByPlaceholderText('사용자 이름'), {
      target: { value: '이재림' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    });

    expect(mockRefreshUser).not.toHaveBeenCalled();
  });
});
