import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import { fetchWithAuth } from '../../../utils/api';
import AdminLlmLogs from '../AdminLlmLogs';

const LOGS = [
  {
    id: 1,
    createdAt: '2026-08-23T04:05:06.000Z',
    instructorName: '문아람',
    visitorName: '김OO 어머님',
    promptId: 'faq_answer_select@v2',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    status: 'ok',
    answered: true,
    inputTokens: 1234,
    outputTokens: 56,
    latencyMs: 1500
  },
  {
    id: 2,
    createdAt: '2026-08-23T03:00:00.000Z',
    instructorName: '표혜연',
    visitorName: '이OO 어머님',
    promptId: 'faq_answer_select@v2',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    status: 'ai_error',
    answered: false,
    inputTokens: null,
    outputTokens: null,
    latencyMs: 240
  }
];

const DETAIL = {
  ...LOGS[0],
  systemPrompt: '당신은 리듬체조 학원의 ... <FAQ>[id:1] Q: 수업 시간</FAQ>',
  userPrompt: '수업 몇 시에 시작해요?',
  response: '{"answered":true,"usedFaqIds":[1],"suggestedFaqIds":[]}'
};

const jsonResponse = (data, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) });

const mockApi = ({ logs = LOGS, total = 2, detail = DETAIL } = {}) => {
  fetchWithAuth.mockImplementation((url) => {
    if (/\/api\/logs\/llm\/\d+$/.test(url)) return jsonResponse(detail);
    return jsonResponse({ logs, total });
  });
};

const renderPage = async (props = {}) => {
  await act(async () => {
    render(<AdminLlmLogs users={[{ id: 3, username: '문아람' }]} {...props} />);
  });
};

describe('AdminLlmLogs — AI 호출 로그', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    mockApi();
  });

  it('요청한 컬럼을 순서대로 보여준다', async () => {
    await renderPage();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Timestamp',
      '강사',
      '학부모',
      'Prompt Identifier',
      'Status',
      'Input token',
      'Output token',
      'Response time'
    ]);
  });

  it('한 줄에 호출 정보를 채워 보여준다', async () => {
    await renderPage();

    const row = screen.getByText('김OO 어머님').closest('tr');
    expect(within(row).getByText('문아람')).toBeInTheDocument();
    expect(within(row).getByText('faq_answer_select@v2')).toBeInTheDocument();
    expect(within(row).getByText('성공')).toBeInTheDocument();
    expect(within(row).getByText('1,234')).toBeInTheDocument();
    expect(within(row).getByText('56')).toBeInTheDocument();
    expect(within(row).getByText('1.5s')).toBeInTheDocument();
  });

  it('실패한 호출은 실패로 표시하고 토큰은 - 로 둔다', async () => {
    await renderPage();

    const row = screen.getByText('이OO 어머님').closest('tr');
    expect(within(row).getByText('실패')).toBeInTheDocument();
    expect(within(row).getAllByText('-').length).toBeGreaterThanOrEqual(2);
    expect(within(row).getByText('240ms')).toBeInTheDocument();
  });

  it('줄을 누르면 상세를 불러온다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByText('김OO 어머님').closest('tr'));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/logs/llm/1');
  });

  it('상세에 Model, System Prompt, User Prompt, Response 를 보여준다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByText('김OO 어머님').closest('tr'));
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Model')).toBeInTheDocument();
    expect(within(dialog).getByText('System Prompt')).toBeInTheDocument();
    expect(within(dialog).getByText('User Prompt')).toBeInTheDocument();
    expect(within(dialog).getByText('Response')).toBeInTheDocument();

    expect(within(dialog).getByText(/gpt-4\.1-mini/)).toHaveTextContent('openai');
    expect(within(dialog).getByText(/수업 몇 시에 시작해요\?/)).toBeInTheDocument();
    expect(within(dialog).getByText(/usedFaqIds/)).toBeInTheDocument();
  });

  it('상세를 닫을 수 있다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByText('김OO 어머님').closest('tr'));
    });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('강사와 Status 로 거른다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('강사'), { target: { value: '3' } });
    });
    expect(fetchWithAuth.mock.calls.at(-1)[0]).toContain('userId=3');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ai_error' } });
    });
    expect(fetchWithAuth.mock.calls.at(-1)[0]).toContain('status=ai_error');
  });

  it('전체 건수를 보여준다', async () => {
    mockApi({ total: 137 });
    await renderPage();

    expect(screen.getByText('총 137건')).toBeInTheDocument();
  });

  it('한 쪽에 담기지 않으면 쪽 넘김을 보여준다', async () => {
    mockApi({ total: 120 });
    await renderPage();

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    });
    expect(fetchWithAuth.mock.calls.at(-1)[0]).toContain('offset=50');
  });

  it('이력이 없으면 안내 문구를 보여준다', async () => {
    mockApi({ logs: [], total: 0 });
    await renderPage();

    expect(screen.getByText('AI 호출 이력이 없습니다')).toBeInTheDocument();
  });
});
