import { jest } from '@jest/globals';

jest.unstable_mockModule('../../utils/aiSettings.js', () => ({
  getSelectedProvider: jest.fn(),
  getEffectiveProvider: jest.fn(),
  setSelectedProvider: jest.fn(),
  getSavedTuning: jest.fn(),
  saveTuning: jest.fn()
}));

const {
  getSelectedProvider,
  getEffectiveProvider,
  setSelectedProvider,
  getSavedTuning,
  saveTuning
} = await import('../../utils/aiSettings.js');
const { getAiSetting, updateAiSetting } = await import('../settingsController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const ENV_KEYS = ['OPENAI_API_KEY', 'OEPNAI_API_KEY', 'GEMINI_API_KEY'];
const saved = {};

describe('settingsController — AI 제공자', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ENV_KEYS.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
    getSelectedProvider.mockResolvedValue('gemini');
    getEffectiveProvider.mockResolvedValue('gemini');
    getSavedTuning.mockResolvedValue({ models: {}, efforts: {}, timeoutMs: null });
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  describe('조회', () => {
    it('관리자가 아니면 403 을 준다', async () => {
      const res = mockRes();
      await getAiSetting({ user: { id: 2, role: 'user' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(getSelectedProvider).not.toHaveBeenCalled();
    });

    it('현재 제공자와 선택 가능한 목록을 준다', async () => {
      process.env.GEMINI_API_KEY = 'g-key';
      const res = mockRes();

      await getAiSetting({ user: { id: 1, role: 'admin' } }, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.provider).toBe('gemini');
      expect(payload.providers.map((p) => p.id).sort()).toEqual(['gemini', 'openai']);
      expect(payload.providers.find((p) => p.id === 'gemini').configured).toBe(true);
      expect(payload.providers.find((p) => p.id === 'openai').configured).toBe(false);
    });

    it('응답에 API 키 값을 담지 않는다', async () => {
      process.env.OPENAI_API_KEY = 'sk-super-secret';
      const res = mockRes();

      await getAiSetting({ user: { id: 1, role: 'admin' } }, res);

      expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('sk-super-secret');
    });
  });

  describe('변경', () => {
    const adminReq = (provider) => ({ user: { id: 1, role: 'admin' }, body: { provider } });

    it('관리자가 아니면 403 을 주고 저장하지 않는다', async () => {
      const res = mockRes();
      await updateAiSetting({ user: { id: 2, role: 'user' }, body: { provider: 'openai' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(setSelectedProvider).not.toHaveBeenCalled();
    });

    it('알 수 없는 제공자는 400 으로 거부한다', async () => {
      const res = mockRes();
      await updateAiSetting(adminReq('claude'), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(setSelectedProvider).not.toHaveBeenCalled();
    });

    it('API 키가 없는 제공자는 400 으로 거부한다 (챗봇이 조용히 멈추지 않도록)', async () => {
      const res = mockRes();
      await updateAiSetting(adminReq('openai'), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('OpenAI');
      expect(setSelectedProvider).not.toHaveBeenCalled();
    });

    it('키가 있으면 저장하고 갱신된 상태를 돌려준다', async () => {
      process.env.OEPNAI_API_KEY = 'sk-typo-key';
      getSelectedProvider.mockResolvedValueOnce('openai');
      const res = mockRes();

      await updateAiSetting(adminReq('openai'), res);

      expect(setSelectedProvider).toHaveBeenCalledWith('openai', 1);
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].provider).toBe('openai');
    });
  });

  describe('모델·추론 강도·대기 시간', () => {
    const adminReq = (body) => ({ user: { id: 1, role: 'admin' }, body });

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'g-key';
    });

    it('제공자별 모델과 선택지를 함께 내려준다', async () => {
      const res = mockRes();

      await getAiSetting({ user: { id: 1, role: 'admin' }, query: {} }, res);

      const openai = res.json.mock.calls[0][0].providers.find((p) => p.id === 'openai');
      expect(openai.modelOptions).toEqual(['gpt-5.6-luna', 'gpt-5.4-nano']);
      expect(openai.effortOptions).toEqual(['minimal', 'low', 'medium', 'high']);
      expect(openai.defaultModel).toBe('gpt-5.6-luna');
    });

    it('저장된 모델이 있으면 환경변수 기본값 대신 그것을 보여준다', async () => {
      getSavedTuning.mockResolvedValue({
        models: { gemini: 'gemini-2.5-pro' },
        efforts: { gemini: 'high' },
        timeoutMs: 30000
      });
      const res = mockRes();

      await getAiSetting({ user: { id: 1, role: 'admin' }, query: {} }, res);

      const payload = res.json.mock.calls[0][0];
      const gemini = payload.providers.find((p) => p.id === 'gemini');
      expect(gemini.model).toBe('gemini-2.5-pro');
      expect(gemini.effort).toBe('high');
      expect(payload.timeoutMs).toBe(30000);
    });

    it('모델과 강도, 대기 시간을 함께 저장한다', async () => {
      const res = mockRes();

      await updateAiSetting(
        adminReq({ provider: 'gemini', model: 'gemini-2.5-pro', effort: 'high', timeoutMs: 30000 }),
        res
      );

      expect(saveTuning).toHaveBeenCalledWith(
        { provider: 'gemini', model: 'gemini-2.5-pro', effort: 'high', timeoutMs: 30000 },
        1
      );
    });

    it('모델 이름 앞뒤 공백은 다듬어 저장한다', async () => {
      const res = mockRes();

      await updateAiSetting(adminReq({ provider: 'gemini', model: '  gemini-2.5-pro  ' }), res);

      expect(saveTuning.mock.calls[0][0].model).toBe('gemini-2.5-pro');
    });

    it('이상한 모델 이름은 400 으로 거부한다', async () => {
      const res = mockRes();

      await updateAiSetting(adminReq({ provider: 'gemini', model: 'bad name; rm -rf' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(saveTuning).not.toHaveBeenCalled();
    });

    it('그 제공자가 받지 않는 강도는 400 으로 거부한다', async () => {
      const res = mockRes();

      // minimal 은 OpenAI 전용이라 Gemini 에는 쓸 수 없다.
      await updateAiSetting(adminReq({ provider: 'gemini', model: 'gemini-2.5-pro', effort: 'minimal' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(saveTuning).not.toHaveBeenCalled();
    });

    it('빈 강도는 "모델 기본값에 맡김" 으로 허용한다', async () => {
      const res = mockRes();

      await updateAiSetting(adminReq({ provider: 'gemini', model: 'gemini-2.5-pro', effort: '' }), res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(saveTuning.mock.calls[0][0].effort).toBe('');
    });

    it('범위를 벗어난 대기 시간은 400 으로 거부한다', async () => {
      const res = mockRes();

      await updateAiSetting(adminReq({ provider: 'gemini', model: 'g', timeoutMs: 120000 }), res);
      expect(res.status).toHaveBeenCalledWith(400);

      await updateAiSetting(adminReq({ provider: 'gemini', model: 'g', timeoutMs: 1000 }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(saveTuning).not.toHaveBeenCalled();
    });
  });

  describe('선택지 밖의 모델이 저장돼 있을 때', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-key';
    });

    it('지금 쓰는 모델을 목록 앞에 넣어 준다 (화면이 실제 상태를 숨기지 않도록)', async () => {
      getSavedTuning.mockResolvedValue({
        models: { openai: 'gpt-4.1-mini' },
        efforts: {},
        timeoutMs: null
      });
      const res = mockRes();

      await getAiSetting({ user: { id: 1, role: 'admin' }, query: {} }, res);

      const openai = res.json.mock.calls[0][0].providers.find((p) => p.id === 'openai');
      expect(openai.model).toBe('gpt-4.1-mini');
      expect(openai.modelOptions).toEqual(['gpt-4.1-mini', 'gpt-5.6-luna', 'gpt-5.4-nano']);
    });
  });
});
