import ChatChannel, { DEFAULT_FALLBACK, DEFAULT_PENDING } from '../models/ChatChannel.js';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Faq from '../models/Faq.js';
import { generateAnswer } from '../utils/aiAnswer.js';

export const MESSAGE_MAX = 500;
export const VISITOR_NAME_MAX = 20;
const HISTORY_TURNS = 6;
const SUGGESTED_COUNT = 3;
const DAILY_LIMIT = Number(process.env.FAQ_CHAT_DAILY_LIMIT || 200);

const notFound = (res) => res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });

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
    const { name, greeting, fallbackMessage, pendingMessage, isActive, aiEnabled } = req.body;

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
      aiEnabled
    });

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
    const aiEnabled = channel.aiEnabled !== false;

    // 새 질문을 저장하기 전에 이전 맥락을 확보한다.
    const history = await ChatMessage.recentHistory(session.id, HISTORY_TURNS);
    await ChatMessage.create(session.id, { role: 'parent', content: question });

    // AI 자동 답변을 꺼두면 호출하지 않고 접수 안내만 남긴다 (관리자가 직접 답변)
    if (!aiEnabled) {
      const pending = channel.pendingMessage || DEFAULT_PENDING;
      const savedPending = await ChatMessage.create(session.id, {
        role: 'bot',
        content: pending,
        answered: false,
        matchedFaqIds: [],
        status: 'ai_off'
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
