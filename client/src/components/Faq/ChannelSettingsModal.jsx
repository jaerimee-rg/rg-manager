import React, { useState } from 'react';
import { Button, Callout, Field, Input, Modal, Stack, Switch, SwitchField, Textarea } from '../ui';

function ChannelSettingsModal({ channel, onClose, onSaved }) {
  const [name, setName] = useState(channel?.name || '');
  const [greeting, setGreeting] = useState(channel?.greeting || '');
  const [fallbackMessage, setFallbackMessage] = useState(channel?.fallbackMessage || '');
  const [pendingMessage, setPendingMessage] = useState(channel?.pendingMessage || '');
  const [isActive, setIsActive] = useState(channel ? channel.isActive : true);
  const [aiEnabled, setAiEnabled] = useState(channel ? channel.aiEnabled !== false : true);
  const [kakaoNotify, setKakaoNotify] = useState(channel ? channel.kakaoNotify !== false : true);
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
      aiEnabled,
      kakaoNotify
    });
    setSaving(false);
    if (!ok) setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };

  return (
    <Modal
      open
      mode="modal"
      onClose={onClose}
      title="채팅 채널 설정"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            form="faq-channel-settings"
            type="submit"
            disabled={!name.trim() || saving}
            loading={saving}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </>
      }
    >
      <form id="faq-channel-settings" onSubmit={handleSubmit}>
        <Stack gap={5}>
          <Field label="채팅창 이름">
            {(props) => <Input type="text" value={name} onChange={(e) => setName(e.target.value)} {...props} />}
          </Field>

          <Field label="첫 인사말">
            {(props) => <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} {...props} />}
          </Field>

          <SwitchField
            label="AI 자동 답변 사용"
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            description={
              aiEnabled
                ? '학부모 질문에 등록된 FAQ를 근거로 AI가 바로 답변합니다.'
                : 'AI가 답변하지 않습니다. 질문이 접수되면 대화 내역에서 직접 답변해 주세요.'
            }
          />

          {aiEnabled ? (
            <Field label="답변할 수 없을 때 안내 문구">
              {(props) => (
                <Textarea value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)} rows={3} {...props} />
              )}
            </Field>
          ) : (
            <Field label="질문 접수 안내 문구">
              {(props) => (
                <Textarea
                  value={pendingMessage}
                  onChange={(e) => setPendingMessage(e.target.value)}
                  rows={3}
                  placeholder="문의가 접수되었습니다. 선생님이 확인 후 답변드릴게요."
                  {...props}
                />
              )}
            </Field>
          )}

          <SwitchField
            label="새 문의 카카오톡 알림"
            checked={kakaoNotify}
            onChange={(e) => setKakaoNotify(e.target.checked)}
            description={
              kakaoNotify
                ? '학부모 질문이 들어오면 카카오톡으로 알려드립니다. (카카오 로그인 + 알림 동의 필요)'
                : '새 문의가 들어와도 카카오톡 알림을 보내지 않습니다.'
            }
          />

          <Switch label="질문 접수 사용" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />

          {error && <Callout tone="danger">{error}</Callout>}
        </Stack>
      </form>
    </Modal>
  );
}

export default ChannelSettingsModal;
