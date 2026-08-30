import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mockAuth = { user: null, impersonator: null, stopImpersonating: jest.fn(), logout: jest.fn() };
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuth
}));

jest.mock('../../../utils/navigation', () => ({ hardNavigate: jest.fn() }));

import { hardNavigate } from '../../../utils/navigation';
import ImpersonationBanner from '../ImpersonationBanner';

const ADMIN = { id: 1, username: 'admin', role: 'admin' };
const TEACHER = { id: 9, username: '이재림', role: 'user' };

describe('ImpersonationBanner — 다른 계정으로 로그인 배너 (FR-388)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = TEACHER;
    mockAuth.impersonator = { id: 1, username: 'admin', token: 'admin-token', user: ADMIN };
    mockAuth.stopImpersonating.mockResolvedValue(ADMIN);
  });

  it('대신 로그인 중이 아니면 아무 것도 그리지 않는다', () => {
    mockAuth.impersonator = null;
    const { container } = render(<ImpersonationBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('누가 누구로 보고 있는지 보여준다', () => {
    render(<ImpersonationBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('admin');
    expect(banner).toHaveTextContent('이재림');
    expect(banner).toHaveTextContent('선생님');
  });

  it('돌아가기를 누르면 관리자 세션으로 복구하고 사용자 관리를 새로 연다', async () => {
    render(<ImpersonationBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '관리자로 돌아가기' }));
    });

    expect(mockAuth.stopImpersonating).toHaveBeenCalled();
    expect(hardNavigate).toHaveBeenCalledWith('/admin/users');
  });

  it('관리자 토큰마저 끝나 복구에 실패하면 로그인 화면으로 간다', async () => {
    mockAuth.stopImpersonating.mockResolvedValue(null);
    render(<ImpersonationBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '관리자로 돌아가기' }));
    });

    expect(hardNavigate).toHaveBeenCalledWith('/login');
  });

  it('돌아갈 관리자 세션이 없으면(저장소 유실) 로그아웃만 권한다', async () => {
    mockAuth.impersonator = { id: 1, username: 'admin', token: null, user: null };
    render(<ImpersonationBanner />);

    expect(screen.queryByRole('button', { name: '관리자로 돌아가기' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    });

    expect(mockAuth.logout).toHaveBeenCalled();
    expect(mockAuth.stopImpersonating).not.toHaveBeenCalled();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
