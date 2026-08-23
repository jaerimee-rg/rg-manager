import { jest } from '@jest/globals';
import {
  buildFaqBlock,
  buildSystemInstruction,
  generateAnswer,
  pickFaqIds,
  composeAnswer,
  SYSTEM_RULES
} from '../aiAnswer.js';

describe('buildFaqBlock', () => {
  it('displayOrder, id 순으로 항상 같은 순서로 직렬화한다', () => {
    const faqs = [
      { id: 9, question: 'B', answer: 'b', displayOrder: 1 },
      { id: 2, question: 'A', answer: 'a', displayOrder: 0 },
      { id: 5, question: 'C', answer: 'c', displayOrder: 1 }
    ];

    const first = buildFaqBlock(faqs);
    const second = buildFaqBlock([...faqs].reverse());

    expect(first).toBe(second);
    expect(first.indexOf('[id:2]')).toBeLessThan(first.indexOf('[id:5]'));
    expect(first.indexOf('[id:5]')).toBeLessThan(first.indexOf('[id:9]'));
  });

  it('질문과 답변을 id와 함께 담는다', () => {
    const block = buildFaqBlock([{ id: 7, question: '보강 되나요?', answer: '주 1회 가능합니다.', displayOrder: 0 }]);
    expect(block).toContain('[id:7]');
    expect(block).toContain('보강 되나요?');
    expect(block).toContain('주 1회 가능합니다.');
  });
});

describe('buildSystemInstruction', () => {
  it('절대 규칙과 FAQ 블록을 함께 포함한다', () => {
    const instruction = buildSystemInstruction([
      { id: 1, question: 'Q', answer: 'A', displayOrder: 0 }
    ]);

    expect(instruction).toContain(SYSTEM_RULES);
    expect(instruction).toContain('<FAQ>');
    expect(instruction).toContain('[id:1]');
  });
});

describe('generateAnswer', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it('공개 FAQ가 없으면 AI를 호출하지 않고 no_faq 를 반환한다', async () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const result = await generateAnswer({ faqs: [], history: [], question: '토요일 수업?' });

    expect(result).toEqual({
      answered: false,
      answer: '',
      usedFaqIds: [],
      suggestedFaqIds: [],
      status: 'no_faq',
      promptId: expect.any(String)
    });
  });

  it('API 키가 없으면 ai_error 로 반환하고 답변하지 않는다', async () => {
    delete process.env.GEMINI_API_KEY;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateAnswer({
      faqs: [{ id: 1, question: 'Q', answer: 'A', displayOrder: 0 }],
      history: [],
      question: '토요일 수업?'
    });

    expect(result.answered).toBe(false);
    expect(result.answer).toBe('');
    expect(result.status).toBe('ai_error');
    errorSpy.mockRestore();
  });
});

