import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }))
}));

// 대화 목록 자체는 이 테스트의 관심사가 아니다.
jest.mock('../../Faq/FaqChats', () => () => <div data-testid="chats-panel" />);

import AdminFaq from '../AdminFaq';

const renderPage = async () => {
  await act(async () => {
    render(<AdminFaq />);
  });
};

describe('AdminFaq — 카드 순서', () => {
  beforeEach(() => jest.clearAllMocks());

  it('대화 내역이 FAQ 목록보다 위에 있다', async () => {
    await renderPage();

    const titles = [...document.querySelectorAll('.card-title')].map((el) =>
      el.textContent.trim().replace(/\s+/g, ' ')
    );

    const chatsIndex = titles.findIndex((t) => t.startsWith('대화 내역'));
    const faqIndex = titles.findIndex((t) => t.startsWith('FAQ 목록'));

    expect(chatsIndex).toBeGreaterThanOrEqual(0);
    expect(faqIndex).toBeGreaterThanOrEqual(0);
    expect(chatsIndex).toBeLessThan(faqIndex);
  });

  it('사용자 필터는 두 카드보다 위에 남는다 (양쪽에 적용되는 조건)', async () => {
    await renderPage();

    const filter = screen.getByText('사용자');
    const chats = screen.getByTestId('chats-panel');

    // DOM 순서상 필터가 먼저 와야 한다
    expect(filter.compareDocumentPosition(chats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
