import ChatChannel, { DEFAULT_FALLBACK, DEFAULT_PENDING } from '../models/ChatChannel.js';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Faq from '../models/Faq.js';
import { generateAnswer } from '../utils/aiAnswer.js';
import { sendFaqInquiryKakaoMessage } from '../utils/kakaoMessage.js';
import { isAdminViewing, isKakaoNotifyCooling } from '../utils/chatPresence.js';

export const MESSAGE_MAX = 500;
export const VISITOR_NAME_MAX = 20;
const HISTORY_TURNS = 6;
const SUGGESTED_COUNT = 3;
const DAILY_LIMIT = Number(process.env.FAQ_CHAT_DAILY_LIMIT || 200);

const notFound = (res) => res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });

/**
 * 새 문의를 채널 주인에게 카카오톡으로 알린다.
 *
 * 학부모 답변을 막으면 안 되므로 어떤 실패도 밖으로 던지지 않는다.
 * 연속 질문에 알림이 쏟아지지 않도록 대화 단위 쿨다운을 둔다.
 */
const notifyNewInquiry = async ({ channel, session, question }) => {
  try {
    if (channel.kakaoNotify === false) return;
    if (isKakaoNotifyCooling(session.kakaoNotifiedAt)) return;

    const result = await sendFaqInquiryKakaoMessage({
      userId: channel.userId,
      channelName: channel.name,
      visitorName: session.visitorName,
      question
    });

    // 토큰이 없어 건너뛴 경우는 쿨다운을 걸지 않는다 (나중에 연동하면 바로 받도록).
    if (result?.success) {
      await ChatSession.recordKakaoNotified(session.id);
    }
  } catch (error) {
    console.error('FAQ 문의 알림 처리 오류:', error);
  }
};

/* ─────────── 관리자: 채널 ─────────── */

