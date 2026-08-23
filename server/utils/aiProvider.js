// FAQ 자동 답변에 쓸 AI 제공자 목록.
// 여기에 없는 값은 설정 API 에서 거부하고, 저장된 값이 이상하면 DEFAULT_PROVIDER 로 되돌린다.

// 관리자 설정을 담아 두는 app_settings 키
export const AI_PROVIDER_KEY = 'ai_provider';

export const DEFAULT_PROVIDER = 'gemini';

export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI GPT 모델로 FAQ 를 고릅니다.',
    // 로컬 .env 와 Vercel 에 OEPNAI_API_KEY(오타) 로 등록돼 있어 두 이름을 모두 읽는다.
    envKeys: ['OPENAI_API_KEY', 'OEPNAI_API_KEY'],
    modelEnvKey: 'OPENAI_FAQ_MODEL',
    defaultModel: 'gpt-4.1-mini'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Google Gemini 모델로 FAQ 를 고릅니다.',
    envKeys: ['GEMINI_API_KEY'],
    modelEnvKey: 'FAQ_CHAT_MODEL',
    defaultModel: 'gemini-3.6-flash'
  }
];

export const getProviderInfo = (id) => AI_PROVIDERS.find((p) => p.id === id) || null;

export const isKnownProvider = (id) => Boolean(getProviderInfo(id));

// 저장된 값이 비었거나 알 수 없는 제공자면 기본값으로 되돌린다 (챗봇이 멈추지 않도록).
export const normalizeProvider = (value) =>
  isKnownProvider(value) ? value : DEFAULT_PROVIDER;

// 키는 절대 밖으로 내보내지 않는다. 설정 화면에는 "있다/없다"만 알려준다.
export const resolveApiKey = (id) => {
  const info = getProviderInfo(id);
  if (!info) return null;

  for (const envKey of info.envKeys) {
    const value = process.env[envKey];
    if (value && value.trim()) return value.trim();
  }
  return null;
};

export const isProviderConfigured = (id) => Boolean(resolveApiKey(id));

export const resolveModel = (id) => {
  const info = getProviderInfo(id);
  if (!info) return null;
  return process.env[info.modelEnvKey] || info.defaultModel;
};

// 설정 화면에 내려줄 목록 (API 키 값은 제외)
export const describeProviders = () =>
  AI_PROVIDERS.map(({ id, label, description }) => ({
    id,
    label,
    description,
    model: resolveModel(id),
    configured: isProviderConfigured(id)
  }));
