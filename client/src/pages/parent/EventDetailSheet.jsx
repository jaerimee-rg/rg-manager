import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { formatCardDate, dDay, reasonText } from '../../utils/parentSchedule';
import { typeOf } from '../../utils/eventFormat';

/**
 * 이벤트 상세 + 신청. 모바일에서 올라오는 바텀시트로 보여준다.
 * 신청 가능 여부는 서버가 내려준 판정을 그대로 쓰고, 저장할 때 서버가 한 번 더 확인한다.
 */
function EventDetailSheet({ eventId, today, onClose, onChanged }) {
  const [event, setEvent] = useState(null);
  const [childId, setChildId] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async (keepChild) => {
    const response = await fetchWithAuth(`/api/parent/events/${eventId}`);
    if (!response.ok) {
      onClose();
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

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220 }}
      />
      <div
        role="dialog"
        aria-label={`${event.title} 상세`}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 221, background: '#fff',
          borderRadius: '22px 22px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          maxWidth: '640px', margin: '0 auto'
        }}
      >
        <div style={{ width: '40px', height: '4px', borderRadius: '4px', background: 'var(--color-gray-300)', margin: '10px auto 2px' }} />

        <div style={{ overflowY: 'auto', padding: '10px 18px 18px' }}>
          <span className={`badge ${meta.className}`}>{meta.emoji} {meta.short}</span>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '6px 0 8px', lineHeight: 1.35 }}>{event.title}</h2>

          <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>
            📅 {formatCardDate(event)}
            <span style={{ color: 'var(--color-gray-400)', fontSize: '0.75rem', marginLeft: '6px' }}>
              {dDay(event, today).text}
            </span>
          </div>
          {event.location && <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>📍 {event.location}</div>}
          {event.registrationDeadline && !isClosure && (
            <div style={{ fontSize: '0.875rem', marginBottom: '6px' }}>
              ⏰ 접수 마감 {event.registrationDeadline.slice(0, 16).replace('T', ' ')}
            </div>
          )}

          {event.description && (
            <div style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-700)', marginBottom: '8px' }}>안내</h3>
              <div style={{
                fontSize: '0.875rem', color: 'var(--color-gray-700)', lineHeight: 1.65,
                whiteSpace: 'pre-wrap', background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)', padding: '12px'
              }}>
                {event.description}
              </div>
            </div>
          )}

          {isClosure ? (
            <div style={{
              marginTop: '16px', background: 'var(--color-gray-100)', color: 'var(--color-gray-600)',
              padding: '11px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem'
            }}>
              휴관일 안내예요. 신청은 필요 없어요.
            </div>
          ) : (
            <>
              {event.children.length > 1 && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-700)', marginBottom: '8px' }}>
                    누구를 신청할까요?
                  </h3>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {event.children.map((c) => (
                      <button
                        key={c.childId}
                        type="button"
                        onClick={() => selectChild(c.childId)}
                        aria-pressed={c.childId === childId}
                        style={{
                          padding: '8px 14px', borderRadius: 'var(--radius-full)', minHeight: '44px',
                          border: `1px solid ${c.childId === childId ? 'var(--color-gray-900)' : 'var(--color-gray-200)'}`,
                          background: c.childId === childId ? 'var(--color-gray-900)' : '#fff',
                          color: c.childId === childId ? '#fff' : 'var(--color-gray-700)',
                          fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                        }}
                      >
                        {c.childName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {event.options.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-700)', marginBottom: '8px' }}>
                    옵션{' '}
                    <span style={{ fontWeight: 600, color: 'var(--color-gray-400)', fontSize: '0.6875rem' }}>
                      {event.requireOption ? '1개 이상 선택' : '선택 사항 · 여러 개 가능'}
                    </span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {event.options.map((option) => {
                      const on = picked.includes(option.id);
                      const disabled = !child?.canRegister && !registered;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggle(option.id)}
                          aria-pressed={on}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px',
                            border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                            background: on ? 'var(--color-primary-bg)' : '#fff',
                            borderRadius: 'var(--radius-md)', minHeight: '44px', fontSize: '0.9rem',
                            fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1, fontFamily: 'inherit', textAlign: 'left'
                          }}
                        >
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                            border: `2px solid ${on ? 'var(--color-primary)' : 'var(--color-gray-300)'}`,
                            background: on ? 'var(--color-primary)' : 'transparent', color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem'
                          }}>
                            {on ? '✓' : ''}
                          </span>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {registered && (
                <div style={{
                  marginTop: '14px', background: 'var(--color-success-bg)', color: '#047857',
                  padding: '11px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55
                }}>
                  ✓ {child.childName} 신청 완료
                  {child.status === 'confirmed' && ' · 선생님이 확정했어요'}
                  {picked.length > 0 && ` · ${event.options.filter((o) => picked.includes(o.id)).map((o) => o.label).join(', ')}`}
                </div>
              )}

              {!registered && child && !child.canRegister && (
                <div style={{
                  marginTop: '14px', background: 'var(--color-warning-bg)', color: '#7A5D00',
                  padding: '11px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', lineHeight: 1.55
                }}>
                  {reasonText(child.reason, child.childName)}
                </div>
              )}

              {message && (
                <div role="status" style={{
                  marginTop: '12px', background: 'var(--color-gray-100)', color: 'var(--color-gray-700)',
                  padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem'
                }}>
                  {message}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          padding: '12px 18px calc(16px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--color-gray-100)', display: 'flex', gap: '8px', flexShrink: 0
        }}>
          {isClosure || !child ? (
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>닫기</button>
          ) : registered ? (
            child.canRegister ? (
              <>
                <button
                  className="btn" style={{ flex: 1, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                  disabled={busy} onClick={cancel}
                >
                  신청 취소
                </button>
                <button
                  className="btn btn-primary" style={{ flex: 1 }}
                  disabled={busy || !optionsChanged || requireMissing} onClick={submit}
                >
                  옵션 변경
                </button>
              </>
            ) : (
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>닫기</button>
            )
          ) : child.canRegister ? (
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || requireMissing} onClick={submit}>
              {event.options.length > 0 ? '선택한 옵션으로 신청하기' : '참가 신청'}
            </button>
          ) : (
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>닫기</button>
          )}
        </div>
      </div>
    </>
  );
}

export default EventDetailSheet;
