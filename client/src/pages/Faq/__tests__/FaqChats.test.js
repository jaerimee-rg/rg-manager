import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

// 날짜 범위 선택기는 이 테스트의 관심사가 아니다.
jest.mock('../../../components/common/DateRangePicker', () => () => <div />);

import { fetchWithAuth } from '../../../utils/api';
import FaqChats from '../FaqChats';

const SESSION = {
  id: 42,
  visitorName: '민수 어머니',
  messageCount: 2,
  unansweredCount: 1,
  lastMessage: '주차 되나요?',
  lastMessageAt: '2026-08-22T10:00:00.000Z'
};

const THREAD = {
  session: SESSION,
  messages: [
    {
      id: 1,
      role: 'parent',
      content: '주차 되나요?',
      answered: null,
      status: 'ok',
      createdAt: '2026-08-22T10:00:00.000Z',
      matchedFaqs: []
    }
  ]
};

const jsonResponse = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

// 호출된 URL 별로 응답을 나눠준다.
const routeFetch = (url) => {
  if (url.startsWith('/api/chat/sessions?')) {
    return jsonResponse({ total: 1, sessions: [SESSION] });
  }
  if (url.includes('/messages')) return jsonResponse(THREAD);
  if (url.includes('/viewing')) return jsonResponse({ adminViewingAt: 'now' });
  return jsonResponse({});
};

const viewingCalls = () =>
  fetchWithAuth.mock.calls.filter(([url]) => url === `/api/chat/sessions/${SESSION.id}/viewing`);

const channel = { aiEnabled: true, isActive: true, name: '리듬체조 문의' };

describe('FaqChats — 관리자 접속 중 AI 일시중지', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWithAuth.mockImplementation((url) => routeFetch(url));
  });

  const openSession = async () => {
    render(<FaqChats channel={channel} onToggleAi={jest.fn().mockResolvedValue(true)} />);

    const item = await screen.findByText('민수 어머니');
    await act(async () => {
      fireEvent.click(item);
    });
  };

  it('대화를 열면 접속 상태(active=true)를 서버에 알린다', async () => {
    await openSession();

    await waitFor(() => expect(viewingCalls().length).toBeGreaterThan(0));

    const [, options] = viewingCalls()[0];
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ active: true });
  });

  it('대화를 열고 있는 동안 AI 일시중지 안내를 보여준다', async () => {
    await openSession();

    expect(await screen.findByText('일시중지')).toBeInTheDocument();
    expect(
      screen.getByText(/대화창을 열어둔 동안 잠시 멈춰 있습니다/)
    ).toBeInTheDocument();
  });

  it('화면을 벗어나면 접속 상태를 해제한다(active=false)', async () => {
    fetchWithAuth.mockImplementation((url) => routeFetch(url));

    const { unmount } = render(
      <FaqChats channel={channel} onToggleAi={jest.fn().mockResolvedValue(true)} />
    );

    const item = await screen.findByText('민수 어머니');
    await act(async () => {
      fireEvent.click(item);
    });
    await waitFor(() => expect(viewingCalls().length).toBeGreaterThan(0));

    await act(async () => {
      unmount();
    });

    const released = viewingCalls().some(([, options]) => JSON.parse(options.body).active === false);
    expect(released).toBe(true);
  });

  it('AI 자동 답변 토글을 끄면 상위로 전달한다', async () => {
    const onToggleAi = jest.fn().mockResolvedValue(true);
    render(<FaqChats channel={channel} onToggleAi={onToggleAi} />);

    const toggle = await screen.findByLabelText('AI 자동 답변');
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(onToggleAi).toHaveBeenCalledWith(false);
  });

  it('AI 가 꺼져 있으면 직접 답변하라고 안내한다', async () => {
    render(<FaqChats channel={{ ...channel, aiEnabled: false }} onToggleAi={jest.fn()} />);

    expect(await screen.findByText(/꺼짐 — 접수된 질문에 직접 답변해 주세요/)).toBeInTheDocument();
  });
});
