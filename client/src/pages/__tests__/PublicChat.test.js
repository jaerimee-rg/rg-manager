import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  useParams: () => ({ publicId: 'abc123' })
}));

import PublicChat from '../PublicChat';

const jsonResponse = (data, { status = 200 } = {}) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(data)
  });

const renderPage = async () => {
  let result;
  await act(async () => {
    result = render(<PublicChat />);
  });
  return result;
};

describe('PublicChat — 한도 초과 응답 처리', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('429 면 "잠시 후 다시 시도"를 안내한다 (링크가 죽은 것처럼 보이면 안 된다)', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ error: '요청이 많습니다.' }, { status: 429 }));

    await renderPage();

    expect(screen.getByText('잠시 후 다시 시도해 주세요')).toBeInTheDocument();
    expect(screen.queryByText('채팅방을 찾을 수 없습니다')).not.toBeInTheDocument();
  });

  it('404 는 지금처럼 없는 채팅방으로 안내한다', async () => {
    global.fetch.mockImplementation(() => jsonResponse({ error: '없음' }, { status: 404 }));

    await renderPage();

    expect(screen.getByText('채팅방을 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('잠시 후 다시 시도해 주세요')).not.toBeInTheDocument();
  });

  it('정상 응답이면 대화명 입력으로 넘어간다', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/messages')) return jsonResponse({ visitorName: null, messages: [] });
      return jsonResponse({ name: '문의', greeting: '안녕하세요', isActive: true, suggestedQuestions: [] });
    });

    await renderPage();

    expect(screen.queryByText('채팅방을 찾을 수 없습니다')).not.toBeInTheDocument();
    expect(screen.queryByText('잠시 후 다시 시도해 주세요')).not.toBeInTheDocument();
  });
});

describe('PublicChat — 추천 질문', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  const withMessages = (messages) => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/messages')) {
        return jsonResponse({ visitorName: '학부모', messages });
      }
      return jsonResponse({ name: '문의', greeting: '안녕하세요', isActive: true, suggestedQuestions: [] });
    });
  };

  it('답을 못 찾은 답변 아래에 추천 질문을 보여준다', async () => {
    withMessages([
      { id: 1, role: 'parent', content: '수업', createdAt: '2026-08-23T01:00:00.000Z' },
      {
        id: 2,
        role: 'bot',
        content: '관련 내용을 찾지 못했습니다.',
        answered: false,
        createdAt: '2026-08-23T01:00:01.000Z',
        suggestions: [
          { id: 3, question: '수업 시간이 어떻게 되나요?' },
          { id: 4, question: '수업료는 얼마인가요?' }
        ]
      }
    ]);

    await renderPage();

    expect(await screen.findByText('혹시 이걸 찾으셨나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수업 시간이 어떻게 되나요?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수업료는 얼마인가요?' })).toBeInTheDocument();
  });

  // 사과 문구와 추천을 함께 보여주면 학부모가 실패로 읽고 대화를 접는다.
  it('문구 없이 추천만 온 경우 빈 말풍선을 그리지 않는다', async () => {
    withMessages([
      { id: 1, role: 'parent', content: '수업', createdAt: '2026-08-23T01:00:00.000Z' },
      {
        id: 2,
        role: 'bot',
        content: '',
        answered: false,
        createdAt: '2026-08-23T01:00:01.000Z',
        suggestions: [{ id: 3, question: '수업 시간이 어떻게 되나요?' }]
      }
    ]);

    const { container } = await renderPage();

    expect(await screen.findByText('혹시 이걸 찾으셨나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수업 시간이 어떻게 되나요?' })).toBeInTheDocument();

    // 빈 말풍선이 하나도 없어야 한다 (문구 없는 봇 메시지는 말풍선을 만들지 않는다).
    const bubbles = [...container.querySelectorAll('.pchat-bubble')];
    expect(bubbles.length).toBeGreaterThan(0);
    expect(bubbles.every((b) => b.textContent.trim().length > 0)).toBe(true);
    expect(screen.queryByText(/찾지 못했습니다/)).not.toBeInTheDocument();
  });

  it('추천 질문은 눌러서 물어볼 수 있는 버튼으로 보여준다', async () => {
    withMessages([
      {
        id: 2,
        role: 'bot',
        content: '',
        answered: false,
        createdAt: '2026-08-23T01:00:01.000Z',
        suggestions: [{ id: 3, question: '수업 시간이 어떻게 되나요?' }]
      }
    ]);

    await renderPage();

    const chip = await screen.findByRole('button', { name: '수업 시간이 어떻게 되나요?' });
    // 말풍선이 아니라 누르는 버튼이라는 것이 표시로 드러나야 한다.
    expect(chip).toHaveClass('pchat-sug');
    expect(chip.tagName).toBe('BUTTON');
  });

  it('추천을 누르면 그 질문을 그대로 보낸다', async () => {
    withMessages([
      {
        id: 2,
        role: 'bot',
        content: '못 찾았습니다.',
        answered: false,
        createdAt: '2026-08-23T01:00:01.000Z',
        suggestions: [{ id: 3, question: '수업 시간이 어떻게 되나요?' }]
      }
    ]);

    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '수업 시간이 어떻게 되나요?' }));
    });

    const sent = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(sent[1].body).message).toBe('수업 시간이 어떻게 되나요?');
  });

  it('추천이 없으면 아무 것도 보여주지 않는다', async () => {
    withMessages([
      { id: 2, role: 'bot', content: '못 찾았습니다.', answered: false, createdAt: '2026-08-23T01:00:01.000Z', suggestions: [] }
    ]);

    await renderPage();

    expect(screen.queryByText('혹시 이걸 찾으셨나요?')).not.toBeInTheDocument();
  });
});
