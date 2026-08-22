import React, { useState } from 'react';

function ChannelSettingsModal({ channel, onClose, onSaved }) {
  const [name, setName] = useState(channel?.name || '');
  const [greeting, setGreeting] = useState(channel?.greeting || '');
  const [fallbackMessage, setFallbackMessage] = useState(channel?.fallbackMessage || '');
  const [isActive, setIsActive] = useState(channel ? channel.isActive : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError('');
    const ok = await onSaved({ name: name.trim(), greeting, fallbackMessage, isActive });
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

        <div className="form-group">
          <label className="form-label">답변할 수 없을 때 안내 문구</label>
          <textarea
            value={fallbackMessage}
            onChange={(e) => setFallbackMessage(e.target.value)}
            rows={3}
          />
        </div>

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
