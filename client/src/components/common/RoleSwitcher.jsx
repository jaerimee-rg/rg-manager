import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homePathFor, roleLabel, ROLE_ORDER } from '../../utils/roleRoutes';
import { userLabel } from '../../utils/userName';
import ParentAccountDialog from './ParentAccountDialog';
import TeacherAccountDialog from './TeacherAccountDialog';

const ICONS = { admin: '🛠️', user: '🎀', parent: '👨‍👩‍👧' };

/**
 * 역할 전환 메뉴 (docs/accounts-roles FR-322).
 *
 * 한 카카오 계정이 관리자·선생님·학부모 계정을 각각 가질 수 있으므로,
 * 가진 역할은 "○○ 화면으로", 없는 역할은 "○○ 계정 만들기" 로 보여준다.
 * 보여줄 것이 하나도 없으면 아무 것도 그리지 않는다 (FR-323).
 *
 * variant
 *   menu — 선생님 헤더의 드롭다운
 *   list — 관리자 사이드바·모바일 메뉴의 항목들
 *   card — 설정·내 정보의 카드
 */
function RoleSwitcher({ variant = 'card', onNavigate }) {
  const { user, listRoles, switchRole, impersonator } = useAuth();
  const navigate = useNavigate();

  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // 'user' | 'parent'

  const load = useCallback(async () => {
    try {
      setInfo(await listRoles());
    } catch {
      // 역할 정보를 못 읽으면 메뉴를 숨긴다 (기존 화면은 그대로 동작해야 한다)
      setInfo(null);
    }
  }, [listRoles]);

  useEffect(() => {
    load();
  }, [load]);

  const go = async (role) => {
    setError('');
    setBusy(role);
    try {
      await switchRole(role);
      onNavigate?.();
      navigate(homePathFor(role));
    } catch (err) {
      setError(err.message || '전환할 수 없어요.');
    } finally {
      setBusy('');
    }
  };

  const openDialog = (role) => {
    setOpen(false);
    onNavigate?.();
    setDialog(role);
  };

  // 관리자가 다른 계정으로 들어와 있으면 서버가 전환을 막는다(403) — 메뉴도 보이지 않는다 (FR-388)
  if (impersonator) return null;
  if (!info || !info.kakao) return null;

  const others = ROLE_ORDER.filter(
    (role) => role !== user?.role && info.accounts.some((a) => a.role === role)
  );
  const creatable = ROLE_ORDER.filter((role) => info.canCreate?.[role]);

  if (!others.length && !creatable.length) return null;

  const nameOf = (role) => userLabel(info.accounts.find((a) => a.role === role));

  const items = (
    <>
      {others.map((role) => (
        <button
          key={role}
          type="button"
          className="role-switch-item"
          disabled={busy === role}
          onClick={() => go(role)}
        >
          <span>{ICONS[role]} {roleLabel(role)} 화면으로</span>
          <small>{busy === role ? '전환 중…' : nameOf(role)}</small>
        </button>
      ))}

      {creatable.map((role) => (
        <button
          key={`new-${role}`}
          type="button"
          className="role-switch-item"
          onClick={() => openDialog(role)}
        >
          <span>＋ {roleLabel(role)} 계정 만들기</span>
        </button>
      ))}
    </>
  );

  const help = '전환하면 이 브라우저의 모든 탭이 그 역할로 바뀝니다.';

  const dialogs = (
    <>
      {dialog === 'parent' && (
        <ParentAccountDialog
          needsInvite={info.parentNeedsInvite}
          onClose={() => setDialog(null)}
          onDone={load}
        />
      )}
      {dialog === 'user' && (
        <TeacherAccountDialog
          needsInvite={info.teacherNeedsInvite}
          onClose={() => setDialog(null)}
          onDone={load}
        />
      )}
    </>
  );

  if (variant === 'menu') {
    return (
      <div className="role-switch-menu">
        <button
          type="button"
          className="role-switch-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`badge badge-${user?.role === 'admin' ? 'primary' : 'gray'}`}>
            {roleLabel(user?.role)}
          </span>
          <span className="role-switch-name">{userLabel(user)}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {open && (
          <>
            <div className="role-switch-backdrop" onClick={() => setOpen(false)} />
            <div className="role-switch-dropdown" role="menu">
              <div className="role-switch-current">
                현재: <b>{roleLabel(user?.role)}</b> {userLabel(user)}
              </div>
              {items}
              {error && <div role="alert" className="role-switch-error">{error}</div>}
              <div className="role-switch-help">{help}</div>
            </div>
          </>
        )}
        {dialogs}
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className="role-switch-list">
        {items}
        {error && <div role="alert" className="role-switch-error">{error}</div>}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', marginBottom: '4px' }}>
        역할 전환
      </h3>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.5, marginBottom: '6px' }}>
        같은 카카오 계정으로 가진 다른 역할로 바로 바꿀 수 있어요.
      </p>
      <div className="role-switch-list">{items}</div>
      {error && <div role="alert" className="role-switch-error">{error}</div>}
      <p style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', marginTop: '8px' }}>{help}</p>
      {dialogs}
    </div>
  );
}

export default RoleSwitcher;
