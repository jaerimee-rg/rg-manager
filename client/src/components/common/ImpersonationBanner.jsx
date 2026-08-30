import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { roleLabel } from '../../utils/roleRoutes';
import { hardNavigate } from '../../utils/navigation';

/**
 * 관리자가 다른 계정으로 들어와 있는 동안 화면 맨 위에 붙는 띠 (docs/accounts-roles FR-388).
 * 세 역할 화면(선생님·관리자·학부모) 모두 App.jsx 에서 같은 자리에 그린다.
 * 돌아갈 관리자 세션이 없으면(저장소 유실) 돌아가기 대신 로그아웃을 권한다.
 */
function ImpersonationBanner() {
  const { user, impersonator, stopImpersonating, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!impersonator || !user) return null;

  const canReturn = Boolean(impersonator.token);

  const back = async () => {
    setBusy(true);
    try {
      if (!canReturn) {
        logout();
        return;
      }
      const admin = await stopImpersonating();
      // 전체 새로고침으로 대상 계정으로 읽어 둔 화면 상태를 모두 버린다
      hardNavigate(admin ? '/admin/users' : '/login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="impersonation-banner" role="status" data-testid="impersonation-banner">
      <span className="impersonation-banner-text">
        🕵️ <b>{impersonator.username}</b> 관리자가 <b>{user.username}</b>({roleLabel(user.role)}) 계정으로 보고 있어요
      </span>
      <button type="button" className="impersonation-banner-btn" disabled={busy} onClick={back}>
        {busy ? '돌아가는 중…' : canReturn ? '관리자로 돌아가기' : '로그아웃'}
      </button>
    </div>
  );
}

export default ImpersonationBanner;
