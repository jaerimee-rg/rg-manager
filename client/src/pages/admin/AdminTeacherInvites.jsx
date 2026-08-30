import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { useIsMobile } from '../../hooks/useMediaQuery';

/**
 * 관리자 > 선생님 — 초대 발급·회수 (docs/accounts-roles FR-341~343).
 *
 * 선생님 계정은 이 링크로만 만들어진다. 학원 데이터 전체를 갖는 고권한 계정이라
 * 링크는 **일회용**이고, 아직 쓰이지 않았다면 회수할 수 있다.
 */

const STATUS = {
  pending: { label: '대기', className: 'badge-warning' },
  used: { label: '사용됨', className: 'badge-gray' },
  expired: { label: '만료', className: 'badge-gray' },
  revoked: { label: '회수됨', className: 'badge-danger' }
};

const EXPIRY_OPTIONS = [
  { value: 14, label: '14일 (기본)' },
  { value: 7, label: '7일' },
  { value: 30, label: '30일' },
  { value: 0, label: '만료 없음' }
];

const day = (iso) => (iso ? String(iso).slice(0, 10) : '-');

function AdminTeacherInvites() {
  const isMobile = useIsMobile();
  const [invites, setInvites] = useState([]);
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const response = await fetchWithAuth('/api/teacher-invites');
      if (!response.ok) throw new Error('초대 목록을 불러올 수 없습니다.');
      const data = await response.json();
      setInvites(data.invites || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/teacher-invites', {
        method: 'POST',
        body: JSON.stringify({ label: label.trim() || undefined, expiresInDays })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '초대를 만들 수 없습니다.');

      setLabel('');
      await load();
      // 만들자마자 바로 전달할 수 있게 링크를 클립보드에 넣어 준다
      const copied = await copyToClipboard(data.url);
      setNotice(copied ? '초대 링크를 만들고 복사했어요' : `초대 링크를 만들었어요 · ${data.url}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (invite) => {
    setError('');
    const ok = await copyToClipboard(invite.url);
    setNotice(ok ? '초대 링크를 복사했어요' : invite.url);
  };

  const revoke = async (invite) => {
    if (!window.confirm('이 초대 링크를 회수할까요?\n회수하면 이 링크로는 가입할 수 없게 됩니다.')) return;

    setError('');
    setNotice('');
    try {
      const response = await fetchWithAuth(`/api/teacher-invites/${invite.id}/revoke`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '회수할 수 없습니다.');

      await load();
      setNotice('초대 링크를 회수했어요');
    } catch (err) {
      setError(err.message);
    }
  };

  const badge = (status) => {
    const s = STATUS[status] || STATUS.pending;
    return <span className={`badge ${s.className}`}>{s.label}</span>;
  };

  const actions = (invite) =>
    invite.status === 'pending' ? (
      <>
        <button className="btn btn-sm btn-outline" onClick={() => copy(invite)}>링크 복사</button>{' '}
        <button className="btn btn-sm btn-outline" onClick={() => revoke(invite)}>회수</button>
      </>
    ) : (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)' }}>
        {invite.status === 'used' ? `${day(invite.usedAt)} 가입` : '-'}
      </span>
    );

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '14px' }}>선생님 초대</h2>

      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 800, marginBottom: '4px' }}>초대 링크 만들기</div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginBottom: '10px', wordBreak: 'keep-all' }}>
          선생님은 이 링크로만 가입할 수 있어요. 링크는 <b>한 번</b> 쓰면 사라지고, 쓰기 전이라면 회수할 수 있어요.
        </p>

        <form onSubmit={create}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: '8px' }}>
            <div>
              <label htmlFor="invite-label" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-gray-500)', marginBottom: '5px' }}>
                메모 (누구에게 주는 링크인가요?)
              </label>
              <input
                id="invite-label"
                type="text"
                value={label}
                maxLength={100}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 김리듬 선생님"
                style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
              />
            </div>
            <div>
              <label htmlFor="invite-expiry" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-gray-500)', marginBottom: '5px' }}>
                만료
              </label>
              <select
                id="invite-expiry"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                style={{ width: '100%', padding: '12px', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)', fontSize: '16px', fontFamily: 'inherit', background: '#fff' }}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={busy}>
            {busy ? '만드는 중...' : '초대 링크 만들기'}
          </button>
        </form>
      </div>

      {error && <div role="alert" className="alert alert-error" style={{ marginBottom: '12px' }}>{error}</div>}
      {notice && <div role="status" className="alert alert-success" style={{ marginBottom: '12px' }}>{notice}</div>}

      {loading ? (
        <div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>불러오는 중...</div>
      ) : invites.length === 0 ? (
        <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>
          아직 만든 초대 링크가 없어요.
        </div>
      ) : isMobile ? (
        <div>
          {invites.map((invite) => (
            <div key={invite.id} className="card" style={{ padding: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontWeight: 700 }}>{invite.label || '(메모 없음)'}</div>
                {badge(invite.status)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                {day(invite.createdAt)} 만듦 · 만료 {invite.expiresAt ? day(invite.expiresAt) : '없음'}
                {invite.usedByName ? ` · ${invite.usedByName}` : ''}
              </div>
              <div style={{ marginTop: '10px' }}>{actions(invite)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>메모</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>상태</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>만든 날</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>만료</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>사용한 계정</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                  <td style={{ padding: '10px 12px' }}>{invite.label || '(메모 없음)'}</td>
                  <td style={{ padding: '10px 12px' }}>{badge(invite.status)}</td>
                  <td style={{ padding: '10px 12px' }}>{day(invite.createdAt)}</td>
                  <td style={{ padding: '10px 12px' }}>{invite.expiresAt ? day(invite.expiresAt) : '없음'}</td>
                  <td style={{ padding: '10px 12px' }}>{invite.usedByName || '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{actions(invite)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminTeacherInvites;
