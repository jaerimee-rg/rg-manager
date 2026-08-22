import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/ChatChannel.js', () => ({
  default: {
    getByPublicId: jest.fn(),
    getByUserId: jest.fn(),
    getOrCreate: jest.fn(),
    update: jest.fn()
  },
  DEFAULT_GREETING: '안녕하세요!',
  DEFAULT_FALLBACK: '기본 안내 문구',
  DEFAULT_PENDING: '기본 접수 문구'
}));

jest.unstable_mockModule('../../models/ChatSession.js', () => ({
  default: {
    getByVisitorKey: jest.fn(),
    upsert: jest.fn(),
    recordMessages: jest.fn(),
    recordAdminReply: jest.fn(),
    countTodayQuestions: jest.fn(),
    listByChannel: jest.fn(),
    getWithOwner: jest.fn(),
    delete: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/ChatMessage.js', () => ({
  default: {
    create: jest.fn(),
    listBySession: jest.fn(),
    recentHistory: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/Faq.js', () => ({
  default: {
    getPublishedByUserId: jest.fn(),
    countPublished: jest.fn(),
    getAll: jest.fn()
  }
}));

jest.unstable_mockModule('../../utils/aiAnswer.js', () => ({
  generateAnswer: jest.fn()
}));

const ChatChannel = (await import('../../models/ChatChannel.js')).default;
const ChatSession = (await import('../../models/ChatSession.js')).default;
const ChatMessage = (await import('../../models/ChatMessage.js')).default;
const Faq = (await import('../../models/Faq.js')).default;
const { generateAnswer } = await import('../../utils/aiAnswer.js');
const {
  getPublicChannel,
  startSession,
  postMessage,
  getSessionMessages,
  replyToSession,
  deleteSession
} = await import('../chatController.js');

const activeChannel = {
  id: 1,
  userId: 7,
  publicId: 'abc',
  name: '리듬체조 문의',
  greeting: '안녕하세요!',
  fallbackMessage: '등록된 FAQ에서 찾지 못했습니다.',
  pendingMessage: '접수되었습니다. 확인 후 답변드릴게요.',
  isActive: true,
  aiEnabled: true
};

describe('chatController (공개 채팅)', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, params: { publicId: 'abc' }, query: {}, user: { id: 7, role: 'user' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getPublicChannel', () => {
    it('소유자 정보를 노출하지 않는다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue(activeChannel);
      Faq.getPublishedByUserId.mockResolvedValue([{ id: 1, question: 'Q1' }]);

      await getPublicChannel(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.name).toBe('리듬체조 문의');
      expect(payload.hasFaq).toBe(true);
      expect(payload).not.toHaveProperty('userId');
      expect(payload).not.toHaveProperty('publicId');
    });

    it('없는 채널은 404 를 반환한다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue(null);

      await getPublicChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('비활성 채널은 404 를 반환한다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue({ ...activeChannel, isActive: false });

      await getPublicChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('startSession', () => {
    it('대화명이 없으면 400 을 반환한다', async () => {
      req.body = { visitorKey: 'v1', visitorName: '   ' };

      await startSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ChatSession.upsert).not.toHaveBeenCalled();
    });

    it('대화명이 20자를 넘으면 400 을 반환한다', async () => {
      req.body = { visitorKey: 'v1', visitorName: 'ㄱ'.repeat(21) };

      await startSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('정상 입력이면 세션을 만든다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue(activeChannel);
      ChatSession.upsert.mockResolvedValue({ visitorName: '김OO 어머님', createdAt: 'now' });
      req.body = { visitorKey: 'v1', visitorName: '  김OO 어머님  ' };

      await startSession(req, res);

      expect(ChatSession.upsert).toHaveBeenCalledWith(1, 'v1', '김OO 어머님');
      expect(res.json).toHaveBeenCalledWith({ visitorName: '김OO 어머님', startedAt: 'now' });
    });
  });

  describe('postMessage', () => {
    beforeEach(() => {
      ChatChannel.getByPublicId.mockResolvedValue(activeChannel);
      ChatSession.getByVisitorKey.mockResolvedValue({ id: 11 });
      ChatSession.countTodayQuestions.mockResolvedValue(0);
      ChatMessage.recentHistory.mockResolvedValue([]);
      ChatMessage.create.mockResolvedValue({ id: 100, createdAt: 'now' });
      ChatSession.recordMessages.mockResolvedValue({});
      Faq.getPublishedByUserId.mockResolvedValue([{ id: 3, question: 'Q', answer: 'A' }]);
    });

    it('500자를 넘으면 400 을 반환한다', async () => {
      req.body = { visitorKey: 'v1', message: 'ㄱ'.repeat(501) };

      await postMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it('세션(대화명)이 없으면 400 을 반환한다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue(null);
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '대화명을 먼저 입력해주세요.' });
    });

    it('일일 한도를 넘으면 429 를 반환한다', async () => {
      ChatSession.countTodayQuestions.mockResolvedValue(1000);
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(generateAnswer).not.toHaveBeenCalled();
    });

    it('답변을 찾으면 AI 답변을 그대로 전달한다', async () => {
      generateAnswer.mockResolvedValue({
        answered: true,
        answer: '오전 10시입니다.',
        usedFaqIds: [3],
        status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '토요일 수업 시간은?' };

      await postMessage(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.answered).toBe(true);
      expect(payload.reply).toBe('오전 10시입니다.');
      expect(payload.matchedFaqIds).toEqual([3]);
    });

    it('근거가 없으면 AI 문장 대신 채널 안내 문구를 내보낸다', async () => {
      generateAnswer.mockResolvedValue({
        answered: false,
        answer: '지어낸 답변',
        usedFaqIds: [],
        status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '모르는 질문' };

      await postMessage(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.answered).toBe(false);
      expect(payload.reply).toBe(activeChannel.fallbackMessage);
      expect(payload.reply).not.toContain('지어낸');
    });

    it('AI 호출이 실패해도 200 과 안내 문구로 응답한다', async () => {
      generateAnswer.mockResolvedValue({
        answered: false,
        answer: '',
        usedFaqIds: [],
        status: 'ai_error'
      });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].reply).toBe(activeChannel.fallbackMessage);
      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ role: 'bot', status: 'ai_error', answered: false })
      );
    });

    it('AI 자동 답변이 꺼져 있으면 AI를 호출하지 않고 접수 안내만 남긴다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue({ ...activeChannel, aiEnabled: false });
      ChatMessage.create.mockResolvedValue({ id: 200, createdAt: 'now' });
      req.body = { visitorKey: 'v1', message: '보강 되나요?' };

      await postMessage(req, res);

      expect(generateAnswer).not.toHaveBeenCalled();
      expect(Faq.getPublishedByUserId).not.toHaveBeenCalled();

      const payload = res.json.mock.calls[0][0];
      expect(payload.pending).toBe(true);
      expect(payload.answered).toBe(false);
      expect(payload.reply).toBe(activeChannel.pendingMessage);

      // 관리자가 답변해야 하므로 미답변으로 집계한다
      expect(ChatSession.recordMessages).toHaveBeenCalledWith(11, { unanswered: true });
      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ role: 'bot', status: 'ai_off' })
      );
    });

    it('질문 저장 전에 이전 대화 맥락을 읽는다', async () => {
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      const historyOrder = ChatMessage.recentHistory.mock.invocationCallOrder[0];
      const createOrder = ChatMessage.create.mock.invocationCallOrder[0];
      expect(historyOrder).toBeLessThan(createOrder);
    });
  });
});

