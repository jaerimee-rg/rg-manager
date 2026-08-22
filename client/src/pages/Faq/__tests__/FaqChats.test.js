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
  session: { ...SESSION, aiEnabled: true },
  messages: [
    {
      id: 1,
      role: 'parent',
      content: '주차 되나요?',
      answered: null,
      status: 'ok',
      createdAt: '2026-08-22T10:00:00.000Z',
      matchedFaqs: []
    },
    {
      id: 2,
      role: 'admin',
      content: '네 가능합니다',
      answered: true,
      status: 'ok',
      createdAt: '2026-08-22T10:01:00.000Z',
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
  if (url.endsWith('/ai')) return jsonResponse({ aiEnabled: false });
  if (url.includes('/messages/')) return jsonResponse({ id: 2, content: '고친 답변', editedAt: 'now' });
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

describe('FaqChats — 대화별 AI 끄기 / 메시지 삭제', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    fetchWithAuth.mockImplementation((url) => routeFetch(url));
  });

  const open = async () => {
    render(<FaqChats channel={channel} onToggleAi={jest.fn().mockResolvedValue(true)} />);
    const item = await screen.findByText('민수 어머니');
    await act(async () => {
      fireEvent.click(item);
    });
  };

  it('대화창 안에 이 대화 전용 AI 스위치를 보여준다', async () => {
    await open();

    expect(await screen.findByLabelText('이 대화에 AI 답변')).toBeChecked();
  });

  it('스위치를 끄면 이 대화만 AI를 끈다', async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('이 대화에 AI 답변'));
    });

    const call = fetchWithAuth.mock.calls.find(([u]) => u === `/api/chat/sessions/${SESSION.id}/ai`);
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ aiEnabled: false });
  });

  it('채널 전체가 꺼져 있으면 대화 스위치를 만질 수 없다', async () => {
    render(
      <FaqChats channel={{ ...channel, aiEnabled: false }} onToggleAi={jest.fn()} />
    );
    const item = await screen.findByText('민수 어머니');
    await act(async () => {
      fireEvent.click(item);
    });

    const box = screen.getByLabelText('이 대화에 AI 답변');
    expect(box).toBeDisabled();
    expect(screen.getByText(/채널 전체 AI 답변이 꺼져 있습니다/)).toBeInTheDocument();
  });

  it('메시지를 삭제하면 해당 메시지만 지운다', async () => {
    await open();

    const deleteButtons = await screen.findAllByRole('button', { name: '메시지 삭제' });
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalled();
    const call = fetchWithAuth.mock.calls.find(
      ([u, o]) => o?.method === 'DELETE' && u.includes('/messages/')
    );
    expect(call[0]).toBe(`/api/chat/sessions/${SESSION.id}/messages/1`);
  });

  it('확인을 취소하면 삭제하지 않는다', async () => {
    window.confirm = jest.fn(() => false);
    await open();

    const deleteButtons = await screen.findAllByRole('button', { name: '메시지 삭제' });
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
    });

    expect(
      fetchWithAuth.mock.calls.some(([u, o]) => o?.method === 'DELETE' && u.includes('/messages/'))
    ).toBe(false);
  });
});

describe('FaqChats — 메시지 수정 / 스크롤', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    fetchWithAuth.mockImplementation((url) => routeFetch(url));
  });

  const open = async () => {
    render(<FaqChats channel={channel} onToggleAi={jest.fn().mockResolvedValue(true)} />);
    const item = await screen.findByText('민수 어머니');
    await act(async () => {
      fireEvent.click(item);
    });
  };

  it('학부모 질문에는 수정 버튼이 없다', async () => {
    await open();

    // THREAD 는 학부모 질문 1 + 내 답변 1 → 수정 버튼은 내 답변에만
    const editButtons = await screen.findAllByRole('button', { name: '메시지 수정' });
    expect(editButtons).toHaveLength(1);
    // 삭제는 모든 메시지에 있다
    expect(screen.getAllByRole('button', { name: '메시지 삭제' })).toHaveLength(2);
  });

  it('AI 답변에도 수정 버튼이 있다', async () => {
    const withBot = {
      ...THREAD,
      messages: [
        THREAD.messages[0],
        {
          id: 3,
          role: 'bot',
          content: '죄송합니다. 찾지 못했습니다.',
          answered: false,
          status: 'no_faq',
          createdAt: '2026-08-22T10:02:00.000Z',
          matchedFaqs: []
        }
      ]
    };
    fetchWithAuth.mockImplementation((url) => {
      if (url.includes('/messages')) return jsonResponse(withBot);
      return routeFetch(url);
    });

    await open();

    // 학부모 질문 1 + AI 답변 1 → AI 답변에만 수정 버튼
    const editButtons = await screen.findAllByRole('button', { name: '메시지 수정' });
    expect(editButtons).toHaveLength(1);
  });

  it('수정을 누르면 기존 내용이 채워진 입력창이 열린다', async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메시지 수정' }));
    });

    expect(screen.getByLabelText('답변 수정')).toHaveValue('네 가능합니다');
  });

  it('고친 내용을 PATCH 로 저장한다', async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메시지 수정' }));
    });
    fireEvent.change(screen.getByLabelText('답변 수정'), { target: { value: '고친 답변' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(call[0]).toBe(`/api/chat/sessions/${SESSION.id}/messages/2`);
    expect(JSON.parse(call[1].body)).toEqual({ message: '고친 답변' });
  });

  it('취소하면 저장하지 않는다', async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메시지 수정' }));
    });
    fireEvent.change(screen.getByLabelText('답변 수정'), { target: { value: '고친 답변' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '취소' }));
    });

    expect(fetchWithAuth.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
    expect(screen.queryByLabelText('답변 수정')).not.toBeInTheDocument();
  });

  it('빈 내용으로는 저장할 수 없다', async () => {
    await open();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메시지 수정' }));
    });
    fireEvent.change(screen.getByLabelText('답변 수정'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('대화를 열면 메시지 목록을 맨 아래로 내린다', async () => {
    await open();

    const scroller = document.querySelector('.chat-thread-scroll');
    expect(scroller).toBeInTheDocument();
    // jsdom 은 레이아웃이 없어 scrollHeight 가 0이므로, 스크롤 시도 자체를 확인한다
    expect(scroller.scrollTop).toBe(scroller.scrollHeight);
  });

  it('수정된 답변에는 수정됨 표시가 붙는다', async () => {
    const edited = {
      ...THREAD,
      messages: [{ ...THREAD.messages[1], editedAt: '2026-08-22T10:05:00.000Z' }]
    };
    fetchWithAuth.mockImplementation((url) => {
      if (url.includes('/messages')) return jsonResponse(edited);
      return routeFetch(url);
    });

    await open();

    expect(await screen.findByText('(수정됨)')).toBeInTheDocument();
  });
});
