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
    setAdminViewing: jest.fn(),
    setAiEnabled: jest.fn(),
    recount: jest.fn(),
    recordKakaoNotified: jest.fn(),
    delete: jest.fn()
  }
}));

jest.unstable_mockModule('../../utils/kakaoMessage.js', () => ({
  sendFaqInquiryKakaoMessage: jest.fn()
}));

jest.unstable_mockModule('../../models/ChatMessage.js', () => ({
  default: {
    create: jest.fn(),
    listBySession: jest.fn(),
    recentHistory: jest.fn(),
    getWithOwner: jest.fn(),
    updateContent: jest.fn(),
    delete: jest.fn()
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

// 제공자 설정은 DB를 읽으므로 테스트에서는 기본값을 돌려주도록 대체한다.
jest.unstable_mockModule('../../utils/aiSettings.js', () => ({
  getSelectedProvider: jest.fn().mockResolvedValue('gemini'),
  getEffectiveProvider: jest.fn().mockResolvedValue('gemini'),
  setSelectedProvider: jest.fn()
}));

const ChatChannel = (await import('../../models/ChatChannel.js')).default;
const ChatSession = (await import('../../models/ChatSession.js')).default;
const ChatMessage = (await import('../../models/ChatMessage.js')).default;
const Faq = (await import('../../models/Faq.js')).default;
const { generateAnswer } = await import('../../utils/aiAnswer.js');
const { sendFaqInquiryKakaoMessage } = await import('../../utils/kakaoMessage.js');
const {
  getPublicChannel,
  startSession,
  postMessage,
  getSessionMessages,
  setAdminViewing,
  setSessionAi,
  deleteMessage,
  updateMessage,
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
  aiEnabled: true,
  kakaoNotify: true
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
      sendFaqInquiryKakaoMessage.mockResolvedValue({ success: true });
      ChatSession.recordKakaoNotified.mockResolvedValue({});
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

    it('관리자가 대화창을 보고 있으면 AI 가 답하지 않고 접수 안내만 남긴다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        adminViewingAt: new Date().toISOString()
      });
      ChatMessage.create.mockResolvedValue({ id: 300, createdAt: 'now' });
      req.body = { visitorKey: 'v1', message: '지금 계신가요?' };

      await postMessage(req, res);

      expect(generateAnswer).not.toHaveBeenCalled();

      const payload = res.json.mock.calls[0][0];
      expect(payload.pending).toBe(true);
      expect(payload.reply).toBe(activeChannel.pendingMessage);
      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ role: 'bot', status: 'admin_viewing' })
      );
    });

    it('관리자 접속이 오래 전이면 AI 가 정상 답변한다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        adminViewingAt: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      });
      generateAnswer.mockResolvedValue({
        answered: true,
        answer: '오전 10시입니다.',
        usedFaqIds: [3],
        status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '수업 시간은?' };

      await postMessage(req, res);

      expect(generateAnswer).toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].answered).toBe(true);
    });

    it('새 문의가 들어오면 채널 주인에게 카카오 알림을 보낸다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({ id: 11, visitorName: '민수 어머니' });
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '주차 가능한가요?' };

      await postMessage(req, res);

      expect(sendFaqInquiryKakaoMessage).toHaveBeenCalledWith({
        userId: activeChannel.userId,
        channelName: activeChannel.name,
        visitorName: '민수 어머니',
        question: '주차 가능한가요?'
      });
      expect(ChatSession.recordKakaoNotified).toHaveBeenCalledWith(11);
    });

    it('알림을 끈 채널에는 카카오 알림을 보내지 않는다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue({ ...activeChannel, kakaoNotify: false });
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(sendFaqInquiryKakaoMessage).not.toHaveBeenCalled();
    });

    it('쿨다운 안이면 연속 질문에 카카오 알림을 다시 보내지 않는다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        kakaoNotifiedAt: new Date().toISOString()
      });
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '하나 더 질문이요' };

      await postMessage(req, res);

      expect(sendFaqInquiryKakaoMessage).not.toHaveBeenCalled();
    });

    it('관리자가 보고 있으면 이미 확인 중이므로 카카오 알림을 보내지 않는다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        adminViewingAt: new Date().toISOString()
      });
      ChatMessage.create.mockResolvedValue({ id: 301, createdAt: 'now' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(sendFaqInquiryKakaoMessage).not.toHaveBeenCalled();
    });

    it('카카오 알림이 실패해도 학부모 답변은 정상 응답한다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({ id: 11, visitorName: '학부모' });
      sendFaqInquiryKakaoMessage.mockRejectedValue(new Error('kakao down'));
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].answered).toBe(true);
      expect(ChatSession.recordKakaoNotified).not.toHaveBeenCalled();
    });

    it('카카오 알림이 건너뛰어졌으면 쿨다운을 걸지 않는다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({ id: 11, visitorName: '학부모' });
      sendFaqInquiryKakaoMessage.mockResolvedValue({ success: false, skipped: true });
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(ChatSession.recordKakaoNotified).not.toHaveBeenCalled();
    });

    it('이 대화의 AI 답변을 꺼두면 AI를 호출하지 않는다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        aiEnabled: false
      });
      ChatMessage.create.mockResolvedValue({ id: 400, createdAt: 'now' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(generateAnswer).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].pending).toBe(true);
      // 채널은 켜져 있으므로 대화 단위로 껐다는 것을 구분해 남긴다
      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ role: 'bot', status: 'session_ai_off' })
      );
    });

    it('채널 전체가 꺼져 있으면 ai_off 로 남긴다', async () => {
      ChatChannel.getByPublicId.mockResolvedValue({ ...activeChannel, aiEnabled: false });
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        aiEnabled: false
      });
      ChatMessage.create.mockResolvedValue({ id: 401, createdAt: 'now' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ status: 'ai_off' })
      );
    });

    it('대화별 설정이 켜져 있으면 평소대로 AI가 답한다', async () => {
      ChatSession.getByVisitorKey.mockResolvedValue({
        id: 11,
        visitorName: '학부모',
        aiEnabled: true
      });
      generateAnswer.mockResolvedValue({ answered: true, answer: 'ok', usedFaqIds: [3], status: 'ok' });
      req.body = { visitorKey: 'v1', message: '질문' };

      await postMessage(req, res);

      expect(generateAnswer).toHaveBeenCalled();
    });

    it('답을 못 찾으면 가까운 FAQ 를 추천으로 함께 내려준다', async () => {
      Faq.getPublishedByUserId.mockResolvedValue([
        { id: 3, question: '수업 시간이 어떻게 되나요?', answer: '오전 10시' },
        { id: 4, question: '수업료는 얼마인가요?', answer: '월 15만원' }
      ]);
      generateAnswer.mockResolvedValue({
        answered: false,
        answer: '',
        usedFaqIds: [],
        suggestedFaqIds: [3, 4],
        status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '수업' };

      await postMessage(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.answered).toBe(false);
      expect(payload.suggestions).toEqual([
        { id: 3, question: '수업 시간이 어떻게 되나요?' },
        { id: 4, question: '수업료는 얼마인가요?' }
      ]);
    });

    it('추천을 메시지에 저장해 새로고침해도 남아 있게 한다', async () => {
      Faq.getPublishedByUserId.mockResolvedValue([{ id: 3, question: 'Q3', answer: 'A3' }]);
      generateAnswer.mockResolvedValue({
        answered: false, answer: '', usedFaqIds: [], suggestedFaqIds: [3], status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '수업' };

      await postMessage(req, res);

      expect(ChatMessage.create).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ role: 'bot', suggestedFaqIds: [3] })
      );
    });

    it('답을 찾았으면 추천을 내려주지 않는다', async () => {
      generateAnswer.mockResolvedValue({
        answered: true, answer: '오전 10시', usedFaqIds: [3], suggestedFaqIds: [], status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '수업 시간?' };

      await postMessage(req, res);

      expect(res.json.mock.calls[0][0].suggestions).toEqual([]);
    });

    it('지워진 FAQ 는 추천에서 빠진다', async () => {
      Faq.getPublishedByUserId.mockResolvedValue([{ id: 3, question: 'Q3', answer: 'A3' }]);
      generateAnswer.mockResolvedValue({
        answered: false, answer: '', usedFaqIds: [], suggestedFaqIds: [3, 99], status: 'ok'
      });
      req.body = { visitorKey: 'v1', message: '수업' };

      await postMessage(req, res);

      expect(res.json.mock.calls[0][0].suggestions).toEqual([{ id: 3, question: 'Q3' }]);
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

  describe('setSessionAi', () => {
    beforeEach(() => {
      req.params = { id: '5' };
      req.body = { aiEnabled: false };
    });

    it('다른 사용자의 대화는 바꿀 수 없다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 5, ownerUserId: 99 });

      await setSessionAi(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatSession.setAiEnabled).not.toHaveBeenCalled();
    });

    it('불리언이 아니면 400 을 반환한다', async () => {
      req.body = { aiEnabled: 'false' };

      await setSessionAi(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ChatSession.setAiEnabled).not.toHaveBeenCalled();
    });

    it('이 대화의 AI 답변만 끈다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 5, ownerUserId: 7 });
      ChatSession.setAiEnabled.mockResolvedValue({ id: 5, aiEnabled: false });

      await setSessionAi(req, res);

      expect(ChatSession.setAiEnabled).toHaveBeenCalledWith(5, false);
      expect(res.json).toHaveBeenCalledWith({ aiEnabled: false });
    });
  });

  describe('updateMessage', () => {
    beforeEach(() => {
      req.params = { id: '5', messageId: '77' };
      req.body = { message: '수정한 답변' };
      ChatMessage.updateContent.mockResolvedValue({
        id: 77,
        role: 'admin',
        content: '수정한 답변',
        editedAt: 'now',
        createdAt: 'before'
      });
    });

    it('빈 내용은 400 을 반환한다', async () => {
      req.body = { message: '   ' };

      await updateMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ChatMessage.updateContent).not.toHaveBeenCalled();
    });

    it('500자를 넘으면 400 을 반환한다', async () => {
      req.body = { message: 'ㄱ'.repeat(501) };

      await updateMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ChatMessage.updateContent).not.toHaveBeenCalled();
    });

    it('다른 사용자의 메시지는 수정할 수 없다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 99, role: 'admin'
      });

      await updateMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.updateContent).not.toHaveBeenCalled();
    });

    it('다른 대화의 메시지 번호를 끼워 넣으면 거부한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 6, ownerUserId: 7, role: 'admin'
      });

      await updateMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.updateContent).not.toHaveBeenCalled();
    });

    it('학부모 질문은 수정할 수 없다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 7, role: 'parent'
      });

      await updateMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '학부모가 보낸 질문은 수정할 수 없습니다.' });
      expect(ChatMessage.updateContent).not.toHaveBeenCalled();
    });

    it('내가 보낸 답변은 고치고 수정 시각을 남긴다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 7, role: 'admin'
      });

      await updateMessage(req, res);

      expect(ChatMessage.updateContent).toHaveBeenCalledWith(77, '수정한 답변', {
        markAnswered: false
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ content: '수정한 답변', editedAt: 'now' })
      );
      // 내 답변 수정은 집계에 영향이 없다
      expect(ChatSession.recount).not.toHaveBeenCalled();
    });

    it('AI 답변도 수정할 수 있다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 7, role: 'bot'
      });

      await updateMessage(req, res);

      expect(ChatMessage.updateContent).toHaveBeenCalledWith(77, '수정한 답변', {
        markAnswered: true
      });
    });

    it('AI 답변을 고치면 미답변에서 빠지도록 집계를 다시 계산한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 7, role: 'bot'
      });

      await updateMessage(req, res);

      expect(ChatSession.recount).toHaveBeenCalledWith(5);
    });

    it('앞뒤 공백은 잘라서 저장한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({
        id: 77, sessionId: 5, ownerUserId: 7, role: 'admin'
      });
      req.body = { message: '  수정한 답변  ' };

      await updateMessage(req, res);

      expect(ChatMessage.updateContent).toHaveBeenCalledWith(77, '수정한 답변', {
        markAnswered: false
      });
    });
  });

  describe('deleteMessage', () => {
    beforeEach(() => {
      req.params = { id: '5', messageId: '77' };
      ChatSession.recount.mockResolvedValue({ id: 5, messageCount: 3, unansweredCount: 0 });
    });

    it('다른 사용자의 메시지는 지울 수 없다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({ id: 77, sessionId: 5, ownerUserId: 99 });

      await deleteMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.delete).not.toHaveBeenCalled();
    });

    it('없는 메시지는 404 를 반환한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue(null);

      await deleteMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.delete).not.toHaveBeenCalled();
    });

    it('다른 대화의 메시지 번호를 끼워 넣으면 거부한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({ id: 77, sessionId: 6, ownerUserId: 7 });

      await deleteMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatMessage.delete).not.toHaveBeenCalled();
    });

    it('본인 대화의 메시지를 지우고 집계를 다시 계산한다', async () => {
      ChatMessage.getWithOwner.mockResolvedValue({ id: 77, sessionId: 5, ownerUserId: 7 });

      await deleteMessage(req, res);

      expect(ChatMessage.delete).toHaveBeenCalledWith(77);
      expect(ChatSession.recount).toHaveBeenCalledWith(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          session: { id: 5, messageCount: 3, unansweredCount: 0 }
        })
      );
    });

    it('관리자는 다른 사용자의 대화 메시지도 지울 수 있다', async () => {
      req.user = { id: 1, role: 'admin' };
      ChatMessage.getWithOwner.mockResolvedValue({ id: 77, sessionId: 5, ownerUserId: 99 });

      await deleteMessage(req, res);

      expect(ChatMessage.delete).toHaveBeenCalledWith(77);
    });
  });

  describe('setAdminViewing', () => {
    it('다른 사용자의 대화에는 접속 상태를 남길 수 없다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 5, ownerUserId: 99 });
      req.params = { id: '5' };
      req.body = { active: true };

      await setAdminViewing(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ChatSession.setAdminViewing).not.toHaveBeenCalled();
    });

    it('대화창을 열면 접속 시각을 기록한다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 5, ownerUserId: 7 });
      ChatSession.setAdminViewing.mockResolvedValue({ id: 5, adminViewingAt: '2026-08-22T10:00:00.000Z' });
      req.params = { id: '5' };
      req.body = { active: true };

      await setAdminViewing(req, res);

      expect(ChatSession.setAdminViewing).toHaveBeenCalledWith(5, true);
      expect(res.json).toHaveBeenCalledWith({ adminViewingAt: '2026-08-22T10:00:00.000Z' });
    });

    it('대화창을 닫으면 접속 시각을 비운다', async () => {
      ChatSession.getWithOwner.mockResolvedValue({ id: 5, ownerUserId: 7 });
      ChatSession.setAdminViewing.mockResolvedValue({ id: 5, adminViewingAt: null });
      req.params = { id: '5' };
      req.body = { active: false };

      await setAdminViewing(req, res);

      expect(ChatSession.setAdminViewing).toHaveBeenCalledWith(5, false);
      expect(res.json).toHaveBeenCalledWith({ adminViewingAt: null });
    });
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
