import ChatChannel, { DEFAULT_FALLBACK, DEFAULT_PENDING } from '../models/ChatChannel.js';
import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Faq from '../models/Faq.js';
import { generateAnswer } from '../utils/aiAnswer.js';
import { getAiConfig } from '../utils/aiSettings.js';
import LlmCallLog from '../models/LlmCallLog.js';
import { sendFaqInquiryKakaoMessage } from '../utils/kakaoMessage.js';
import { isAdminViewing } from '../utils/chatPresence.js';

export const MESSAGE_MAX = 500;
export const VISITOR_NAME_MAX = 20;
const HISTORY_TURNS = 6;
const SUGGESTED_COUNT = 3;
const DAILY_LIMIT = Number(process.env.FAQ_CHAT_DAILY_LIMIT || 200);

const notFound = (res) => res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });

/**
 * 학부모가 보낸 메시지를 채널 주인에게 카카오톡으로 알린다.
 *
 * 첫 질문뿐 아니라 이어지는 메시지도 매번 알린다 — 선생님이 대화 중간의
 * 추가 질문을 놓치면 학부모는 답을 받지 못한 채 기다리게 된다.
 * 학부모 답변을 막으면 안 되므로 어떤 실패도 밖으로 던지지 않는다.
 */
const notifyNewInquiry = async ({ channel, session, question, isFollowUp }) => {
  try {
    if (channel.kakaoNotify === false) return;

    const result = await sendFaqInquiryKakaoMessage({
      userId: channel.userId,
      channelName: channel.name,
      visitorName: session.visitorName,
      question,
      isFollowUp
    });

    // 마지막으로 알림이 나간 시각을 남긴다 (알림이 왜 안 왔는지 추적용).
    if (result?.success) {
      await ChatSession.recordKakaoNotified(session.id);
    }
  } catch (error) {
    console.error('FAQ 문의 알림 처리 오류:', error);
  }
};

// 답을 못 찾았을 때 보여줄 추천 질문. 학부모 화면에서 눌러 바로 물어볼 수 있다.
const toSuggestions = (ids, faqs) => {
  const byId = new Map(faqs.map((f) => [f.id, f]));
  return (ids || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((f) => ({ id: f.id, question: f.question }));
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

    // 추천 질문은 지금 공개된 FAQ 기준으로 다시 확인한다 (그 사이 지워졌을 수 있다).
    const faqs = await Faq.getPublishedByUserId(channel.userId);

    res.json({
      visitorName: session.visitorName,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        answered: m.answered,
        suggestions: toSuggestions(m.suggestedFaqIds, faqs),
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

    // 학부모 메시지는 올 때마다 알린다. 카카오 왕복만큼 답변이 늦어지지 않도록
    // 여기서는 시작만 하고 응답 직전에 기다린다 (실패해도 던지지 않는 함수라 안전하다).
    // 관리자가 보고 있으면 이미 확인 중이므로 그때만 건너뛴다.
    const notifying = adminViewing
      ? null
      : notifyNewInquiry({ channel, session, question, isFollowUp: history.length > 0 });

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
      await notifying;

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
    // 제공자·모델·추론 강도·대기 시간은 모두 관리자 설정(설정 > AI)이 정한다.
    // 고른 제공자의 키가 이 환경에 없으면 키가 있는 쪽으로 넘어간다.
    const aiConfig = await getAiConfig();
    const result = await generateAnswer({ faqs, history, question, ...aiConfig });

    // 호출 이력을 남긴다. 이력 저장이 실패해도 학부모 답변은 그대로 나가야 한다.
    LlmCallLog.create({
      userId: channel.userId,
      sessionId: session.id,
      visitorName: session.visitorName,
      promptId: result.promptId,
      provider: result.provider,
      model: result.model,
      status: result.status,
      answered: result.answered,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      latencyMs: result.latencyMs ?? null,
      systemPrompt: result.systemPrompt ?? null,
      userPrompt: result.userPrompt ?? question,
      response: result.rawResponse ?? null,
      errorMessage: result.errorMessage ?? null
    }).catch((error) => console.error('AI 호출 이력 저장 실패:', error?.message || error));

    const suggestions = result.answered ? [] : toSuggestions(result.suggestedFaqIds, faqs);

    // 최종 문구는 서버가 결정한다. answered=false 면 AI 문장을 쓰지 않는다.
    // 추천할 질문이 있으면 사과 문구를 건너뛰고 추천만 보여준다.
    // ("찾지 못했습니다" 와 추천을 함께 보여주면 학부모가 실패로 읽고 대화를 접는다)
    const reply = result.answered
      ? result.answer
      : suggestions.length > 0
      ? ''
      : fallback;

    const saved = await ChatMessage.create(session.id, {
      role: 'bot',
      content: reply,
      answered: result.answered,
      matchedFaqIds: result.usedFaqIds,
      suggestedFaqIds: result.suggestedFaqIds,
      status: result.status,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      latencyMs: result.latencyMs ?? null
    });

    await ChatSession.recordMessages(session.id, { unanswered: !result.answered });
    await notifying;

    res.json({
      answered: result.answered,
      reply,
      matchedFaqIds: result.usedFaqIds,
      suggestions,
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
        editedAt: m.editedAt,
        matchedFaqs: (m.matchedFaqIds || [])
          .filter((id) => faqMap.has(id))
          .map((id) => ({ id, question: faqMap.get(id) })),
        // 답을 못 찾아 추천만 보여준 경우, 선생님도 무엇을 추천했는지 볼 수 있어야 한다.
        suggestedFaqs: (m.suggestedFaqIds || [])
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

/**
 * 우리 쪽이 내보낸 답변(내 답변·AI 답변)의 내용을 고친다.
 *
 * 학부모 질문은 고칠 수 없다 — 상대가 하지 않은 말이 상대 이름으로 남는다.
 * 고친 내용은 "(수정됨)" 으로 표시해 원문 그대로가 아님을 남긴다.
 */
export const updateMessage = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: '답변 내용을 입력해주세요.' });
    }
    if (message.trim().length > MESSAGE_MAX) {
      return res.status(400).json({ error: `답변은 ${MESSAGE_MAX}자 이내로 입력해주세요.` });
    }

    const target = await ChatMessage.getWithOwner(req.params.messageId);

    if (
      !target ||
      String(target.sessionId) !== String(req.params.id) ||
      (role !== 'admin' && target.ownerUserId !== userId)
    ) {
      return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    }

    if (target.role !== 'admin' && target.role !== 'bot') {
      return res.status(400).json({ error: '학부모가 보낸 질문은 수정할 수 없습니다.' });
    }

    // AI 답변을 사람이 고쳤다면 그 질문은 처리된 것이므로 미답변에서 뺀다.
    const markAnswered = target.role === 'bot';
    const updated = await ChatMessage.updateContent(target.id, message.trim(), { markAnswered });

    if (markAnswered) {
      await ChatSession.recount(target.sessionId);
    }

    res.json({
      id: updated.id,
      role: updated.role,
      content: updated.content,
      answered: updated.answered,
      editedAt: updated.editedAt,
      createdAt: updated.createdAt
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
