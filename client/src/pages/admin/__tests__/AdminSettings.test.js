import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import { fetchWithAuth } from '../../../utils/api';
import AdminSettings from '../AdminSettings';

const SETTINGS = {
  provider: 'gemini',
  effectiveProvider: 'gemini',
  timeoutMs: 20000,
  timeoutRange: { min: 5000, max: 60000 },
  providers: [
    {
      id: 'openai',
      label: 'OpenAI',
      description: 'OpenAI GPT 모델로 FAQ 를 고릅니다.',
      model: 'gpt-4.1-mini',
      defaultModel: 'gpt-4.1-mini',
      modelOptions: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5'],
      effort: '',
      effortOptions: ['minimal', 'low', 'medium', 'high'],
      effortLabel: '추론 강도 (reasoning_effort)',
      effortHelp: '추론 계열 모델에만 적용됩니다.',
      configured: true
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      description: 'Google Gemini 모델로 FAQ 를 고릅니다.',
      model: 'gemini-3.6-flash',
      defaultModel: 'gemini-3.6-flash',
      modelOptions: ['gemini-3.6-flash', 'gemini-2.5-pro'],
      effort: 'low',
      effortOptions: ['low', 'high'],
      effortLabel: '사고 수준 (thinkingLevel)',
      effortHelp: '모델이 지원하지 않으면 자동으로 뺍니다.',
      configured: true
    }
  ]
};

const jsonResponse = (data, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) });

// 조회는 항상 성공, 저장 응답만 테스트마다 바꾼다.
const mockApi = (
  saveResponse = jsonResponse({ ...SETTINGS, provider: 'openai', effectiveProvider: 'openai' }),
  settings = SETTINGS
) => {
  fetchWithAuth.mockImplementation((url, options) => {
    if (options?.method === 'PUT') return saveResponse;
    return jsonResponse(settings);
  });
};

const renderPage = async () => {
  await act(async () => {
    render(<AdminSettings />);
  });
};

const radioFor = (label) => screen.getByRole('radio', { name: new RegExp(label) });

