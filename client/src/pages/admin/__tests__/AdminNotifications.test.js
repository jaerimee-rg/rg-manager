import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import { fetchWithAuth } from '../../../utils/api';
import AdminNotifications from '../AdminNotifications';

const SETTINGS = [
  {
    eventType: 'ATTENDANCE',
    label: '출석 체크 알림',
    description: '출석 체크를 저장할 때 보냅니다.',
    enabled: true
  },
  {
    eventType: 'FAQ_INQUIRY',
    label: '새 문의 알림',
    description: '학부모 질문이 오면 알립니다.',
    enabled: false
  }
];

const LOGS = [
  {
    id: 1,
    messageType: 'ATTENDANCE',
    messageContent: '출석 체크 완료',
    senderName: 'admin',
    recipientName: '최재웅',
    success: true,
    createdAt: '2026-08-22T10:00:00.000Z'
  }
];

const jsonResponse = (data, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(data) });

let settingsState;

const routeFetch = (url, options) => {
  if (url.startsWith('/api/notifications/settings/')) {
    const eventType = url.split('/').pop();
    const { enabled } = JSON.parse(options.body);
    settingsState = settingsState.map((s) => (s.eventType === eventType ? { ...s, enabled } : s));
    return jsonResponse(settingsState);
  }
  if (url === '/api/notifications/settings') return jsonResponse(settingsState);
  if (url.startsWith('/api/notifications/logs')) return jsonResponse({ logs: LOGS, total: 1 });
  if (url === '/api/auth/kakao/users') return jsonResponse([]);
  return jsonResponse({});
};

const renderPage = async () => {
  await act(async () => {
    render(<AdminNotifications />);
  });
};

describe('AdminNotifications — 알림 이벤트 토글', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsState = SETTINGS.map((s) => ({ ...s }));
    fetchWithAuth.mockImplementation((url, options) => routeFetch(url, options));
  });

  it('알림 이벤트 목록과 현재 상태를 보여준다', async () => {
    await renderPage();

    // 설명 문구는 이벤트 카드에만 나온다 (유형 필터 option 과 겹치지 않음)
    expect(screen.getByText('출석 체크를 저장할 때 보냅니다.')).toBeInTheDocument();
    expect(screen.getByText('학부모 질문이 오면 알립니다.')).toBeInTheDocument();

    expect(screen.getByRole('switch', { name: '출석 체크 알림' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('switch', { name: '새 문의 알림' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('꺼진 이벤트에는 꺼짐 배지를 보여준다', async () => {
    await renderPage();

    expect(screen.getByText('꺼짐')).toBeInTheDocument();
  });

  it('토글을 끄면 서버에 enabled=false 로 저장한다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '출석 체크 알림' }));
    });

    const call = fetchWithAuth.mock.calls.find(
      ([url]) => url === '/api/notifications/settings/ATTENDANCE'
    );
    expect(call).toBeDefined();
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ enabled: false });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: '출석 체크 알림' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    );
  });

  it('꺼진 이벤트를 다시 켤 수 있다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '새 문의 알림' }));
    });

    const call = fetchWithAuth.mock.calls.find(
      ([url]) => url === '/api/notifications/settings/FAQ_INQUIRY'
    );
    expect(JSON.parse(call[1].body)).toEqual({ enabled: true });

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: '새 문의 알림' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    );
  });

  it('발송 이력 목록을 보여준다', async () => {
    await renderPage();

    expect(await screen.findByText('출석 체크 완료')).toBeInTheDocument();
    expect(screen.getByText('최재웅')).toBeInTheDocument();
  });

  it('유형 필터를 바꾸면 해당 유형만 다시 조회한다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('알림 유형 필터'), {
        target: { value: 'ATTENDANCE' }
      });
    });

    await waitFor(() =>
      expect(
        fetchWithAuth.mock.calls.some(
          ([url]) => url === '/api/notifications/logs?eventType=ATTENDANCE'
        )
      ).toBe(true)
    );
  });
});
