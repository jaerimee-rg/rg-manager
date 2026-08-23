import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { formatWhen, typeOf } from '../../utils/eventFormat';

const STATUS_BADGE = {
  registered: { label: '신청', className: 'badge-primary' },
  confirmed: { label: '확정', className: 'badge-success' },
  cancelled: { label: '취소', className: 'badge-gray' }
};

/**
 * 이벤트별 신청 현황. 대회는 [확정] 으로 기존 참가 학생에 올린다.
 * 데스크톱에서는 목록 옆 패널로, 모바일에서는 목록 아래에 열린다.
 */
function EventRegistrations({ eventId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [hideCancelled, setHideCancelled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const response = await fetchWithAuth(`/api/events/${eventId}/registrations`);
      if (response.ok) setData(await response.json());
    } catch (error) {
      console.error('신청 현황 조회 실패:', error);
    }
  };

  useEffect(() => {
    setData(null);
    load();
  }, [eventId]);

  const confirmOne = async (regId) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`/api/events/${eventId}/registrations/${regId}/confirm`, { method: 'PUT' });
      if (response.ok) {
        await load();
        onChanged?.();
      } else {
        const err = await response.json();
        alert(err.error || '확정에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmAll = async () => {
    const pending = (data?.registrations || []).filter((r) => r.status === 'registered').length;
    if (!pending || !confirm(`신청 ${pending}건을 모두 확정할까요?\n확정하면 참가 학생 목록에 추가됩니다.`)) return;

    setBusy(true);
    try {
      const response = await fetchWithAuth(`/api/events/${eventId}/registrations/confirm-all`, { method: 'POST' });
      if (response.ok) {
        await load();
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const copyRoster = async () => {
    const names = (data?.registrations || [])
      .filter((r) => r.status !== 'cancelled')
      .map((r) => `${r.studentName}${r.options.length ? ` (${r.options.map((o) => o.label).join(', ')})` : ''}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(names);
      alert('명단을 복사했습니다.');
    } catch {
      alert(names || '신청이 없습니다.');
    }
  };

  if (!data) {
    return (
      <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
        불러오는 중...
      </div>
    );
  }

  const meta = typeOf(data.event.type);
  const rows = hideCancelled ? data.registrations.filter((r) => r.status !== 'cancelled') : data.registrations;
  const pendingCount = data.registrations.filter((r) => r.status === 'registered').length;

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className={`badge ${meta.className}`}>{meta.emoji} {meta.short}</span>
            {data.event.title}
          </h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            신청 {data.activeCount}건 · {formatWhen(data.event)}
            {data.event.type === 'competition' && ' · 확정하면 참가 학생에 추가됩니다'}
          </div>
        </div>
        <button
          type="button" onClick={onClose} aria-label="신청 현황 닫기"
          style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--color-gray-500)' }}
        >
          ✕
        </button>
      </div>

      {data.summary.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
          {data.summary.map((s) => (
            <span key={s.id} style={{
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '6px 10px',
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-gray-700)'
            }}>
              {s.label}<b style={{ color: 'var(--color-primary)', marginLeft: '4px' }}>{s.count}</b>
            </span>
          ))}
        </div>
      )}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: 'pointer', marginBottom: '6px' }}>
        <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} />
        취소 숨기기
      </label>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--color-gray-400)', fontSize: '0.875rem', padding: '30px 10px' }}>
          아직 신청이 없어요
        </div>
      ) : (
        rows.map((r) => {
          const badge = STATUS_BADGE[r.status] || STATUS_BADGE.registered;
          return (
            <div
              key={r.id}
              style={{
                display: 'flex', gap: '10px', padding: '10px 0', alignItems: 'flex-start',
                borderTop: '1px solid var(--color-gray-100)', opacity: r.status === 'cancelled' ? 0.55 : 1
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ textDecoration: r.status === 'cancelled' ? 'line-through' : 'none' }}>{r.studentName}</span>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                  {r.cancelledAfterConfirm && <span className="badge badge-danger">⚠ 확정 후 취소</span>}
                  {r.createdBy === 'teacher' && <span className="badge badge-gray">선생님 등록</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  {r.parentName || '—'}
                </div>
                {r.options.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    {r.options.map((o) => (
                      <span key={o.id} style={{
                        display: 'inline-block', background: 'var(--color-gray-100)', borderRadius: '4px',
                        padding: '2px 6px', margin: '2px 3px 0 0', fontSize: '0.75rem'
                      }}>
                        {o.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {data.event.type === 'competition' && r.status === 'registered' && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => confirmOne(r.id)}
                  style={{ background: 'var(--color-success-bg)', color: '#059669' }}>
                  확정
                </button>
              )}
              {data.event.type === 'competition' && r.status === 'confirmed' && (
                <span style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', whiteSpace: 'nowrap' }}>참가 학생 ✓</span>
              )}
            </div>
          );
        })
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
        {data.event.type === 'competition' ? (
          <button type="button" className="btn btn-sm" disabled={busy || pendingCount === 0} onClick={confirmAll}
            style={{ background: 'var(--color-success-bg)', color: '#059669' }}>
            ✓ 일괄 확정 ({pendingCount})
          </button>
        ) : (
          <button type="button" className="btn btn-outline btn-sm" onClick={copyRoster}>📋 명단 복사</button>
        )}
      </div>
    </div>
  );
}

export default EventRegistrations;
