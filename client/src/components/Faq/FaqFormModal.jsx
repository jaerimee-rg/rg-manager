import React, { useState, useEffect } from 'react';
import { Button, Callout, Field, Input, Modal, Stack, Switch, Textarea } from '../ui';

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
    <Modal
      open
      mode="modal"
      size="lg"
      onClose={onClose}
      title={faq ? 'FAQ 수정' : 'FAQ 등록'}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" type="submit" form="faq-form" disabled={invalid || saving} loading={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </>
      }
    >
      <form id="faq-form" onSubmit={handleSubmit}>
        <Stack gap={5}>
          <Callout tone="brand">
            여기에 등록한 내용만 AI 답변의 근거가 됩니다. 등록되지 않은 질문에는 안내 문구가 나갑니다.
          </Callout>

          <Field
            label="질문"
            required
            counter={{ value: question.length, max: QUESTION_MAX }}
          >
            {(props) => (
              <Input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="예) 토요일 수업은 몇 시인가요?"
                autoFocus
                invalid={question.length > QUESTION_MAX}
                {...props}
              />
            )}
          </Field>

          <Field
            label="답변"
            required
            counter={{ value: answer.length, max: ANSWER_MAX }}
          >
            {(props) => (
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="예) 토요일 초등부 수업은 오전 10시부터 11시 30분까지입니다."
                rows={6}
                invalid={answer.length > ANSWER_MAX}
                {...props}
              />
            )}
          </Field>

          <Switch
            label="학부모 채팅에 공개"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />

          {error && <Callout tone="danger">{error}</Callout>}
        </Stack>
      </form>
    </Modal>
  );
}

export default FaqFormModal;