describe('generateAnswer — OpenAI 제공자', () => {
  const FAQS = [
    { id: 1, question: '수업 시간이 어떻게 되나요?', answer: '평일 오후 3시부터입니다.', displayOrder: 0 },
    { id: 2, question: '수업료는 얼마인가요?', answer: '월 15만원입니다.', displayOrder: 1 }
  ];

  const originalFetch = global.fetch;
  const originalKey = process.env.OEPNAI_API_KEY;

  const okResponse = (parsed, usage = {}) => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(parsed) } }],
      usage
    })
  });

  beforeEach(() => {
    process.env.OEPNAI_API_KEY = 'sk-test-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OEPNAI_API_KEY;
    else process.env.OEPNAI_API_KEY = originalKey;
  });

  const call = (question = '수업 시간이 어떻게 되나요?') =>
    generateAnswer({ faqs: FAQS, history: [], question, provider: 'openai' });

  it('OpenAI 엔드포인트를 키와 함께 호출한다', async () => {
    global.fetch.mockResolvedValue(okResponse({ answered: true, usedFaqIds: [1], suggestedFaqIds: [] }));

    await call();

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer sk-test-key');
  });

  it('시스템 지시와 질문을 messages 로 보낸다', async () => {
    global.fetch.mockResolvedValue(okResponse({ answered: true, usedFaqIds: [1], suggestedFaqIds: [] }));

    await generateAnswer({
      faqs: FAQS,
      history: [{ role: 'parent', content: '안녕하세요' }, { role: 'bot', content: '네 안녕하세요' }],
      question: '수업료는요?',
      provider: 'openai'
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('[id:1]');
    // bot 답변은 OpenAI 규격의 assistant 로 바꿔 보낸다.
    expect(body.messages[1]).toEqual({ role: 'user', content: '안녕하세요' });
    expect(body.messages[2]).toEqual({ role: 'assistant', content: '네 안녕하세요' });
    expect(body.messages[3]).toEqual({ role: 'user', content: '수업료는요?' });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('고른 FAQ 답변 원문을 그대로 돌려준다', async () => {
    global.fetch.mockResolvedValue(
      okResponse({ answered: true, usedFaqIds: [1], suggestedFaqIds: [] }, { prompt_tokens: 120, completion_tokens: 8 })
    );

    const result = await call();

    expect(result.answered).toBe(true);
    expect(result.answer).toBe('평일 오후 3시부터입니다.');
    expect(result.usedFaqIds).toEqual([1]);
    expect(result.status).toBe('ok');
    expect(result.provider).toBe('openai');
    expect(result.inputTokens).toBe(120);
    expect(result.outputTokens).toBe(8);
  });

  it('등록되지 않은 id 를 고르면 답하지 않는다 (지어낸 근거 차단)', async () => {
    global.fetch.mockResolvedValue(okResponse({ answered: true, usedFaqIds: [99], suggestedFaqIds: [] }));

    const result = await call();

    expect(result.answered).toBe(false);
    expect(result.answer).toBe('');
  });

  it('안전 정책으로 거부하면 ai_error 로 돌려준다', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { refusal: '거부합니다', content: null } }], usage: {} })
    });

    const result = await call();

    expect(result.answered).toBe(false);
    expect(result.status).toBe('ai_error');
  });

  it('HTTP 오류는 ai_error 로 돌려주고 답변하지 않는다', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid api key' });

    const result = await call();

    expect(result.answered).toBe(false);
    expect(result.answer).toBe('');
    expect(result.status).toBe('ai_error');
    errorSpy.mockRestore();
  });

  it('OpenAI 를 골랐는데 키가 없으면 호출하지 않는다', async () => {
    delete process.env.OEPNAI_API_KEY;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await call();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.status).toBe('ai_error');
    errorSpy.mockRestore();
  });

  it('알 수 없는 제공자를 넘기면 기본 제공자(Gemini)로 되돌린다', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const originalGemini = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await generateAnswer({
      faqs: FAQS,
      history: [],
      question: '수업 시간?',
      provider: 'claude'
    });

    // Gemini 로 되돌아갔고, 그 키가 없으므로 OpenAI 호출은 일어나지 않는다.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.status).toBe('ai_error');

    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGemini;
    errorSpy.mockRestore();
  });
});

describe('pickFaqIds', () => {
  const faqs = [
    { id: 1, question: 'Q1', answer: 'A1' },
    { id: 2, question: 'Q2', answer: 'A2' },
    { id: 3, question: 'Q3', answer: 'A3' }
  ];

  it('배열이 아니면 빈 목록을 돌려준다', () => {
    expect(pickFaqIds(undefined, faqs)).toEqual([]);
    expect(pickFaqIds(null, faqs)).toEqual([]);
    expect(pickFaqIds('1', faqs)).toEqual([]);
  });

  it('등록되지 않은 id 는 버린다 (지어낸 근거 차단)', () => {
    expect(pickFaqIds([1, 99, 2], faqs)).toEqual([1, 2]);
  });

  it('정수가 아닌 값은 버린다', () => {
    expect(pickFaqIds([1, '2', 1.5, null], faqs)).toEqual([1]);
  });

  it('중복은 한 번만 남긴다', () => {
    expect(pickFaqIds([2, 2, 2], faqs)).toEqual([2]);
  });

  it('최대 2개까지만 남긴다', () => {
    expect(pickFaqIds([1, 2, 3], faqs)).toEqual([1, 2]);
  });
});

