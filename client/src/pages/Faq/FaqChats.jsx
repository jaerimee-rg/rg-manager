import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import RichText from '../../components/common/RichText';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import DateRangePicker from '../../components/common/DateRangePicker';

const PAGE_SIZE = 20;

// 서버의 presence 유효 시간(45초)보다 짧게 보내 한 번 실패해도 끊기지 않게 한다.
const PRESENCE_INTERVAL_MS = 20000;
// 대화창을 열어둔 동안 새 질문을 바로 확인할 수 있도록 하는 갱신 주기
const THREAD_POLL_MS = 5000;

const formatDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const today = () => new Date().toISOString().split('T')[0];
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
};

function FaqChats({ filterUserId, onCountChange, channel, onToggleAi }) {
  const isMobile = useIsMobile();

  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [startDate, setStartDate] = useState(monthAgo());
  const [endDate, setEndDate] = useState(today());

  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [sessionAiSaving, setSessionAiSaving] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // 메시지 목록 스크롤 (데스크톱은 스레드 내부, 모바일은 시트 본문이 스크롤한다)
  const scrollRef = useRef(null);
  const sheetBodyRef = useRef(null);
  // 사용자가 위로 올려 지난 대화를 읽는 중이면 새 메시지가 와도 끌어내리지 않는다
  const stickToBottomRef = useRef(true);

  // 답변 전송 중에는 폴링이 끼어들지 않도록 최신 값을 ref 로 들고 있는다.
  const replyingRef = useRef(false);
  replyingRef.current = replying;

  const buildQuery = useCallback(
    (nextOffset) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset)
      });
      if (unansweredOnly) params.set('unansweredOnly', 'true');
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (filterUserId && filterUserId !== 'all') params.set('filterUserId', filterUserId);
      return params.toString();
    },
    [unansweredOnly, startDate, endDate, filterUserId]
  );

  const loadSessions = useCallback(
    async (nextOffset = 0, append = false) => {
      setLoading(true);
      try {
        const response = await fetchWithAuth(`/api/chat/sessions?${buildQuery(nextOffset)}`);
        const data = await response.json();
        setTotal(data.total || 0);
        setOffset(nextOffset);
        setSessions((prev) => (append ? [...prev, ...(data.sessions || [])] : data.sessions || []));

        if (unansweredOnly && onCountChange) onCountChange(data.total || 0);
      } catch (error) {
        console.error('대화 목록 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery, unansweredOnly, onCountChange]
  );

  useEffect(() => {
    loadSessions(0, false);
    setSelectedId(null);
    setThread(null);
  }, [loadSessions]);

  // 모바일 상세 시트가 열려 있는 동안 뒤 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const getScroller = useCallback(
    () => (isMobile ? sheetBodyRef.current : scrollRef.current),
    [isMobile]
  );

  const scrollToBottom = useCallback(() => {
    const el = getScroller();
    if (el) el.scrollTop = el.scrollHeight;
  }, [getScroller]);

  const handleScroll = () => {
    const el = getScroller();
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  };

  const loadThread = useCallback(async (sessionId) => {
    try {
      const response = await fetchWithAuth(`/api/chat/sessions/${sessionId}/messages`);

      // 다른 곳에서 삭제된 대화라면 선택을 풀어 폴링·presence 를 멈춘다.
      if (response.status === 404) {
        setThread(null);
        setSelectedId(null);
        setSheetOpen(false);
        return null;
      }

      if (!response.ok) return null;
      const data = await response.json();
      setThread(data);
      return data;
    } catch (error) {
      console.error('대화 상세 로드 실패:', error);
      return null;
    }
  }, []);

  // 모바일은 상세 시트가 열려 있을 때만 "보고 있는 중"으로 본다.
  const viewingSessionId = thread && (!isMobile || sheetOpen) ? thread.session.id : null;

  // 대화창을 열어둔 동안 서버에 presence 를 알린다 → 그동안 AI 자동 답변이 멈춘다.
  useEffect(() => {
    if (!viewingSessionId) return undefined;

    const ping = async (active) => {
      try {
        await fetchWithAuth(`/api/chat/sessions/${viewingSessionId}/viewing`, {
          method: 'POST',
          body: JSON.stringify({ active })
        });
      } catch (error) {
        console.error('대화 접속 상태 전송 실패:', error);
      }
    };

    ping(true);
    setAiPaused(true);

    const timer = setInterval(() => {
      // 다른 탭을 보고 있으면 자리를 비운 것으로 두어 AI 가 다시 답하게 한다.
      if (document.hidden) return;
      ping(true);
    }, PRESENCE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      setAiPaused(false);
      ping(false);
    };
  }, [viewingSessionId]);

  // 열어둔 대화에 새 질문이 들어오면 바로 보이도록 주기적으로 갱신한다.
  useEffect(() => {
    if (!viewingSessionId) return undefined;

    const timer = setInterval(() => {
      if (document.hidden || replyingRef.current) return;
      loadThread(viewingSessionId);
    }, THREAD_POLL_MS);

    return () => clearInterval(timer);
  }, [viewingSessionId, loadThread]);

  const openedSessionId = thread?.session?.id;
  const messageCount = thread?.messages?.length ?? 0;
  const prevCountRef = useRef(0);

  // 대화를 열면 항상 마지막 메시지가 보이도록 맨 아래에서 시작한다.
  useLayoutEffect(() => {
    if (!openedSessionId) return;
    stickToBottomRef.current = true;
    prevCountRef.current = 0;
    scrollToBottom();
  }, [openedSessionId, sheetOpen, isMobile, scrollToBottom]);

  // 폴링·답변으로 메시지가 늘어난 경우: 지난 대화를 읽는 중이면 방해하지 않는다.
  useLayoutEffect(() => {
    if (messageCount > prevCountRef.current && stickToBottomRef.current) {
      scrollToBottom();
    }
    prevCountRef.current = messageCount;
  }, [messageCount, scrollToBottom]);

  const handleReply = async (e) => {
    e.preventDefault();
    const message = reply.trim();
    if (!message || replying || !thread) return;

    setReplying(true);
    try {
      const response = await fetchWithAuth(`/api/chat/sessions/${thread.session.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message })
      });

      if (response.ok) {
        setReply('');
        stickToBottomRef.current = true;
        await loadThread(thread.session.id);
        await loadSessions(0, false);
      }
    } catch (error) {
      console.error('답변 전송 실패:', error);
    } finally {
      setReplying(false);
    }
  };

  const handleToggleAi = async (nextEnabled) => {
    if (!onToggleAi || aiSaving) return;

    setAiSaving(true);
    try {
      await onToggleAi(nextEnabled);
    } finally {
      setAiSaving(false);
    }
  };

  // 이 대화에서만 AI 자동 답변을 끈다 (채널 전체 설정과 별개)
  const handleToggleSessionAi = async (nextEnabled) => {
    if (!thread || sessionAiSaving) return;

    setSessionAiSaving(true);
    try {
      const response = await fetchWithAuth(`/api/chat/sessions/${thread.session.id}/ai`, {
        method: 'PUT',
        body: JSON.stringify({ aiEnabled: nextEnabled })
      });

      if (!response.ok) return;

      // 서버가 저장한 값으로 맞춘다.
      const data = await response.json();
      setThread((prev) =>
        prev ? { ...prev, session: { ...prev.session, aiEnabled: data.aiEnabled } } : prev
      );
    } catch (error) {
      console.error('대화별 AI 설정 실패:', error);
    } finally {
      setSessionAiSaving(false);
    }
  };

  const startEditMessage = (message) => {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const handleSaveMessage = async (messageId) => {
    const content = editDraft.trim();
    if (!thread || !content || savingEdit) return;

    setSavingEdit(true);
    try {
      const response = await fetchWithAuth(
        `/api/chat/sessions/${thread.session.id}/messages/${messageId}`,
        { method: 'PATCH', body: JSON.stringify({ message: content }) }
      );

      if (!response.ok) return;

      cancelEditMessage();
      await loadThread(thread.session.id);
      await loadSessions(0, false);
    } catch (error) {
      console.error('메시지 수정 실패:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!thread || !confirm('이 메시지를 삭제하시겠습니까?')) return;

    setDeletingMessageId(messageId);
    try {
      const response = await fetchWithAuth(
        `/api/chat/sessions/${thread.session.id}/messages/${messageId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) return;

      await loadThread(thread.session.id);
      await loadSessions(0, false);
    } catch (error) {
      console.error('메시지 삭제 실패:', error);
    } finally {
      setDeletingMessageId(null);
    }
  };

  const openSession = async (session) => {
    setSelectedId(session.id);
    setReply('');
    const data = await loadThread(session.id);
    if (data && isMobile) setSheetOpen(true);
  };

  const handleDelete = async (sessionId) => {
    if (!confirm('이 대화를 삭제하시겠습니까?')) return;

    try {
      const response = await fetchWithAuth(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
      if (response.ok) {
        setSheetOpen(false);
        setThread(null);
        setSelectedId(null);
        loadSessions(0, false);
      }
    } catch (error) {
      console.error('대화 삭제 실패:', error);
    }
  };

  // 이 대화 전용 AI 스위치. 채널 전체가 꺼져 있으면 켤 수 없다는 것도 함께 알려준다.
  const renderSessionAiSwitch = () => {
    if (!thread) return null;

    const channelOff = channel ? channel.aiEnabled === false : false;
    const sessionOn = thread.session.aiEnabled !== false;

    return (
      <div className={`chat-session-ai ${sessionOn && !channelOff ? '' : 'off'}`}>
        <label className="chat-switch">
          <input
            type="checkbox"
            checked={sessionOn && !channelOff}
            disabled={sessionAiSaving || channelOff}
            onChange={(e) => handleToggleSessionAi(e.target.checked)}
          />
          이 대화에 AI 답변
        </label>
        <span className="chat-session-ai-desc">
          {channelOff
            ? '채널 전체 AI 답변이 꺼져 있습니다.'
            : !sessionOn
            ? '이 학부모에게는 AI가 답하지 않습니다. 직접 답변해 주세요.'
            : aiPaused
            ? '대화창을 열어둔 동안에는 잠시 멈춥니다.'
            : '이 학부모의 질문에 AI가 답합니다.'}
        </span>
      </div>
    );
  };

  const renderThread = (withHeader) => {
    if (!thread) {
      return <div className="chat-thread-empty">왼쪽에서 대화를 선택하세요</div>;
    }

    return (
      <>
        {withHeader && (
          <div className="chat-thread-head">
            <div>
              <strong>{thread.session.visitorName}</strong>
              <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                메시지 {thread.session.messageCount}
              </span>
              {thread.session.unansweredCount > 0 && (
                <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                  미답변 {thread.session.unansweredCount}
                </span>
              )}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(thread.session.id)}>
              대화 삭제
            </button>
          </div>
        )}

        <div className="chat-thread-scroll" ref={scrollRef} onScroll={handleScroll}>
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={`chat-msg ${m.role} ${m.role === 'bot' && m.answered === false ? 'unanswered' : ''}`}
          >
            <div className="chat-msg-who">
              <span>
                {m.role === 'parent'
                  ? thread.session.visitorName
                  : m.role === 'admin'
                  ? '내 답변'
                  : 'AI 답변'}{' '}
                · {formatDateTime(m.createdAt)}
              </span>
              {m.editedAt && <span className="chat-msg-edited">(수정됨)</span>}
              {m.role !== 'parent' && editingMessageId !== m.id && (
                <button
                  type="button"
                  className="chat-msg-action"
                  aria-label="메시지 수정"
                  title="메시지 수정"
                  onClick={() => startEditMessage(m)}
                >
                  수정
                </button>
              )}
              <button
                type="button"
                className="chat-msg-action chat-msg-delete"
                aria-label="메시지 삭제"
                title="메시지 삭제"
                disabled={deletingMessageId === m.id}
                onClick={() => handleDeleteMessage(m.id)}
              >
                삭제
              </button>
            </div>
            {editingMessageId === m.id ? (
              <div className="chat-msg-edit">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveMessage(m.id);
                    }
                    if (e.key === 'Escape') cancelEditMessage();
                  }}
                  rows={2}
                  maxLength={500}
                  autoFocus
                  aria-label="답변 수정"
                />
                <div className="chat-msg-edit-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!editDraft.trim() || savingEdit}
                    onClick={() => handleSaveMessage(m.id)}
                  >
                    {savingEdit ? '저장 중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={cancelEditMessage}
                    disabled={savingEdit}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="chat-bubble"><RichText text={m.content} /></div>
            )}
            {m.matchedFaqs && m.matchedFaqs.length > 0 && (
              <div className="chat-msg-src">
                근거
                {m.matchedFaqs.map((f) => (
                  <code key={f.id}>FAQ #{f.id} {f.question}</code>
                ))}
              </div>
            )}
            {m.role === 'bot' && m.answered === false && (
              <div className="chat-msg-src">
                {m.status === 'ai_off'
                  ? '⏳ AI 자동 답변이 꺼져 있습니다 — 직접 답변해 주세요'
                  : m.status === 'session_ai_off'
                  ? '🙅 이 대화는 AI 답변을 꺼두었습니다 — 직접 답변해 주세요'
                  : m.status === 'admin_viewing'
                  ? '👀 대화창을 열어둔 상태라 AI가 답하지 않았습니다 — 직접 답변해 주세요'
                  : '⚠️ 관련 FAQ 없음 — FAQ 등록을 검토하세요'}
              </div>
            )}
          </div>
        ))}

        </div>

        <form className="chat-reply" onSubmit={handleReply}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleReply(e);
              }
            }}
            placeholder="학부모에게 보낼 답변을 입력하세요"
            rows={2}
            maxLength={500}
          />
          <div className="chat-reply-actions">
            {renderSessionAiSwitch()}
            <button type="submit" className="btn btn-primary" disabled={!reply.trim() || replying}>
              {replying ? '전송 중...' : '답변 보내기'}
            </button>
          </div>
        </form>
      </>
    );
  };

  const aiEnabled = channel ? channel.aiEnabled !== false : true;

  return (
    <div>
      {channel && (
        <div className={`chat-ai-bar ${aiEnabled ? '' : 'off'}`}>
          <label className="chat-switch">
            <input
              type="checkbox"
              checked={aiEnabled}
              disabled={aiSaving || !onToggleAi}
              onChange={(e) => handleToggleAi(e.target.checked)}
            />
            AI 자동 답변
          </label>
          <span className="chat-ai-bar-desc">
            {!aiEnabled
              ? '꺼짐 — 접수된 질문에 직접 답변해 주세요.'
              : aiPaused
              ? '대화창을 열어둔 동안 잠시 멈춰 있습니다. 직접 답변해 주세요.'
              : '학부모 질문에 AI가 바로 답변합니다.'}
          </span>
          {aiEnabled && aiPaused && <span className="badge badge-gray">일시중지</span>}
        </div>
      )}

      <div className="chat-filters">
        <label className="chat-switch">
          <input
            type="checkbox"
            checked={unansweredOnly}
            onChange={(e) => setUnansweredOnly(e.target.checked)}
          />
          미답변만 보기
        </label>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
          isMobile={isMobile}
          label=""
        />
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗨️</div>
          <div className="empty-state-title">대화가 없습니다</div>
          <div className="empty-state-description">
            학부모가 질문 링크로 접속해 질문하면 여기에 표시됩니다.
          </div>
        </div>
      ) : (
        <div className={isMobile ? '' : 'chat-layout'}>
          <div className="chat-session-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`chat-session ${selectedId === s.id ? 'on' : ''}`}
                onClick={() => openSession(s)}
              >
                <div className="chat-session-top">
                  <div className="chat-session-name">
                    {s.visitorName}
                    {s.unansweredCount > 0 && (
                      <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                        미답변 {s.unansweredCount}
                      </span>
                    )}
                  </div>
                  {isMobile && <span className="chat-session-chev">›</span>}
                </div>
                <div className="chat-session-last">{s.lastMessage || '-'}</div>
                <div className="chat-session-time">
                  {formatDateTime(s.lastMessageAt)} · 메시지 {s.messageCount}
                </div>
              </div>
            ))}

            {sessions.length < total && (
              <button
                className="btn btn-outline btn-block"
                style={{ marginTop: 'var(--spacing-md)' }}
                onClick={() => loadSessions(offset + PAGE_SIZE, true)}
                disabled={loading}
              >
                더 보기 ({sessions.length}/{total})
              </button>
            )}
          </div>

          {!isMobile && <div className="chat-thread">{renderThread(true)}</div>}
        </div>
      )}

      {/* 모바일: 상세 대화 전체 화면 */}
      {isMobile && sheetOpen && thread && (
        <div className="chat-sheet">
          <div className="chat-sheet-head">
            <button className="chat-sheet-back" onClick={() => setSheetOpen(false)} aria-label="목록으로">
              ←
            </button>
            <span className="chat-sheet-title">{thread.session.visitorName}</span>
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(thread.session.id)}>
              삭제
            </button>
          </div>
          <div className="chat-sheet-body" ref={sheetBodyRef} onScroll={handleScroll}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <span className="badge badge-gray">메시지 {thread.session.messageCount}</span>
              {thread.session.unansweredCount > 0 && (
                <span className="badge badge-danger">미답변 {thread.session.unansweredCount}</span>
              )}
            </div>
            {renderThread(false)}
          </div>
        </div>
      )}
    </div>
  );
}

export default FaqChats;
