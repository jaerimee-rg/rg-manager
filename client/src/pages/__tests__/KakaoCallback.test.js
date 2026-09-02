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
import { saveReturnTo, peekReturnTo } from '../../utils/returnTo';

const renderCallback = () =>
  render(
    <MemoryRouter>
      <KakaoCallback />
    </MemoryRouter>
  );

describe('KakaoCallback — 로그인 결과에 따라 어디로 보내는가', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

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

  describe('공유 링크로 왔다가 로그인한 경우 (returnTo)', () => {
    it('학부모는 기억해 둔 이벤트로 돌아가고, 기록은 지운다', async () => {
      saveReturnTo('/parent/events/12');
      mockAuth.kakaoLogin.mockResolvedValue({ role: 'parent', needsOnboarding: false });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/parent/events/12'));
      expect(peekReturnTo()).toBeNull();
    });

    it('아이를 아직 등록하지 않은 학부모는 온보딩으로 가되, 돌아갈 곳은 남겨 둔다', async () => {
      saveReturnTo('/parent/events/12');
      mockAuth.kakaoLogin.mockResolvedValue({ role: 'parent', needsOnboarding: true });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/parent/onboarding'));
      expect(peekReturnTo()).toBe('/parent/events/12');
    });

    it('선생님 계정으로 학부모 링크를 열었으면 그냥 홈으로 가고 기록을 지운다', async () => {
      saveReturnTo('/parent/events/12');
      mockAuth.kakaoLogin.mockResolvedValue({ role: 'user', isNewUser: false });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
      expect(peekReturnTo()).toBeNull();
    });

    it('선생님 딥링크는 선생님에게 돌려준다', async () => {
      saveReturnTo('/events');
      mockAuth.kakaoLogin.mockResolvedValue({ role: 'user', isNewUser: false });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events'));
    });

    it('관리자 딥링크는 관리자에게 돌려준다', async () => {
      saveReturnTo('/admin/users');
      mockAuth.kakaoLogin.mockResolvedValue({ role: 'admin' });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/users'));
    });

    it('초대가 없어 가입이 막히면 기록은 남긴다 — 초대 링크로 가입한 뒤 그 이벤트로 가야 하니까', async () => {
      saveReturnTo('/parent/events/12');
      mockAuth.kakaoLogin.mockResolvedValue({ outcome: 'needsInvite' });

      renderCallback();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login?outcome=needsInvite', { replace: true }));
      expect(peekReturnTo()).toBe('/parent/events/12');
    });
  });
});
