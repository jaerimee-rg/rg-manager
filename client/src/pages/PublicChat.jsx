import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
// 로그인하지 않은 학부모 화면이므로 fetchWithAuth(401 시 /login 이동)를 사용하지 않는다.
import { getVisitorKey } from '../utils/visitorStorage';

const MESSAGE_MAX = 500;
const NAME_MAX = 20;
// 관리자 답변을 받아보기 위한 갱신 주기
const POLL_INTERVAL_MS = 12000;
// 한도를 넘었을 때 기본 대기 시간 (서버가 알려주면 그 값을 쓴다)
const POLL_BACKOFF_MS = 60000;
const POLL_BACKOFF_MAX_MS = 5 * 60 * 1000;

const formatTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
};

function PublicChat() {
  const { publicId } = useParams();
  const [status, setStatus] = useState('loading'); // loading | entry | chat | notfound | busy
  const [channel, setChannel] = useState(null);
  const [visitorKey] = useState(getVisitorKey);
  const [visitorName, setVisitorName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);

  const messagesRef = useRef(null);
  const sendingRef = useRef(false);
  // 한도 초과 시 폴링을 잠시 멈춰 둘 시각
  const pollBlockedUntilRef = useRef(0);
  const composerRef = useRef(null);

  useEffect(() => {
    document.title = '문의하기';
    loadChannel();
  }, [publicId]);

  // 모바일 키보드가 올라와도 채팅 화면이 전체 화면을 유지하도록
  // visualViewport 크기에 맞춰 컨테이너 높이·위치를 고정한다.
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const syncViewport = () => {
      const height = viewport ? viewport.height : window.innerHeight;
      const top = viewport ? viewport.offsetTop : 0;
      root.style.setProperty('--pchat-vh', `${height}px`);
      root.style.setProperty('--pchat-top', `${top}px`);
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
    };

    syncViewport();
    document.body.classList.add('pchat-lock');
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);

    return () => {
      document.body.classList.remove('pchat-lock');
      root.style.removeProperty('--pchat-vh');
      root.style.removeProperty('--pchat-top');
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  // 관리자가 남긴 답변을 받아오기 위한 주기적 갱신
  useEffect(() => {
    if (status !== 'chat') return undefined;

    const timer = setInterval(() => {
      if (document.hidden || sendingRef.current) return;
      refreshMessages();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden && !sendingRef.current) refreshMessages();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, publicId, visitorKey]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, sending, status]);

  const loadChannel = async () => {
    try {
      const response = await fetch(`/api/chat/public/${publicId}`);
      if (!response.ok) {
        // 한도 초과를 "없는 채팅방"으로 안내하면 링크가 죽은 것처럼 보인다.
        setStatus(response.status === 429 ? 'busy' : 'notfound');
        return;
      }

      const data = await response.json();
      setChannel(data);

      // 같은 브라우저로 재접속한 경우 대화명 입력을 건너뛴다.
      const historyRes = await fetch(
        `/api/chat/public/${publicId}/messages?visitorKey=${encodeURIComponent(visitorKey)}`
      );

      if (historyRes.ok) {
        const history = await historyRes.json();
        if (history.visitorName) {
          setVisitorName(history.visitorName);
          setMessages(history.messages || []);
          setStatus('chat');
          return;
        }
      }

      setStatus('entry');
    } catch (error) {
      console.error('채팅방 로드 실패:', error);
      setStatus('notfound');
    }
  };

  const refreshMessages = async () => {
    if (Date.now() < pollBlockedUntilRef.current) return;

    try {
      const response = await fetch(
        `/api/chat/public/${publicId}/messages?visitorKey=${encodeURIComponent(visitorKey)}`
      );

      // 한도를 넘은 뒤에도 같은 속도로 계속 두드리면 창이 회복되지 않는다.
      if (response.status === 429) {
        const reset = Number(response.headers.get('ratelimit-reset'));
        const waitMs =
          Number.isFinite(reset) && reset > 0
            ? Math.min(reset * 1000, POLL_BACKOFF_MAX_MS)
            : POLL_BACKOFF_MS;
        pollBlockedUntilRef.current = Date.now() + waitMs;
        return;
      }

      if (!response.ok) return;

      const data = await response.json();
      if (!Array.isArray(data.messages)) return;

      // 전송 중에는 낙관적으로 그린 메시지를 덮어쓰지 않는다
      if (sendingRef.current) return;
      setMessages(data.messages);
      if (data.visitorName) setVisitorName(data.visitorName);
    } catch (error) {
      // 폴링 실패는 조용히 무시한다 (다음 주기에 재시도)
    }
  };

  const handleStart = async (e) => {
    e.preventDefault();
    const name = nameInput.trim();

    if (!name) {
      setNameError('대화명을 입력해 주세요.');
      return;
    }
    if (name.length > NAME_MAX) {
      setNameError(`대화명은 ${NAME_MAX}자 이내로 입력해 주세요.`);
      return;
    }

    setStarting(true);
    setNameError('');

    try {
      const response = await fetch(`/api/chat/public/${publicId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorKey, visitorName: name })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setNameError(data.error || '시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      setVisitorName(name);
      setStatus('chat');
    } catch (error) {
      setNameError('연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setStarting(false);
    }
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || question.length > MESSAGE_MAX || sending) return;

    setInput('');
    sendingRef.current = true;
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'parent', content: question, createdAt: new Date().toISOString() }
    ]);

    try {
      const response = await fetch(`/api/chat/public/${publicId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorKey, message: question })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'bot',
            content: data.error || '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            answered: false,
            createdAt: new Date().toISOString()
          }
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: 'bot',
          content: data.reply,
          answered: data.answered,
          createdAt: data.createdAt
        }
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'bot',
          content: '연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
          answered: false,
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (status === 'loading') {
    return (
      <div className="pchat-state">
        <div className="pchat-state-title">불러오는 중...</div>
      </div>
    );
  }

  if (status === 'busy') {
    return (
      <div className="pchat-state">
        <div className="pchat-state-emoji">⏳</div>
        <div className="pchat-state-title">잠시 후 다시 시도해 주세요</div>
        <div className="pchat-state-desc">
          지금 문의가 많아 잠시 연결이 어렵습니다.
          <br />
          잠시 뒤에 새로고침해 주세요.
        </div>
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="pchat-state">
        <div className="pchat-state-emoji">🔍</div>
        <div className="pchat-state-title">채팅방을 찾을 수 없습니다</div>
        <div className="pchat-state-desc">
          주소가 정확한지 확인해 주세요.
          <br />
          링크가 변경되었을 수 있습니다.
        </div>
      </div>
    );
  }

  if (status === 'entry') {
    return (
      <div className="pchat">
        <div className="pchat-entry">
          <form className="pchat-entry-card" onSubmit={handleStart}>
            <div className="pchat-entry-emoji">🤸</div>
            <div className="pchat-entry-title">{channel?.name || '문의하기'}</div>
            <div className="pchat-entry-desc">
              등록된 FAQ를 바탕으로 AI가 답변해 드려요.
              <br />
              대화명을 입력하고 시작해 주세요.
            </div>

            <label className="pchat-entry-label" htmlFor="visitorName">
              대화명 <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <input
              id="visitorName"
              type="text"
              value={nameInput}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameError('');
              }}
              placeholder="예) 김OO 어머님"
              autoFocus
            />
            <div className="pchat-entry-hint">
              실명 대신 “○○ 어머님”처럼 알아보기 쉬운 표시명을 권장합니다. 관리자 화면에 이 이름으로
              표시됩니다.
            </div>
            {nameError && <div className="pchat-entry-error">{nameError}</div>}

            <button type="submit" className="pchat-entry-btn" disabled={!nameInput.trim() || starting}>
              {starting ? '시작하는 중...' : '질문 시작하기'}
            </button>
            <div className="pchat-entry-note">입력하신 내용은 학원 관리자에게 전달·저장됩니다.</div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="pchat">
      <header className="pchat-header">
        <div className="pchat-header-title">
          {channel?.name || '문의하기'}
          {channel?.aiEnabled === false ? (
            <span className="badge badge-gray" style={{ marginLeft: 8 }}>선생님 직접 답변</span>
          ) : (
            <span className="badge badge-primary" style={{ marginLeft: 8 }}>AI 자동 응답</span>
          )}
        </div>
        <div className="pchat-header-sub">
          {visitorName ? `${/님$/.test(visitorName) ? visitorName : `${visitorName}님`}으로 대화 중 · ` : ''}
          {channel?.aiEnabled === false
            ? '남겨주시면 선생님이 확인 후 답변드려요'
            : '등록된 FAQ 기준으로 안내드려요'}
        </div>
      </header>

      <div className="pchat-messages" ref={messagesRef}>
        <div className="pchat-day">{new Date().toLocaleDateString('ko-KR')}</div>

        <div className="pchat-row bot">
          <div className="pchat-who">
            <span className="pchat-avatar">AI</span> 안내 도우미
          </div>
          <div className="pchat-bubble">
            {channel?.greeting || '안녕하세요! 궁금한 점을 남겨주세요.'}
          </div>
        </div>

        {messages.length === 0 && channel?.suggestedQuestions?.length > 0 && (
          <div className="pchat-suggest">
            <span className="pchat-suggest-label">이런 질문을 많이 하셨어요</span>
            {channel.suggestedQuestions.map((q) => (
              <button key={q} className="pchat-sug" onClick={() => send(q)} disabled={sending}>
                {q}
              </button>
            ))}
          </div>
        )}

        {!channel?.hasFaq && channel?.aiEnabled !== false && (
          <div className="pchat-row bot">
            <div className="pchat-bubble pchat-bubble-warn">
              아직 등록된 FAQ가 없어요. 궁금한 점은 담당 선생님께 직접 문의해 주세요.
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`pchat-row ${m.role === 'parent' ? 'me' : 'bot'}`}>
            {m.role === 'parent' && <div className="pchat-who">{visitorName}</div>}
            {m.role === 'bot' && (
              <div className="pchat-who">
                <span className="pchat-avatar">AI</span> 안내 도우미
              </div>
            )}
            {m.role === 'admin' && (
              <div className="pchat-who">
                <span className="pchat-avatar teacher">선</span> 선생님
              </div>
            )}
            <div
              className={`pchat-bubble ${
                m.role === 'admin' ? 'pchat-bubble-admin' : ''
              } ${m.role === 'bot' && m.answered === false ? 'pchat-bubble-warn' : ''}`}
            >
              {m.content}
            </div>

            {/* 정확히 맞는 답이 없을 때, 가까운 주제의 질문을 눌러 바로 물어볼 수 있게 한다 */}
            {m.suggestions?.length > 0 && (
              <div className="pchat-suggest pchat-suggest-inline">
                <span className="pchat-suggest-label">혹시 이걸 찾으셨나요?</span>
                {m.suggestions.map((sug) => (
                  <button
                    key={sug.id}
                    className="pchat-sug"
                    onClick={() => send(sug.question)}
                    disabled={sending}
                  >
                    {sug.question}
                  </button>
                ))}
              </div>
            )}

            <div className="pchat-time">{formatTime(m.createdAt)}</div>
          </div>
        ))}

        {sending && (
          <div className="pchat-row bot">
            <div className="pchat-who">
              <span className="pchat-avatar">AI</span>
              {channel?.aiEnabled === false ? ' 접수하고 있어요' : ' 답변을 작성하고 있어요'}
            </div>
            <div className="pchat-bubble pchat-typing">
              <i></i>
              <i></i>
              <i></i>
            </div>
          </div>
        )}
      </div>

      <div className="pchat-composer">
        <div className="pchat-composer-box">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // 키보드가 올라온 뒤 마지막 메시지가 가려지지 않도록
              setTimeout(() => {
                if (messagesRef.current) {
                  messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
                }
              }, 300);
            }}
            placeholder="궁금한 점을 입력해 주세요"
            rows={1}
          />
          <button
            className="pchat-send"
            onClick={() => send()}
            disabled={!input.trim() || input.length > MESSAGE_MAX || sending}
            aria-label="전송"
          >
            ↑
          </button>
        </div>
        <div className="pchat-composer-meta">
          <span className="pchat-notice">
            {channel?.aiEnabled === false
              ? '선생님이 확인 후 답변드립니다. 입력하신 내용은 학원 관리자에게 전달·저장됩니다.'
              : 'AI가 등록된 FAQ만 참고해 답변합니다. 입력하신 내용은 학원 관리자에게 전달·저장됩니다.'}
          </span>
          <span className={`pchat-counter ${input.length > MESSAGE_MAX ? 'over' : ''}`}>
            {input.length}/{MESSAGE_MAX}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PublicChat;