describe('chatController (관리자 대화 조회)', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, params: { id: '11' }, query: {}, user: { id: 7, role: 'user' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('다른 사용자의 대화는 404 를 반환한다', async () => {
    ChatSession.getWithOwner.mockResolvedValue({ id: 11, ownerUserId: 99 });

    await getSessionMessages(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('본인 대화는 근거 FAQ 와 함께 반환한다', async () => {
    ChatSession.getWithOwner.mockResolvedValue({
      id: 11,
      ownerUserId: 7,
      visitorName: '김OO 어머님',
      messageCount: 2,
      unansweredCount: 0
    });
    ChatMessage.listBySession.mockResolvedValue([
      { id: 1, role: 'parent', content: '질문', matchedFaqIds: [], createdAt: 'now' },
      { id: 2, role: 'bot', content: '답변', answered: true, matchedFaqIds: [3], status: 'ok', createdAt: 'now' }
    ]);
    Faq.getAll.mockResolvedValue([{ id: 3, question: '토요일 수업은?' }]);

    await getSessionMessages(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.session.visitorName).toBe('김OO 어머님');
    expect(payload.messages[1].matchedFaqs).toEqual([{ id: 3, question: '토요일 수업은?' }]);
  });

  describe('replyToSession', () => {
    it('빈 답변은 400 을 반환한다', async () => {
      req.body = { message: '   ' };

      await replyToSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ChatMessage.create).not.toHaveBeenCalled();
    });

    it('500자를 넘는 답변은 400 을 반환한다', async () => {
      req.body = { message: 'ㄱ'.repeat(501) };

      await replyToSession(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('다른 사용자의 대화에는 답변할 수 없다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 11, ownerUserId: 99 });
      req.body = { message: '답변' };

      await replyToSession(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.create).not.toHaveBeenCalled();
    });

    it('본인 대화에는 admin 메시지를 남기고 미답변을 해제한다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 11, ownerUserId: 7 });
      ChatMessage.create.mockResolvedValue({ id: 55, content: '보강 가능합니다.', createdAt: 'now' });
      req.body = { message: '  보강 가능합니다.  ' };

      await replyToSession(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith(11, {
        role: 'admin',
        content: '보강 가능합니다.',
        answered: true,
        status: 'ok'
      });
      expect(ChatSession.recordAdminReply).toHaveBeenCalledWith(11);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        id: 55,
        role: 'admin',
        content: '보강 가능합니다.',
        createdAt: 'now'
      });
    });
  });

  it('다른 사용자의 대화는 삭제할 수 없다', async () => {
    ChatSession.getWithOwner.mockResolvedValue({ id: 11, ownerUserId: 99 });

    await deleteSession(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(ChatSession.delete).not.toHaveBeenCalled();
  });
});
