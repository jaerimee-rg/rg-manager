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

/**
 * 이 환경에서 실제로 호출할 수 있는 제공자를 고른다.
 *
 * 설정은 DB 한 곳에 저장되는데 로컬과 프로덕션이 같은 DB 를 쓴다. 그래서 키가
 * 로컬에만 있는 제공자를 로컬에서 저장하면 프로덕션에는 그 키가 없을 수 있다.
 * 저장 시점 검사는 저장하는 환경만 보므로 이 경우를 못 막는다.
 * 읽는 쪽에서 키가 있는 제공자로 넘어가야 챗봇이 조용히 멈추지 않는다.
 *
 * 쓸 수 있는 제공자가 하나도 없으면 원래 고른 제공자를 그대로 돌려준다
 * (호출하는 쪽이 "키 없음" 으로 처리하며, 오류 메시지에 의도한 제공자가 남는다).
 */
export const resolveUsableProvider = (preferred) => {
  const normalized = normalizeProvider(preferred);
  if (isProviderConfigured(normalized)) return normalized;

  const usable = AI_PROVIDERS.find((p) => isProviderConfigured(p.id));
  if (!usable) return normalized;

  console.warn(
    `${normalized} API 키가 이 환경에 없어 ${usable.id} 로 대신 답변합니다. ` +
      '관리자 설정과 실제 사용 제공자가 다릅니다.'
  );
  return usable.id;
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
