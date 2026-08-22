import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const MESSAGE_MAX = 500;
const NAME_MAX = 20;
const VISITOR_KEY_STORAGE = 'faqChatVisitorKey';

// 로그인하지 않은 학부모 화면이므로 fetchWithAuth(401 시 /login 이동)를 사용하지 않는다.
const createVisitorKey = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getVisitorKey = () => {
  try {
    let key = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!key) {
      key = createVisitorKey();
      localStorage.setItem(VISITOR_KEY_STORAGE, key);
    }
    return key;
  } catch (e) {
    return createVisitorKey();
  }
};

const formatTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
};

function PublicChat() {
  const { publicId } = useParams();
  const [status, setStatus] = useState('loading'); // loading | entry | chat | notfound
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

  useEffect(() => {
    document.title = '문의하기';
    loadChannel();
  }, [publicId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, sending, status]);

  const loadChannel = async () => {
    try {
      const response = await fetch(`/api/chat/public/${publicId}`);
      if (!response.ok) {
        setStatus('notfound');
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
          <span className="badge badge-primary" style={{ marginLeft: 8 }}>AI 자동 응답</span>
        </div>
        <div className="pchat-header-sub">
          {visitorName ? `${/님$/.test(visitorName) ? visitorName : `${visitorName}님`}으로 대화 중 · ` : ''}
          등록된 FAQ 기준으로 안내드려요
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

        {!channel?.hasFaq && (
          <div className="pchat-row bot">
            <div className="pchat-bubble pchat-bubble-warn">
              아직 등록된 FAQ가 없어요. 궁금한 점은 담당 선생님께 직접 문의해 주세요.
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`pchat-row ${m.role === 'parent' ? 'me' : 'bot'}`}>
            {m.role === 'parent' ? (
              <div className="pchat-who">{visitorName}</div>
            ) : (
              <div className="pchat-who">
                <span className="pchat-avatar">AI</span> 안내 도우미
              </div>
            )}
            <div className={`pchat-bubble ${m.answered === false ? 'pchat-bubble-warn' : ''}`}>
              {m.content}
            </div>
            <div className="pchat-time">{formatTime(m.createdAt)}</div>
          </div>
        ))}

        {sending && (
          <div className="pchat-row bot">
            <div className="pchat-who">
              <span className="pchat-avatar">AI</span> 답변을 작성하고 있어요
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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
            AI가 등록된 FAQ만 참고해 답변합니다. 입력하신 내용은 학원 관리자에게 전달·저장됩니다.
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
