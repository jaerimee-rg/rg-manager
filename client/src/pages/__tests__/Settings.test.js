import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockUpdateUserName = jest.fn();
let mockUser = { id: 9, username: '카카오_1774927139169', role: 'user', kakaoId: '123' };

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn(), updateUserName: mockUpdateUserName })
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}));

jest.mock('../../utils/api', () => ({
  fetchWithAuth: jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ user: { kakaoMessageConsent: false } }) })
  )
}));

jest.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import Settings from '../Settings';

const renderPage = async () => {
  await act(async () => {
    render(<Settings />);
  });
};

const startEdit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '이름 변경' }));
  });
};

describe('Settings — 표시 이름 변경', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 9, username: '카카오_1774927139169', role: 'user', kakaoId: '123' };
    mockUpdateUserName.mockResolvedValue({ id: 9, username: '이재림' });
  });

  it('카카오 계정도 이름 변경 버튼을 볼 수 있다', async () => {
    await renderPage();

    expect(screen.getByText('카카오_1774927139169')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이름 변경' })).toBeInTheDocument();
  });

  it('현재 이름이 채워진 상태로 편집을 시작한다', async () => {
    await renderPage();
    await startEdit();

    expect(screen.getByLabelText('사용자명')).toHaveValue('카카오_1774927139169');
  });

  it('바꾼 이름을 저장한다', async () => {
    await renderPage();
    await startEdit();

    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: '이재림' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(mockUpdateUserName).toHaveBeenCalledWith('이재림');
  });

  it('앞뒤 공백은 잘라서 보낸다', async () => {
    await renderPage();
    await startEdit();

    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: '  이재림  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(mockUpdateUserName).toHaveBeenCalledWith('이재림');
  });

  it('빈 이름은 서버로 보내지 않는다', async () => {
    await renderPage();
    await startEdit();

    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(mockUpdateUserName).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('이름을 입력해주세요.');
  });

  it('중복이면 오류를 보여주고 입력값을 유지한다', async () => {
    mockUpdateUserName.mockRejectedValue(new Error('이미 사용 중인 이름입니다.'));

    await renderPage();
    await startEdit();

    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: '이재림' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('이미 사용 중인 이름입니다.')
    );
    expect(screen.getByLabelText('사용자명')).toHaveValue('이재림');
  });

  it('취소하면 저장하지 않고 편집을 닫는다', async () => {
    await renderPage();
    await startEdit();

    fireEvent.change(screen.getByLabelText('사용자명'), { target: { value: '다른이름' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '취소' }));
    });

    expect(mockUpdateUserName).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '이름 변경' })).toBeInTheDocument();
  });
});
