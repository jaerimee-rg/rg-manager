import { jest } from '@jest/globals';
import { buildFaqBlock, buildSystemInstruction, generateAnswer, SYSTEM_RULES } from '../aiAnswer.js';

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

    expect(result).toEqual({ answered: false, answer: '', usedFaqIds: [], status: 'no_faq' });
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
