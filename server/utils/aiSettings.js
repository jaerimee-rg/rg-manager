import AppSetting from '../models/AppSetting.js';
import {
  AI_PROVIDER_KEY,
  DEFAULT_PROVIDER,
  normalizeProvider,
  resolveUsableProvider
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
