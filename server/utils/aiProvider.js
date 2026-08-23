// FAQ 자동 답변에 쓸 AI 제공자 목록.
// 여기에 없는 값은 설정 API 에서 거부하고, 저장된 값이 이상하면 DEFAULT_PROVIDER 로 되돌린다.

// 관리자 설정을 담아 두는 app_settings 키
export const AI_PROVIDER_KEY = 'ai_provider';
export const AI_TIMEOUT_KEY = 'ai_timeout_ms';
export const aiModelKey = (provider) => `ai_model_${provider}`;
export const aiEffortKey = (provider) => `ai_effort_${provider}`;

// 응답 대기 시간. Vercel 함수 실행 한도보다 길게 잡으면 플랫폼이 먼저 끊는다.
export const DEFAULT_TIMEOUT_MS = 20000;
export const MIN_TIMEOUT_MS = 5000;
export const MAX_TIMEOUT_MS = 60000;

export const DEFAULT_PROVIDER = 'gemini';

export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI GPT 모델로 FAQ 를 고릅니다.',
    // 로컬 .env 와 Vercel 에 OEPNAI_API_KEY(오타) 로 등록돼 있어 두 이름을 모두 읽는다.
    envKeys: ['OPENAI_API_KEY', 'OEPNAI_API_KEY'],
    modelEnvKey: 'OPENAI_FAQ_MODEL',
    defaultModel: 'gpt-4.1-mini',
    // 고르기 쉽게 흔히 쓰는 것만 담아 둔다. 목록에 없는 모델도 직접 입력할 수 있다.
    modelOptions: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'gpt-5-mini', 'gpt-5'],
    // reasoning_effort. 추론 계열 모델만 받는다 (안 받으면 빼고 다시 보낸다).
    effortOptions: ['minimal', 'low', 'medium', 'high'],
    effortEnvKey: 'OPENAI_FAQ_EFFORT',
    effortLabel: '추론 강도 (reasoning_effort)',
    effortHelp: '추론 계열 모델(o·gpt-5 계열)에만 적용됩니다. 받지 않는 모델이면 자동으로 빼고 요청합니다.'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Google Gemini 모델로 FAQ 를 고릅니다.',
    envKeys: ['GEMINI_API_KEY'],
    modelEnvKey: 'FAQ_CHAT_MODEL',
    defaultModel: 'gemini-3.6-flash',
    modelOptions: ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    // thinkingLevel. 모델에 따라 지원 여부가 다르다 (안 받으면 빼고 다시 보낸다).
    effortOptions: ['low', 'high'],
    effortEnvKey: 'FAQ_CHAT_THINKING_LEVEL',
    effortLabel: '사고 수준 (thinkingLevel)',
    effortHelp: '모델이 지원하지 않으면 자동으로 빼고 요청합니다.'
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

/**
 * 환경변수 기본값. 관리자가 아직 저장한 적 없을 때 쓴다.
 * (DB 에 값이 있으면 그쪽이 이긴다 — aiSettings.js 참고)
 */
export const envModel = (id) => {
  const info = getProviderInfo(id);
  if (!info) return null;
  return process.env[info.modelEnvKey] || info.defaultModel;
};

export const envEffort = (id) => {
  const info = getProviderInfo(id);
  if (!info) return null;
  const fromEnv = process.env[info.effortEnvKey];
  return isValidEffort(id, fromEnv) ? fromEnv : null;
};

// 모델 이름은 자유 입력이라 최소한만 확인한다 (API 가 최종 판단자다).
export const isValidModel = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value.trim());

// 빈 값은 "모델에 맡김" 이라는 뜻으로 허용한다.
export const isValidEffort = (providerId, value) => {
  if (value === null || value === undefined || value === '') return true;
  const info = getProviderInfo(providerId);
  return Boolean(info) && info.effortOptions.includes(value);
};

export const isValidTimeout = (value) =>
  Number.isInteger(value) && value >= MIN_TIMEOUT_MS && value <= MAX_TIMEOUT_MS;

// 설정 화면에 내려줄 목록 (API 키 값은 제외)
export const describeProviders = (saved = {}) =>
  AI_PROVIDERS.map((info) => ({
    id: info.id,
    label: info.label,
    description: info.description,
    configured: isProviderConfigured(info.id),
    model: saved.models?.[info.id] || envModel(info.id),
    defaultModel: info.defaultModel,
    modelOptions: info.modelOptions,
    effort: saved.efforts?.[info.id] ?? envEffort(info.id) ?? '',
    effortOptions: info.effortOptions,
    effortLabel: info.effortLabel,
    effortHelp: info.effortHelp
  }));
