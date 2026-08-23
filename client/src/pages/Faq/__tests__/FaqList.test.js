import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  )
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

// 대화 목록 자체는 이 테스트의 관심사가 아니다.
jest.mock('../FaqChats', () => () => <div data-testid="chats-panel" />);

import FaqList from '../FaqList';

const renderPage = async (props = {}) => {
  await act(async () => {
    render(<FaqList {...props} />);
  });
};

const tabNames = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent)
    .filter((t) => t === '대화 내역' || t === 'FAQ 관리');

describe('FaqList — 탭 순서와 기본 탭', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('대화 내역 탭이 FAQ 관리보다 먼저 나온다', async () => {
    await renderPage();

    expect(tabNames()).toEqual(['대화 내역', 'FAQ 관리']);
  });

  it('아무 것도 지정하지 않으면 대화 내역이 열려 있다', async () => {
    await renderPage();

    expect(screen.getByTestId('chats-panel')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/질문 검색/)).not.toBeInTheDocument();
  });

  it('FAQ 관리를 누르면 전용 주소로 이동한다 (기본 주소로 가면 다시 대화 내역이 된다)', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'FAQ 관리' }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/faq/manage');
    expect(screen.getByPlaceholderText(/질문 검색/)).toBeInTheDocument();
  });

  it('대화 내역을 누르면 기본 주소로 돌아간다', async () => {
    await renderPage({ initialTab: 'faq' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '대화 내역' }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/faq');
    expect(screen.getByTestId('chats-panel')).toBeInTheDocument();
  });

  it('initialTab="faq" 면 FAQ 관리로 연다 (/faq/manage 진입)', async () => {
    await renderPage({ initialTab: 'faq' });

    expect(screen.getByPlaceholderText(/질문 검색/)).toBeInTheDocument();
    expect(screen.queryByTestId('chats-panel')).not.toBeInTheDocument();
  });

  it('initialTab="chats" 면 대화 내역으로 연다 (카카오 알림의 /faq/chats 링크)', async () => {
    await renderPage({ initialTab: 'chats' });

    expect(screen.getByTestId('chats-panel')).toBeInTheDocument();
  });
});
