import AppSetting from '../models/AppSetting.js';
import {
  AI_PROVIDER_KEY,
  AI_TIMEOUT_KEY,
  aiModelKey,
  aiEffortKey,
  AI_PROVIDERS,
  DEFAULT_PROVIDER,
  DEFAULT_TIMEOUT_MS,
  normalizeProvider,
  resolveUsableProvider,
  envModel,
  envEffort,
  isValidTimeout
} from './aiProvider.js';

/**
 * 관리자가 고른 AI 제공자를 돌려준다 (설정 화면에 보여줄 값).
 * 설정한 적이 없으면 환경변수 AI_PROVIDER, 그것도 없으면 기본값을 쓴다.
 * 조회에 실패해도 챗봇이 멈추면 안 되므로 기본값으로 이어간다.
 */
export const getSelectedProvider = async () => {
  try {
    const saved = await AppSetting.getValue(AI_PROVIDER_KEY);
    return normalizeProvider(saved || process.env.AI_PROVIDER || DEFAULT_PROVIDER);
  } catch (error) {
    console.error('AI 제공자 설정 조회 실패, 기본값을 사용합니다:', error?.message || error);
    return normalizeProvider(process.env.AI_PROVIDER || DEFAULT_PROVIDER);
  }
};

/**
 * 실제로 답변을 만들 때 쓸 제공자를 돌려준다.
 * 고른 제공자의 키가 이 환경에 없으면 키가 있는 쪽으로 넘어간다.
 */
export const getEffectiveProvider = async () =>
  resolveUsableProvider(await getSelectedProvider());

export const setSelectedProvider = async (provider, updatedBy = null) =>
  AppSetting.setValue(AI_PROVIDER_KEY, provider, updatedBy);

/**
 * 저장된 모델·강도·대기 시간을 한 번에 읽는다.
 * 우선순위: DB(관리자 설정) > 환경변수 > 코드 기본값.
 * 어느 단계에서 실패해도 답변은 계속돼야 하므로 기본값으로 이어간다.
 */
export const getSavedTuning = async () => {
  const models = {};
  const efforts = {};
  let timeoutMs = null;

  try {
    const rows = await Promise.all([
      ...AI_PROVIDERS.map((p) => AppSetting.getValue(aiModelKey(p.id))),
      ...AI_PROVIDERS.map((p) => AppSetting.getValue(aiEffortKey(p.id))),
      AppSetting.getValue(AI_TIMEOUT_KEY)
    ]);

    AI_PROVIDERS.forEach((p, i) => {
      if (rows[i]) models[p.id] = rows[i];
      const effort = rows[AI_PROVIDERS.length + i];
      // 빈 문자열은 "모델에 맡김"이라는 뜻이므로 그대로 살린다.
      if (effort !== null) efforts[p.id] = effort;
    });

    const savedTimeout = parseInt(rows[rows.length - 1], 10);
    if (isValidTimeout(savedTimeout)) timeoutMs = savedTimeout;
  } catch (error) {
    console.error('AI 세부 설정 조회 실패, 기본값을 사용합니다:', error?.message || error);
  }

  return { models, efforts, timeoutMs };
};

/**
 * 답변 생성에 그대로 넘길 설정 한 벌.
 * effort 가 빈 문자열이면 요청에서 아예 뺀다 (모델 기본값에 맡김).
 */
export const getAiConfig = async () => {
  const provider = await getEffectiveProvider();
  const saved = await getSavedTuning();

  const effort = saved.efforts[provider] ?? envEffort(provider) ?? '';

  return {
    provider,
    model: saved.models[provider] || envModel(provider),
    effort: effort || null,
    timeoutMs: saved.timeoutMs || Number(process.env.FAQ_CHAT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  };
};

export const saveTuning = async ({ provider, model, effort, timeoutMs }, updatedBy = null) => {
  if (model !== undefined) {
    await AppSetting.setValue(aiModelKey(provider), model, updatedBy);
  }
  if (effort !== undefined) {
    await AppSetting.setValue(aiEffortKey(provider), effort ?? '', updatedBy);
  }
  if (timeoutMs !== undefined) {
    await AppSetting.setValue(AI_TIMEOUT_KEY, String(timeoutMs), updatedBy);
  }
};
