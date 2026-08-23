import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

/** 클립보드 API 가 없거나 막힌 환경(비HTTPS·구형 사파리)을 위한 폴백 */
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
};

function InviteLinkBox({ onToast }) {
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    fetchWithAuth('/api/parents/invite')
      .then((r) => (r.ok ? r.json() : null))
      .then(setInvite)
      .catch(() => {});
  }, []);

  const copy = async () => {
    if (!invite) return;
    const ok = await copyText(invite.url);
    onToast?.(ok ? '초대 링크를 복사했어요 · 카톡방에 붙여 넣으세요' : invite.url);
  };

  const regenerate = async () => {
    if (!confirm('링크를 새로 발급할까요?\n기존 링크는 즉시 사용할 수 없게 됩니다. (이미 가입한 학부모는 영향 없어요)')) return;

    const response = await fetchWithAuth('/api/parents/invite/regenerate', { method: 'POST' });
    if (response.ok) {
      setInvite(await response.json());
      onToast?.('새 초대 링크를 발급했어요');
    }
  };

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '14px' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginBottom: '10px', lineHeight: 1.6 }}>
        학부모 초대 링크 — 카톡방에 한 번 올리면 됩니다. 이 링크로 들어온 학부모만 카카오로 가입할 수 있고,
        가입 때 입력한 아이 이름·생년월일이 학생 명단과 맞으면 자동으로 연결돼요.
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: '220px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
          padding: '11px 13px', fontSize: '0.8125rem', color: 'var(--color-gray-700)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Menlo, monospace'
        }}>
          {invite ? invite.url : '링크를 불러오는 중...'}
        </div>
        <button className="btn btn-outline btn-sm" onClick={copy} disabled={!invite}>복사</button>
        <button className="btn btn-ghost btn-sm" onClick={regenerate} disabled={!invite}>재발급</button>
      </div>
    </div>
  );
}

export default InviteLinkBox;
export { copyText };
