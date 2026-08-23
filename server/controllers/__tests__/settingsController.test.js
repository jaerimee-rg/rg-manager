import { jest } from '@jest/globals';

jest.unstable_mockModule('../../utils/aiSettings.js', () => ({
  getSelectedProvider: jest.fn(),
  getEffectiveProvider: jest.fn(),
  setSelectedProvider: jest.fn()
}));

const { getSelectedProvider, getEffectiveProvider, setSelectedProvider } = await import(
  '../../utils/aiSettings.js'
);
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
});
