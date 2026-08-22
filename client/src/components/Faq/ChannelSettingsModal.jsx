import React, { useState } from 'react';

function ChannelSettingsModal({ channel, onClose, onSaved }) {
  const [name, setName] = useState(channel?.name || '');
  const [greeting, setGreeting] = useState(channel?.greeting || '');
  const [fallbackMessage, setFallbackMessage] = useState(channel?.fallbackMessage || '');
  const [pendingMessage, setPendingMessage] = useState(channel?.pendingMessage || '');
  const [isActive, setIsActive] = useState(channel ? channel.isActive : true);
  const [aiEnabled, setAiEnabled] = useState(channel ? channel.aiEnabled !== false : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError('');
    const ok = await onSaved({
      name: name.trim(),
      greeting,
      fallbackMessage,
      pendingMessage,
      isActive,
      aiEnabled
    });
    setSaving(false);
    if (!ok) setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };

  return (
    <div className="faq-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="faq-modal" onSubmit={handleSubmit}>
        <h3 className="faq-modal-title">채팅 채널 설정</h3>

        <div className="form-group">
          <label className="form-label">채팅창 이름</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">첫 인사말</label>
          <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} />
        </div>

        <div className="faq-setting-block">
          <label className="faq-check">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            AI 자동 답변 사용
          </label>
          <div className="faq-setting-desc">
            {aiEnabled
              ? '학부모 질문에 등록된 FAQ를 근거로 AI가 바로 답변합니다.'
              : 'AI가 답변하지 않습니다. 질문이 접수되면 대화 내역에서 직접 답변해 주세요.'}
          </div>
        </div>

        {aiEnabled ? (
          <div className="form-group">
            <label className="form-label">답변할 수 없을 때 안내 문구</label>
            <textarea
              value={fallbackMessage}
              onChange={(e) => setFallbackMessage(e.target.value)}
              rows={3}
            />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">질문 접수 안내 문구</label>
            <textarea
              value={pendingMessage}
              onChange={(e) => setPendingMessage(e.target.value)}
              rows={3}
              placeholder="문의가 접수되었습니다. 선생님이 확인 후 답변드릴게요."
            />
          </div>
        )}

        <label className="faq-check">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          질문 접수 사용
        </label>

        {error && <div className="faq-modal-error">{error}</div>}

        <div className="faq-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ChannelSettingsModal;
