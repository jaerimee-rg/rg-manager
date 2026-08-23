import {
  isKnownProvider,
  isProviderConfigured,
  describeProviders,
  getProviderInfo,
  isValidModel,
  isValidEffort,
  isValidTimeout,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS
} from '../utils/aiProvider.js';
import {
  getSelectedProvider,
  getEffectiveProvider,
  setSelectedProvider,
  getSavedTuning,
  saveTuning
} from '../utils/aiSettings.js';

const requireAdmin = (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '권한이 없습니다.' });
    return false;
  }
  return true;
};

// 화면이 항상 최신 상태를 그리도록 조회·저장 모두 같은 모양을 돌려준다.
// effectiveProvider 가 provider 와 다르면 이 환경에 그 키가 없어 대신 쓰고 있다는 뜻이다
// (로컬과 프로덕션이 DB 를 공유하므로 실제로 생길 수 있다).
const buildResponse = async () => {
  const saved = await getSavedTuning();

  return {
    provider: await getSelectedProvider(),
    effectiveProvider: await getEffectiveProvider(),
    providers: describeProviders(saved),
    timeoutMs: saved.timeoutMs || Number(process.env.FAQ_CHAT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    timeoutRange: { min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS }
  };
};

export const getAiSetting = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    res.json(await buildResponse());
  } catch (error) {
    console.error('AI 설정 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 제공자와 그 제공자의 세부 설정(모델·강도·대기 시간)을 함께 저장한다.
 * 모델·강도는 제공자별로 따로 남으므로 나중에 제공자를 되돌려도 설정이 유지된다.
 */
export const updateAiSetting = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { provider, model, effort, timeoutMs } = req.body;

    if (!isKnownProvider(provider)) {
      return res.status(400).json({ error: '알 수 없는 AI 제공자입니다.' });
    }

    // 키가 없는 제공자로 바꾸면 챗봇이 조용히 멈춘다. 저장 단계에서 막는다.
    if (!isProviderConfigured(provider)) {
      const { label } = getProviderInfo(provider);
      return res.status(400).json({
        error: `${label} API 키가 서버에 설정되어 있지 않아 선택할 수 없습니다.`
      });
    }

    if (model !== undefined && !isValidModel(model)) {
      return res.status(400).json({ error: '모델 이름이 올바르지 않습니다.' });
    }
    if (effort !== undefined && !isValidEffort(provider, effort)) {
      return res.status(400).json({ error: '지원하지 않는 값입니다.' });
    }
    if (timeoutMs !== undefined && !isValidTimeout(timeoutMs)) {
      return res.status(400).json({
        error: `응답 대기 시간은 ${MIN_TIMEOUT_MS / 1000}~${MAX_TIMEOUT_MS / 1000}초 사이여야 합니다.`
      });
    }

    await setSelectedProvider(provider, req.user.id);
    await saveTuning(
      {
        provider,
        ...(model !== undefined ? { model: model.trim() } : {}),
        ...(effort !== undefined ? { effort } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {})
      },
      req.user.id
    );

    res.json(await buildResponse());
  } catch (error) {
    console.error('AI 설정 변경 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
