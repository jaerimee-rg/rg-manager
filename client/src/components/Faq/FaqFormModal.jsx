import React, { useState, useEffect } from 'react';

const QUESTION_MAX = 200;
const ANSWER_MAX = 2000;

function FaqFormModal({ faq, onClose, onSaved }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuestion(faq?.question || '');
    setAnswer(faq?.answer || '');
    setIsPublished(faq ? faq.isPublished : true);
    setError('');
  }, [faq]);

  const invalid =
    !question.trim() ||
    !answer.trim() ||
    question.length > QUESTION_MAX ||
    answer.length > ANSWER_MAX;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalid || saving) return;

    setSaving(true);
    setError('');

    const ok = await onSaved({
      question: question.trim(),
      answer: answer.trim(),
      isPublished
    });

    setSaving(false);
    if (!ok) setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };

  return (
    <div className="faq-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="faq-modal" onSubmit={handleSubmit}>
        <h3 className="faq-modal-title">{faq ? 'FAQ 수정' : 'FAQ 등록'}</h3>

        <div className="faq-modal-hint">
          💡 여기에 등록한 내용만 AI 답변의 근거가 됩니다. 등록되지 않은 질문에는 안내 문구가 나갑니다.
        </div>

        <div className="form-group">
          <label className="form-label">
            질문 <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예) 토요일 수업은 몇 시인가요?"
            autoFocus
          />
          <div className={`faq-counter ${question.length > QUESTION_MAX ? 'over' : ''}`}>
            {question.length} / {QUESTION_MAX}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">
            답변 <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="예) 토요일 초등부 수업은 오전 10시부터 11시 30분까지입니다."
            rows={6}
          />
          <div className={`faq-counter ${answer.length > ANSWER_MAX ? 'over' : ''}`}>
            {answer.length} / {ANSWER_MAX}
          </div>
        </div>

        <label className="faq-check">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          학부모 채팅에 공개
        </label>

        {error && <div className="faq-modal-error">{error}</div>}

        <div className="faq-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={invalid || saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FaqFormModal;