export const getChannel = async (req, res) => {
  try {
    const { id: userId, username } = req.user;
    const channel = await ChatChannel.getOrCreate(userId, username);
    const faqCount = await Faq.countPublished(userId);

    res.json({ ...channel, faqCount });
  } catch (error) {
    console.error('채팅 채널 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const updateChannel = async (req, res) => {
  try {
    const { id: userId, username } = req.user;
    const { name, greeting, fallbackMessage, pendingMessage, isActive, aiEnabled, kakaoNotify } =
      req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '채팅창 이름을 입력해주세요.' });
    }

    await ChatChannel.getOrCreate(userId, username);
    const channel = await ChatChannel.update(userId, {
      name: name.trim(),
      greeting: (greeting || '').trim(),
      fallbackMessage: (fallbackMessage || '').trim() || DEFAULT_FALLBACK,
      pendingMessage: (pendingMessage || '').trim() || DEFAULT_PENDING,
      isActive,
      aiEnabled,
      kakaoNotify
    });

    res.json(channel);
  } catch (error) {
    console.error('채팅 채널 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 대화 내역 화면의 AI 자동 답변 토글 (다른 설정은 건드리지 않는다)
export const updateAiEnabled = async (req, res) => {
  try {
    const { id: userId, username } = req.user;
    const { aiEnabled } = req.body;

    if (typeof aiEnabled !== 'boolean') {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    await ChatChannel.getOrCreate(userId, username);
    const channel = await ChatChannel.setAiEnabled(userId, aiEnabled);

    res.json(channel);
  } catch (error) {
    console.error('채팅 채널 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/* ─────────── 학부모: 공개 채팅 ─────────── */

export const getPublicChannel = async (req, res) => {
  try {
    const channel = await ChatChannel.getByPublicId(req.params.publicId);
    if (!channel || !channel.isActive) return notFound(res);

    const faqs = await Faq.getPublishedByUserId(channel.userId);

    // 소유자 정보(userId, username)는 노출하지 않는다.
    res.json({
      name: channel.name,
      greeting: channel.greeting,
      isActive: channel.isActive,
      aiEnabled: channel.aiEnabled !== false,
      hasFaq: faqs.length > 0,
      suggestedQuestions: faqs.slice(0, SUGGESTED_COUNT).map((f) => f.question)
    });
  } catch (error) {
    console.error('공개 채팅 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const startSession = async (req, res) => {
  try {
    const { visitorKey, visitorName } = req.body;

    if (!visitorKey) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!visitorName || !visitorName.trim()) {
      return res.status(400).json({ error: '대화명을 입력해주세요.' });
    }
    if (visitorName.trim().length > VISITOR_NAME_MAX) {
      return res.status(400).json({ error: `대화명은 ${VISITOR_NAME_MAX}자 이내로 입력해주세요.` });
    }

    const channel = await ChatChannel.getByPublicId(req.params.publicId);
    if (!channel || !channel.isActive) return notFound(res);

    const session = await ChatSession.upsert(channel.id, visitorKey, visitorName.trim());

    res.json({ visitorName: session.visitorName, startedAt: session.createdAt });
  } catch (error) {
    console.error('공개 채팅 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getPublicMessages = async (req, res) => {
  try {
    const { visitorKey } = req.query;
    if (!visitorKey) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const channel = await ChatChannel.getByPublicId(req.params.publicId);
    if (!channel || !channel.isActive) return notFound(res);

    const session = await ChatSession.getByVisitorKey(channel.id, visitorKey);
    if (!session) return res.json({ visitorName: null, messages: [] });

    const messages = await ChatMessage.listBySession(session.id, 50);

    res.json({
      visitorName: session.visitorName,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        answered: m.answered,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('공개 채팅 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const postMessage = async (req, res) => {
  try {
    const { visitorKey, message } = req.body;

    if (!visitorKey) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!message || !message.trim()) return res.status(400).json({ error: '질문을 입력해주세요.' });
    if (message.trim().length > MESSAGE_MAX) {
      return res.status(400).json({ error: `질문은 ${MESSAGE_MAX}자 이내로 입력해주세요.` });
    }

    const channel = await ChatChannel.getByPublicId(req.params.publicId);
    if (!channel || !channel.isActive) return notFound(res);

    const session = await ChatSession.getByVisitorKey(channel.id, visitorKey);
    if (!session) return res.status(400).json({ error: '대화명을 먼저 입력해주세요.' });

    const todayCount = await ChatSession.countTodayQuestions(channel.id);
    if (todayCount >= DAILY_LIMIT) {
      return res.status(429).json({ error: '오늘 문의가 많아 잠시 후 이용 가능합니다.' });
    }

    const question = message.trim();
    const fallback = channel.fallbackMessage || DEFAULT_FALLBACK;

    // 채널 전체 설정과 이 대화의 설정 중 하나라도 꺼져 있으면 AI 를 쓰지 않는다.
    const channelAiEnabled = channel.aiEnabled !== false;
    const sessionAiEnabled = session.aiEnabled !== false;
    const aiEnabled = channelAiEnabled && sessionAiEnabled;

    // 관리자가 이 대화창을 열어두고 있으면 AI 가 끼어들지 않고 직접 답변하도록 둔다.
    const adminViewing = isAdminViewing(session.adminViewingAt);

    // 새 질문을 저장하기 전에 이전 맥락을 확보한다.
    const history = await ChatMessage.recentHistory(session.id, HISTORY_TURNS);
    await ChatMessage.create(session.id, { role: 'parent', content: question });

    // 관리자가 보고 있으면 알림은 불필요하므로 그때만 건너뛴다.
    if (!adminViewing) {
      await notifyNewInquiry({ channel, session, question });
    }

    // AI 자동 답변이 꺼져 있거나 관리자가 대화창을 보고 있으면
    // AI 를 호출하지 않고 접수 안내만 남긴다 (관리자가 직접 답변).
    if (!aiEnabled || adminViewing) {
      const pending = channel.pendingMessage || DEFAULT_PENDING;
      const savedPending = await ChatMessage.create(session.id, {
        role: 'bot',
        content: pending,
        answered: false,
        matchedFaqIds: [],
        status: adminViewing
          ? 'admin_viewing'
          : channelAiEnabled
          ? 'session_ai_off'
          : 'ai_off'
      });

      await ChatSession.recordMessages(session.id, { unanswered: true });

      return res.json({
        answered: false,
        pending: true,
        reply: pending,
        matchedFaqIds: [],
        messageId: savedPending.id,
        createdAt: savedPending.createdAt
      });
    }

    const faqs = await Faq.getPublishedByUserId(channel.userId);
    const result = await generateAnswer({ faqs, history, question });

    // 최종 문구는 서버가 결정한다. answered=false 면 AI 문장을 쓰지 않는다.
    const reply = result.answered ? result.answer : fallback;

    const saved = await ChatMessage.create(session.id, {
      role: 'bot',
      content: reply,
      answered: result.answered,
      matchedFaqIds: result.usedFaqIds,
      status: result.status,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      latencyMs: result.latencyMs ?? null
    });

    await ChatSession.recordMessages(session.id, { unanswered: !result.answered });

    res.json({
      answered: result.answered,
      reply,
      matchedFaqIds: result.usedFaqIds,
      messageId: saved.id,
      createdAt: saved.createdAt
    });
  } catch (error) {
    console.error('공개 채팅 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/* ─────────── 관리자: 대화 내역 ─────────── */

export const getSessions = async (req, res) => {
  try {
    const { id: userId, role, username } = req.user;
    const { unansweredOnly, startDate, endDate, limit, offset, filterUserId } = req.query;

    let targetUserId = userId;
    if (role === 'admin' && filterUserId && filterUserId !== 'all') {
      const parsed = parseInt(filterUserId, 10);
      if (isNaN(parsed)) return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      targetUserId = parsed;
    }

    const channel =
      targetUserId === userId
        ? await ChatChannel.getOrCreate(userId, username)
        : await ChatChannel.getByUserId(targetUserId);

    if (!channel) return res.json({ total: 0, sessions: [] });

    const { total, sessions } = await ChatSession.listByChannel(channel.id, {
      unansweredOnly: unansweredOnly === 'true',
      startDate,
      endDate,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      offset: parseInt(offset, 10) || 0
    });

    res.json({ total, sessions });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getSessionMessages = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const session = await ChatSession.getWithOwner(req.params.id);

    // 존재 여부를 숨기기 위해 권한 없음도 404 로 응답한다.
    if (!session || (role !== 'admin' && session.ownerUserId !== userId)) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const messages = await ChatMessage.listBySession(session.id);
    const faqs = await Faq.getAll(session.ownerUserId, 'user', {});
    const faqMap = new Map(faqs.map((f) => [f.id, f.question]));

    res.json({
      session: {
        id: session.id,
        visitorName: session.visitorName,
        messageCount: session.messageCount,
        unansweredCount: session.unansweredCount,
        aiEnabled: session.aiEnabled !== false,
        createdAt: session.createdAt,
        lastMessageAt: session.lastMessageAt
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        answered: m.answered,
        status: m.status,
        createdAt: m.createdAt,
        matchedFaqs: (m.matchedFaqIds || [])
          .filter((id) => faqMap.has(id))
          .map((id) => ({ id, question: faqMap.get(id) }))
      }))
    });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 관리자가 대화창을 열어둔 동안 주기적으로 호출된다.
 * presence 가 살아있는 동안 그 대화에는 AI 자동 답변이 나가지 않는다.
 */
export const setAdminViewing = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { active } = req.body;

    const session = await ChatSession.getWithOwner(req.params.id);
    if (!session || (role !== 'admin' && session.ownerUserId !== userId)) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const updated = await ChatSession.setAdminViewing(session.id, active !== false);

    res.json({ adminViewingAt: updated ? updated.adminViewingAt : null });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 이 대화에서만 AI 자동 답변을 끄고 켠다 (채널 전체 설정과 별개).
 */
export const setSessionAi = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { aiEnabled } = req.body;

    if (typeof aiEnabled !== 'boolean') {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    const session = await ChatSession.getWithOwner(req.params.id);
    if (!session || (role !== 'admin' && session.ownerUserId !== userId)) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const updated = await ChatSession.setAiEnabled(session.id, aiEnabled);

    res.json({ aiEnabled: updated ? updated.aiEnabled !== false : aiEnabled });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 대화 안의 메시지 한 건을 지운다.
 * 대화 전체 삭제(deleteSession)와 같은 권한 기준을 쓴다.
 */
export const deleteMessage = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    const message = await ChatMessage.getWithOwner(req.params.messageId);

    // 다른 대화의 메시지 id 를 끼워 넣어도 통하지 않도록 대화 번호까지 확인한다.
    if (
      !message ||
      String(message.sessionId) !== String(req.params.id) ||
      (role !== 'admin' && message.ownerUserId !== userId)
    ) {
      return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    }

    await ChatMessage.delete(message.id);

    // 지운 뒤 메시지 수·미답변 수를 다시 계산한다.
    const session = await ChatSession.recount(message.sessionId);

    res.json({
      message: '메시지가 삭제되었습니다.',
      session: session
        ? {
            id: session.id,
            messageCount: session.messageCount,
            unansweredCount: session.unansweredCount
          }
        : null
    });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const replyToSession = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '답변 내용을 입력해주세요.' });
    }
    if (message.trim().length > MESSAGE_MAX) {
      return res.status(400).json({ error: `답변은 ${MESSAGE_MAX}자 이내로 입력해주세요.` });
    }

    const session = await ChatSession.getWithOwner(req.params.id);
    if (!session || (role !== 'admin' && session.ownerUserId !== userId)) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    const saved = await ChatMessage.create(session.id, {
      role: 'admin',
      content: message.trim(),
      answered: true,
      status: 'ok'
    });

    await ChatSession.recordAdminReply(session.id);

    res.status(201).json({
      id: saved.id,
      role: 'admin',
      content: saved.content,
      createdAt: saved.createdAt
    });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const session = await ChatSession.getWithOwner(req.params.id);

    if (!session || (role !== 'admin' && session.ownerUserId !== userId)) {
      return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
    }

    await ChatSession.delete(session.id);
    res.json({ message: '대화가 삭제되었습니다.' });
  } catch (error) {
    console.error('대화 내역 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
