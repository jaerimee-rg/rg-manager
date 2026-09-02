import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { formatCardDate, dDay, reasonText } from '../../utils/parentSchedule';
import { typeOf } from '../../utils/eventFormat';
import { Badge, Button, Callout, Choice, Icon, Modal, Row, Section, Stack } from '../../components/ui';

/**
 * 이벤트 상세 + 신청. 모바일에서 올라오는 바텀시트로 보여준다.
 * 신청 가능 여부는 서버가 내려준 판정을 그대로 쓰고, 저장할 때 서버가 한 번 더 확인한다.
 */
function EventDetailSheet({ eventId, today, onClose, onChanged, onNotFound }) {
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [childId, setChildId] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async (keepChild) => {
    const response = await fetchWithAuth(`/api/parent/events/${eventId}`);
    if (!response.ok) {
      // 공유 링크로 열었는데 없는(비공개·연결 안 된 선생님) 이벤트면 일정 화면이 안내한다
      if (response.status === 404 && onNotFound) onNotFound();
      else onClose();
      return;
    }

    const data = await response.json();
    setEvent(data);

    const next = keepChild ?? childId ?? data.children[0]?.childId ?? null;
    setChildId(next);
    const state = data.children.find((c) => c.childId === next);
    setPicked(state?.optionIds || []);
  };

  useEffect(() => {
    load();
  }, [eventId]);

  if (!event) return null;

  const meta = typeOf(event.type);
  const child = event.children.find((c) => c.childId === childId) || null;
  const registered = child && (child.status === 'registered' || child.status === 'confirmed');
  const optionsChanged =
    registered &&
    (picked.length !== child.optionIds.length || picked.some((id) => !child.optionIds.includes(id)));

  const selectChild = (id) => {
    setChildId(id);
    const state = event.children.find((c) => c.childId === id);
    setPicked(state?.optionIds || []);
    setMessage('');
  };

  const toggle = (optionId) =>
    setPicked((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]));

  const submit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetchWithAuth(`/api/parent/events/${event.id}/registrations/${childId}`, {
        method: 'PUT',
        body: JSON.stringify({ optionIds: picked })
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || '신청에 실패했어요.');
        return;
      }

      setMessage(registered ? '옵션을 변경했어요' : '신청했어요 · 선생님에게 전달됩니다');
      await load(childId);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm(`${child.childName} 의 신청을 취소할까요?`)) return;

    setBusy(true);
    setMessage('');
    try {
      const response = await fetchWithAuth(`/api/parent/events/${event.id}/registrations/${childId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || '취소에 실패했어요.');
        return;
      }

      setMessage(
        data.cancelledAfterConfirm
          ? '취소했어요 · 확정된 신청이라 선생님께 한 번 더 알려 주세요'
          : '신청을 취소했어요'
      );
      await load(childId);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const isClosure = event.type === 'closure';
  const requireMissing = event.requireOption && picked.length === 0;

  const footer = (() => {
    if (isClosure || !child) return <Button variant="outline" block onClick={onClose}>닫기</Button>;

    if (registered) {
      if (!child.canRegister) return <Button variant="outline" block onClick={onClose}>닫기</Button>;
      return (
        <>
          <Button variant="danger-quiet" block disabled={busy} onClick={cancel}>신청 취소</Button>
          <Button variant="primary" block disabled={busy || !optionsChanged || requireMissing} onClick={submit}>
            옵션 변경
          </Button>
        </>
      );
    }

    if (child.canRegister) {
      return (
        <Button variant="primary" block disabled={busy || requireMissing} onClick={submit}>
          {event.options.length > 0 ? '선택한 옵션으로 신청하기' : '참가 신청'}
        </Button>
      );
    }

    return <Button variant="outline" block onClick={onClose}>닫기</Button>;
  })();

  return (
    <Modal open onClose={onClose} title={event.title} footer={footer} aria-label={`${event.title} 상세`}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Row gap={2} wrap>
            <Badge tone={meta.tone || 'neutral'}>{meta.short}</Badge>
            <span className="ui-text-sm ui-text-subtle">{dDay(event, today).text}</span>
          </Row>

          <Stack gap={1}>
            <Row gap={2} className="ui-text-sm">
              <Icon name="calendar" size={16} />
              {formatCardDate(event)}
            </Row>
            {event.location && (
              <Row gap={2} className="ui-text-sm">
                <Icon name="mapPin" size={16} />
                {event.location}
              </Row>
            )}
            {event.registrationDeadline && !isClosure && (
              <Row gap={2} className="ui-text-sm">
                <Icon name="clock" size={16} />
                접수 마감 {event.registrationDeadline.slice(0, 16).replace('T', ' ')}
              </Row>
            )}
          </Stack>
        </Stack>

        {event.description && (
          <Section title="안내">
            <div
              style={{
                whiteSpace: 'pre-wrap',
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-3)',
                color: 'var(--ink-700)'
              }}
            >
              {event.description}
            </div>
          </Section>
        )}

        {event.album?.available && (
          <Section title="사진 · 영상">
            <button
              type="button"
              className="ui-card"
              data-padding="none"
              data-interactive="true"
              onClick={() => navigate(`/parent/photos/${event.id}`)}
            >
              {event.album.previews?.length > 0 && (
                <div className="ui-album-preview">
                  {event.album.previews.slice(0, 4).map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                  ))}
                </div>
              )}
              <Row gap={3} justify="between" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div>
                  <div className="ui-list-row__title">앨범 열기</div>
                  <div className="ui-list-row__subtitle">
                    사진 {event.album.counts.images} · 영상 {event.album.counts.videos}
                    {event.album.counts.mine ? ` · 우리 아이 ${event.album.counts.mine}장` : ''}
                  </div>
                </div>
                <Icon name="chevronRight" size={18} />
              </Row>
            </button>
          </Section>
        )}

        {isClosure ? (
          <Callout tone="neutral">휴관일 안내예요. 신청은 필요 없어요.</Callout>
        ) : (
          <>
            {event.children.length > 1 && (
              <Section title="누구를 신청할까요?">
                <Row gap={2} wrap>
                  {event.children.map((c) => (
                    <button
                      key={c.childId}
                      type="button"
                      className="ui-chip"
                      aria-pressed={c.childId === childId}
                      onClick={() => selectChild(c.childId)}
                    >
                      {c.childName}
                    </button>
                  ))}
                </Row>
              </Section>
            )}

            {event.options.length > 0 && (
              <Section
                title="옵션"
                description={event.requireOption ? '1개 이상 선택' : '선택 사항 · 여러 개 가능'}
              >
                <Stack gap={2}>
                  {event.options.map((option) => {
                    const on = picked.includes(option.id);
                    const disabled = !child?.canRegister && !registered;
                    return (
                      <Choice
                        key={option.id}
                        selected={on}
                        disabled={disabled}
                        onClick={() => toggle(option.id)}
                      >
                        <span className="ui-choice__mark" data-on={on || undefined}>
                          {on && <Icon name="check" size={14} strokeWidth={3} />}
                        </span>
                        {option.label}
                      </Choice>
                    );
                  })}
                </Stack>
              </Section>
            )}

            {registered && (
              <Callout tone="success">
                {child.childName} 신청 완료
                {child.status === 'confirmed' && ' · 선생님이 확정했어요'}
                {picked.length > 0 &&
                  ` · ${event.options.filter((o) => picked.includes(o.id)).map((o) => o.label).join(', ')}`}
              </Callout>
            )}

            {!registered && child && !child.canRegister && (
              <Callout tone="warning">{reasonText(child.reason, child.childName)}</Callout>
            )}

            {message && (
              <Callout tone="neutral" role="status">{message}</Callout>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}

export default EventDetailSheet;
