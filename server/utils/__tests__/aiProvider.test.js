import { jest } from '@jest/globals';
import {
  AI_PROVIDERS,
  DEFAULT_PROVIDER,
  describeProviders,
  isKnownProvider,
  isProviderConfigured,
  normalizeProvider,
  resolveApiKey,
  resolveModel,
  resolveUsableProvider
} from '../aiProvider.js';

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'OEPNAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_FAQ_MODEL',
  'FAQ_CHAT_MODEL'
];

describe('aiProvider', () => {
  const saved = {};

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  it('openai 와 gemini 만 알려진 제공자다', () => {
    expect(AI_PROVIDERS.map((p) => p.id).sort()).toEqual(['gemini', 'openai']);
    expect(isKnownProvider('openai')).toBe(true);
    expect(isKnownProvider('gemini')).toBe(true);
    expect(isKnownProvider('claude')).toBe(false);
  });

  it('알 수 없거나 빈 값은 기본 제공자로 되돌린다', () => {
    expect(normalizeProvider('claude')).toBe(DEFAULT_PROVIDER);
    expect(normalizeProvider(undefined)).toBe(DEFAULT_PROVIDER);
    expect(normalizeProvider('')).toBe(DEFAULT_PROVIDER);
    expect(normalizeProvider('openai')).toBe('openai');
  });

  it('OPENAI_API_KEY 를 먼저 쓴다', () => {
    process.env.OPENAI_API_KEY = 'correct';
    process.env.OEPNAI_API_KEY = 'typo';

    expect(resolveApiKey('openai')).toBe('correct');
  });

  it('OEPNAI_API_KEY(오타) 만 있어도 읽는다', () => {
    process.env.OEPNAI_API_KEY = 'typo-key';

    expect(resolveApiKey('openai')).toBe('typo-key');
    expect(isProviderConfigured('openai')).toBe(true);
  });

  it('공백만 있는 키는 없는 것으로 본다', () => {
    process.env.GEMINI_API_KEY = '   ';

    expect(resolveApiKey('gemini')).toBeNull();
    expect(isProviderConfigured('gemini')).toBe(false);
  });

  it('모델은 환경변수로 덮어쓸 수 있고, 없으면 기본 모델을 쓴다', () => {
    expect(resolveModel('openai')).toBe('gpt-4.1-mini');

    process.env.OPENAI_FAQ_MODEL = 'gpt-4.1';
    expect(resolveModel('openai')).toBe('gpt-4.1');
  });

  // 로컬과 프로덕션이 같은 DB 를 쓰기 때문에, 저장된 제공자의 키가
  // 이 환경에는 없을 수 있다. 그때 챗봇이 멈추면 안 된다.
  describe('resolveUsableProvider — 키 없는 제공자가 저장돼 있을 때', () => {
    let warnSpy;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => warnSpy.mockRestore());

    it('키가 있으면 고른 제공자를 그대로 쓴다', () => {
      process.env.OPENAI_API_KEY = 'sk-key';

      expect(resolveUsableProvider('openai')).toBe('openai');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('고른 제공자의 키가 없으면 키가 있는 제공자로 넘어간다', () => {
      process.env.GEMINI_API_KEY = 'g-key';

      expect(resolveUsableProvider('openai')).toBe('gemini');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('넘어갈 때 로그로 알린다 (설정과 실제가 다르다는 사실을 숨기지 않는다)', () => {
      process.env.OPENAI_API_KEY = 'sk-key';

      resolveUsableProvider('gemini');

      expect(warnSpy.mock.calls[0][0]).toContain('gemini');
      expect(warnSpy.mock.calls[0][0]).toContain('openai');
    });

    it('쓸 수 있는 제공자가 하나도 없으면 고른 제공자를 그대로 돌려준다', () => {
      expect(resolveUsableProvider('openai')).toBe('openai');
    });

    it('알 수 없는 값도 기본 제공자를 거쳐 처리한다', () => {
      process.env.GEMINI_API_KEY = 'g-key';

      expect(resolveUsableProvider('claude')).toBe(DEFAULT_PROVIDER);
    });
  });

  it('설정 화면용 목록에는 API 키 값이 들어가지 않는다', () => {
    process.env.OPENAI_API_KEY = 'super-secret';

    const described = describeProviders();
    const openai = described.find((p) => p.id === 'openai');

    expect(openai).toMatchObject({ id: 'openai', label: 'OpenAI', configured: true });
    expect(JSON.stringify(described)).not.toContain('super-secret');
    expect(described.find((p) => p.id === 'gemini').configured).toBe(false);
  });
});
