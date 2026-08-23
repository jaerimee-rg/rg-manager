import { jest } from '@jest/globals';

jest.unstable_mockModule('../../database.js', () => ({
  default: { query: jest.fn() }
}));

jest.unstable_mockModule('../../models/LlmCallLog.js', () => ({
  default: {
    list: jest.fn(),
    count: jest.fn(),
    getById: jest.fn(),
    create: jest.fn()
  }
}));

const LlmCallLog = (await import('../../models/LlmCallLog.js')).default;
const { getLlmLogs, getLlmLogDetail } = await import('../logController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const admin = { id: 1, role: 'admin' };
const teacher = { id: 3, role: 'user' };

describe('AI 호출 이력', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LlmCallLog.list.mockResolvedValue([]);
    LlmCallLog.count.mockResolvedValue(0);
  });

  describe('목록', () => {
    it('관리자가 아니면 403 을 준다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: teacher, query: {} }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(LlmCallLog.list).not.toHaveBeenCalled();
    });

    it('목록과 전체 건수를 함께 준다', async () => {
      LlmCallLog.list.mockResolvedValue([{ id: 1, status: 'ok' }]);
      LlmCallLog.count.mockResolvedValue(42);
      const res = mockRes();

      await getLlmLogs({ user: admin, query: {} }, res);

      expect(res.json).toHaveBeenCalledWith({ logs: [{ id: 1, status: 'ok' }], total: 42 });
    });

    it('기본 50건씩, 한 번에 200건을 넘지 않는다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: admin, query: {} }, res);
      expect(LlmCallLog.list.mock.calls[0][0].limit).toBe(50);

      await getLlmLogs({ user: admin, query: { limit: '9999' } }, res);
      expect(LlmCallLog.list.mock.calls[1][0].limit).toBe(200);
    });

    it('강사와 status 로 거를 수 있다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: admin, query: { userId: '3', status: 'ai_error' } }, res);

      expect(LlmCallLog.list.mock.calls[0][0]).toMatchObject({ userId: 3, status: 'ai_error' });
      expect(LlmCallLog.count).toHaveBeenCalledWith({ userId: 3, status: 'ai_error' });
    });

    it('all 은 거르지 않는다는 뜻이다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: admin, query: { userId: 'all', status: 'all' } }, res);

      const arg = LlmCallLog.list.mock.calls[0][0];
      expect(arg.userId).toBeUndefined();
      expect(arg.status).toBeUndefined();
    });

    it('잘못된 사용자 ID 는 400 으로 거부한다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: admin, query: { userId: 'abc' } }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(LlmCallLog.list).not.toHaveBeenCalled();
    });

    it('offset 으로 다음 쪽을 읽는다', async () => {
      const res = mockRes();

      await getLlmLogs({ user: admin, query: { offset: '100' } }, res);

      expect(LlmCallLog.list.mock.calls[0][0].offset).toBe(100);
    });
  });

  describe('상세', () => {
    it('관리자가 아니면 403 을 준다', async () => {
      const res = mockRes();

      await getLlmLogDetail({ user: teacher, params: { id: '1' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(LlmCallLog.getById).not.toHaveBeenCalled();
    });

    it('프롬프트 원문과 응답을 함께 준다', async () => {
      const detail = {
        id: 1,
        model: 'gpt-4.1-mini',
        systemPrompt: '규칙...',
        userPrompt: '수업 시간?',
        response: '{"answered":true}'
      };
      LlmCallLog.getById.mockResolvedValue(detail);
      const res = mockRes();

      await getLlmLogDetail({ user: admin, params: { id: '1' } }, res);

      expect(res.json).toHaveBeenCalledWith(detail);
    });

    it('없는 이력은 404 를 준다', async () => {
      LlmCallLog.getById.mockResolvedValue(null);
      const res = mockRes();

      await getLlmLogDetail({ user: admin, params: { id: '9' } }, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('잘못된 ID 는 400 을 준다', async () => {
      const res = mockRes();

      await getLlmLogDetail({ user: admin, params: { id: 'abc' } }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(LlmCallLog.getById).not.toHaveBeenCalled();
    });
  });
});
