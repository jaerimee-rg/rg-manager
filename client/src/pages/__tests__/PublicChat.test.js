import React from 'react';
import { render, screen, act } from '@testing-library/react';

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
  await act(async () => {
    render(<PublicChat />);
  });
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