describe('AdminSettings — AI 제공자 선택', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    window.scrollTo = jest.fn();
    mockApi();
  });

  it('현재 설정을 불러와 사용 중인 제공자를 선택해 둔다', async () => {
    await renderPage();

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/settings/ai');
    expect(radioFor('Google Gemini')).toBeChecked();
    expect(radioFor('OpenAI')).not.toBeChecked();
    expect(screen.getByText('사용 중')).toBeInTheDocument();
  });

  it('두 제공자와 각 모델명을 보여준다', async () => {
    await renderPage();

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText('모델: gpt-4.1-mini')).toBeInTheDocument();
    expect(screen.getByText('모델: gemini-3.6-flash')).toBeInTheDocument();
  });

  it('바꾸기 전에는 저장 버튼이 비활성이다', async () => {
    await renderPage();

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('고른 제공자를 서버에 저장한다', async () => {
    await renderPage();

    fireEvent.click(radioFor('OpenAI'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(call[0]).toBe('/api/settings/ai');
    expect(JSON.parse(call[1].body)).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      timeoutMs: 20000
    });
  });

  it('저장에 성공하면 서버가 준 상태로 화면을 갱신한다', async () => {
    await renderPage();

    fireEvent.click(radioFor('OpenAI'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(radioFor('OpenAI')).toBeChecked();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('저장에 실패하면 이유를 알리고 선택을 되돌린다', async () => {
    mockApi(jsonResponse({ error: 'OpenAI API 키가 서버에 설정되어 있지 않아 선택할 수 없습니다.' }, false));
    await renderPage();

    fireEvent.click(radioFor('OpenAI'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    expect(window.alert).toHaveBeenCalledWith(
      'OpenAI API 키가 서버에 설정되어 있지 않아 선택할 수 없습니다.'
    );
    expect(radioFor('Google Gemini')).toBeChecked();
  });

  it('API 키가 없는 제공자는 고를 수 없다', async () => {
    const withoutOpenAiKey = {
      ...SETTINGS,
      providers: SETTINGS.providers.map((p) => (p.id === 'openai' ? { ...p, configured: false } : p))
    };
    mockApi(undefined, withoutOpenAiKey);
    await renderPage();

    expect(radioFor('OpenAI')).toBeDisabled();
    expect(screen.getByText('API 키 없음')).toBeInTheDocument();
  });

  // 로컬과 프로덕션이 DB 를 공유하므로, 고른 제공자의 키가 이 서버에는 없을 수 있다.
  it('고른 제공자와 실제 답변 제공자가 다르면 경고를 보여준다', async () => {
    const mismatch = {
      provider: 'openai',
      effectiveProvider: 'gemini',
      providers: SETTINGS.providers.map((p) => (p.id === 'openai' ? { ...p, configured: false } : p))
    };
    mockApi(undefined, mismatch);
    await renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('OpenAI');
    expect(alert).toHaveTextContent('Google Gemini');
    expect(screen.getByText('대신 사용 중')).toBeInTheDocument();
    expect(screen.getByText('선택됨')).toBeInTheDocument();
  });

  it('고른 제공자로 실제 답변하고 있으면 경고를 띄우지 않는다', async () => {
    mockApi(undefined, { ...SETTINGS, effectiveProvider: 'gemini' });
    await renderPage();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('사용 중')).toBeInTheDocument();
  });

  it('취소를 누르면 원래 설정으로 되돌린다', async () => {
    await renderPage();

    fireEvent.click(radioFor('OpenAI'));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(radioFor('Google Gemini')).toBeChecked();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  describe('모델 · 추론 강도 · 대기 시간', () => {
    it('선택한 제공자의 모델 선택지를 보여준다', async () => {
      await renderPage();

      const options = [...screen.getByLabelText('모델').options].map((o) => o.value);
      expect(options).toEqual(['gemini-3.6-flash', 'gemini-2.5-pro', '__custom__']);
    });

    it('제공자마다 강도 항목 이름과 선택지가 다르다', async () => {
      await renderPage();

      expect(screen.getByLabelText('사고 수준 (thinkingLevel)')).toBeInTheDocument();

      fireEvent.click(radioFor('OpenAI'));

      const effort = screen.getByLabelText('추론 강도 (reasoning_effort)');
      expect([...effort.options].map((o) => o.value)).toEqual([
        '',
        'minimal',
        'low',
        'medium',
        'high'
      ]);
    });

    it('제공자를 바꾸면 그 제공자에 저장된 모델을 불러온다', async () => {
      await renderPage();
      expect(screen.getByLabelText('모델')).toHaveValue('gemini-3.6-flash');

      fireEvent.click(radioFor('OpenAI'));
      expect(screen.getByLabelText('모델')).toHaveValue('gpt-4.1-mini');
    });

    it('목록에 없는 모델을 직접 입력할 수 있다', async () => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('모델'), { target: { value: '__custom__' } });
      fireEvent.change(screen.getByLabelText('모델 이름 직접 입력'), {
        target: { value: 'gemini-9-ultra' }
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '저장' }));
      });

      const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
      expect(JSON.parse(call[1].body).model).toBe('gemini-9-ultra');
    });

    it('모델·강도·대기 시간을 함께 저장한다', async () => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('모델'), { target: { value: 'gemini-2.5-pro' } });
      fireEvent.change(screen.getByLabelText('사고 수준 (thinkingLevel)'), {
        target: { value: 'high' }
      });
      fireEvent.change(screen.getByLabelText('응답 대기 시간 (초)'), { target: { value: '30' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '저장' }));
      });

      const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
      expect(JSON.parse(call[1].body)).toMatchObject({
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        effort: 'high',
        timeoutMs: 30000
      });
    });

    it('강도를 비우면 "모델 기본값에 맡김" 으로 보낸다', async () => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('사고 수준 (thinkingLevel)'), {
        target: { value: '' }
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '저장' }));
      });

      const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'PUT');
      expect(JSON.parse(call[1].body).effort).toBe('');
    });

    it('모델만 바꿔도 저장 버튼이 켜진다', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('모델'), { target: { value: 'gemini-2.5-pro' } });
      expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
    });

    it('대기 시간 입력에 서버가 준 허용 범위를 건다', async () => {
      await renderPage();

      const input = screen.getByLabelText('응답 대기 시간 (초)');
      expect(input).toHaveAttribute('min', '5');
      expect(input).toHaveAttribute('max', '60');
    });
  });
});
