import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('code=abc&state=xyz')]
}));

const mockAuth = { kakaoLogin: jest.fn() };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));

import KakaoCallback from '../KakaoCallback';

const renderCallback = () =>
  render(
    <MemoryRouter>
      <KakaoCallback />
    </MemoryRouter>
  );

describe('KakaoCallback — 로그인 결과에 따라 어디로 보내는가', () => {
  beforeEach(() => jest.clearAllMocks());

  it('선생님(기존)은 홈으로', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ role: 'user', isNewUser: false });

    renderCallback();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('새 선생님은 이름 등록으로', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ role: 'user', isNewUser: true });

    renderCallback();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/register-name'));
  });

  it('관리자는 관리자 화면으로', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ role: 'admin', isNewUser: false });

    renderCallback();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'));
  });

  it('아이를 등록하지 않은 학부모는 온보딩으로', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ role: 'parent', needsOnboarding: true });

    renderCallback();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/parent/onboarding'));
  });

  it('아이가 있는 학부모는 일정으로', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ role: 'parent', needsOnboarding: false });

    renderCallback();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule'));
  });

  it('초대가 없어 계정이 안 만들어지면 안내 화면으로 (오류로 처리하지 않는다)', async () => {
    mockAuth.kakaoLogin.mockResolvedValue({ outcome: 'needsInvite', error: '가입에는 초대가 필요합니다.' });

    renderCallback();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/login?outcome=needsInvite', { replace: true })
    );
  });

  it('진짜 오류는 실패 화면을 보여준다', async () => {
    mockAuth.kakaoLogin.mockRejectedValue(new Error('유효하지 않은 초대 링크입니다.'));

    const { findByText } = renderCallback();

    expect(await findByText('유효하지 않은 초대 링크입니다.')).toBeInTheDocument();
  });
});
