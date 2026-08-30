import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { afterCreatePath } from '../../utils/roleRoutes';

/**
 * 선생님 계정 만들기 (docs/accounts-roles FR-331).
 *
 * 선생님은 고권한 계정이라 **관리자 초대**가 있어야 만들 수 있다.
 * 관리자 본인은 스스로에게 초대를 발급할 수 있으므로 토큰 없이 바로 만든다.
 */
function TeacherAccountDialog({ needsInvite, onClose, onDone }) {
  const { addRole, user } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (token) => {
    setError('');
    setBusy(true);
    try {
      const data = await addRole('user', token);
      await onDone?.();
      onClose?.();
      navigate(afterCreatePath('user', data));
    } catch (err) {
      setError(err.message || '계정을 만들 수 없어요.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (needsInvite && !invite.trim()) return setError('초대 링크를 입력해 주세요.');
    create(invite.trim() || undefined);
  };

  return (
    <div className="role-dialog-backdrop" role="dialog" aria-modal="true" aria-label="선생님 계정 만들기">
      <div className="role-dialog">
        <h2 className="role-dialog-title">선생님 계정 만들기</h2>
        <p className="role-dialog-desc">
          {needsInvite
            ? '선생님 계정은 관리자가 발급한 초대 링크로만 만들 수 있어요.'
            : '관리자는 초대 없이 선생님 계정을 만들 수 있어요. 만든 뒤 이름을 정합니다.'}
        </p>

        <form onSubmit={submit}>
          {needsInvite && (
            <>
              <label htmlFor="teacher-invite" className="role-dialog-label">관리자에게 받은 초대 링크</label>
              <input
                id="teacher-invite"
                type="text"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="https://rg-manager.vercel.app/teacher-invite/…"
                className="role-dialog-input"
              />
            </>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={busy}>
            {busy ? '만드는 중…' : '선생님 계정 만들기'}
          </button>
        </form>

        {error && <div role="alert" className="role-dialog-error">{error}</div>}

        {user?.role === 'admin' && (
          <p className="role-dialog-hint">
            새 선생님 계정에는 학생·수업이 없어요. 기존 데이터를 옮기려면
            관리자 &gt; 사용자의 <b>데이터 이전</b>을 쓰세요.
          </p>
        )}

        <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '10px' }} onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

export default TeacherAccountDialog;