describe('composeAnswer', () => {
  it('등록된 답변을 원문 그대로 돌려준다', () => {
    const answer = '평일 오후 3시부터입니다.';
    const faqs = [{ id: 1, question: 'Q', answer }];

    expect(composeAnswer([1], faqs)).toBe(answer);
  });

  it('줄바꿈과 띄어쓰기를 그대로 보존한다', () => {
    const answer = '수업 시간 안내\n\n- 월요일: 오후 3시\n- 수요일: 오후 4시\n\n  들여쓴 줄도 그대로';
    const faqs = [{ id: 7, question: 'Q', answer }];

    const result = composeAnswer([7], faqs);

    expect(result).toBe(answer);
    expect(result).toContain('\n\n- 월요일');
    expect(result).toContain('  들여쓴 줄도 그대로');
  });

  it('앞뒤 공백도 다듬지 않는다', () => {
    const answer = '  앞뒤 공백 유지  ';
    const faqs = [{ id: 1, question: 'Q', answer }];

    expect(composeAnswer([1], faqs)).toBe(answer);
  });

  it('두 개를 고르면 빈 줄로 이어 붙이고 각 원문은 건드리지 않는다', () => {
    const faqs = [
      { id: 1, question: 'Q1', answer: '첫째 답변\n둘째 줄' },
      { id: 2, question: 'Q2', answer: '다른 답변' }
    ];

    expect(composeAnswer([1, 2], faqs)).toBe('첫째 답변\n둘째 줄\n\n다른 답변');
  });

  it('고른 것이 없으면 빈 문자열을 돌려준다', () => {
    expect(composeAnswer([], [{ id: 1, question: 'Q', answer: 'A' }])).toBe('');
  });
});

describe('SYSTEM_RULES (원문 유지 지시)', () => {
  it('모델이 문장을 쓰지 않도록 명시한다', () => {
    expect(SYSTEM_RULES).toContain('답변 문장은 직접 쓰지 않습니다');
    expect(SYSTEM_RULES).toContain('줄바꿈까지 그대로');
    expect(SYSTEM_RULES).toContain('요약하거나 다듬거나');
  });

  it('요약·글자수 제한처럼 원문을 바꾸게 하는 지시가 없다', () => {
    expect(SYSTEM_RULES).not.toContain('정리해 전달');
    expect(SYSTEM_RULES).not.toContain('300자');
    expect(SYSTEM_RULES).not.toContain('3문장');
  });
});

describe('추천 FAQ 선별 (pickFaqIds 개수 제한)', () => {
  const faqs = [1, 2, 3, 4, 5].map((id) => ({ id, question: `Q${id}`, answer: `A${id}` }));

  it('추천은 최대 3개까지 남긴다', () => {
    expect(pickFaqIds([1, 2, 3, 4, 5], faqs, 3)).toEqual([1, 2, 3]);
  });

  it('답변용은 기본 2개 제한을 유지한다', () => {
    expect(pickFaqIds([1, 2, 3], faqs)).toEqual([1, 2]);
  });

  it('추천에서도 없는 id 는 버린다', () => {
    expect(pickFaqIds([99, 2, 100], faqs, 3)).toEqual([2]);
  });
});

describe('SYSTEM_RULES (추천 질문 지시)', () => {
  it('답을 못 찾아도 가까운 FAQ 를 추천하도록 지시한다', () => {
    expect(SYSTEM_RULES).toContain('suggestedFaqIds');
    expect(SYSTEM_RULES).toContain('가까운 주제');
  });

  it('억지로 채우지 않도록 못 박는다', () => {
    expect(SYSTEM_RULES).toContain('억지로 채우지 않습니다');
  });
});
