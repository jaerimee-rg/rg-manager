import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { afterCreatePath } from '../../utils/roleRoutes';

/**
 * 학부모 계정 만들기 (docs/accounts-roles FR-334).
 *
 * 선생님은 초대 없이 **자기 학원 학부모**가 될 수 있고(자기 학생과 연결하면 되므로),
 * 그 밖에는 선생님이 준 초대 링크가 있어야 한다.
 */
function ParentAccountDialog({ needsInvite, onClose, onDone }) {
  const { addRole } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const create = async (token) => {
    setError('');
    setBusy(token ? 'invite' : 'self');
    try {
      const data = await addRole('parent', token);
      await onDone?.();
      onClose?.();
      navigate(afterCreatePath('parent', data));
    } catch (err) {
      setError(err.message || '계정을 만들 수 없어요.');
    } finally {
      setBusy('');
    }
  };

  const submitInvite = (e) => {
    e.preventDefault();
    if (!invite.trim()) return setError('초대 링크를 입력해 주세요.');
    create(invite.trim());
  };

  return (
    <div className="role-dialog-backdrop" role="dialog" aria-modal="true" aria-label="학부모 계정 만들기">
      <div className="role-dialog">
        <h2 className="role-dialog-title">학부모 계정 만들기</h2>
        <p className="role-dialog-desc">
          같은 카카오 계정으로 학부모 계정을 하나 더 만듭니다. 만든 뒤 아이를 등록해요.
        </p>

        {!needsInvite && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={Boolean(busy)}
              onClick={() => create()}
            >
              {busy === 'self' ? '만드는 중…' : '내 학원 학부모로 가입'}
            </button>
            <p className="role-dialog-hint">내 학생 명단과 대조해 아이를 연결해요.</p>
            <div className="role-dialog-or">또는</div>
          </>
        )}

        <form onSubmit={submitInvite}>
          <label htmlFor="parent-invite" className="role-dialog-label">
            선생님께 받은 초대 링크
          </label>
          <input
            id="parent-invite"
            type="text"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="https://rg-manager.vercel.app/invite/…"
            className="role-dialog-input"
          />
          <button type="submit" className="btn btn-outline" style={{ width: '100%', marginTop: '10px' }} disabled={Boolean(busy)}>
            {busy === 'invite' ? '연결 중…' : '초대 링크로 가입'}
          </button>
        </form>

        {error && <div role="alert" className="role-dialog-error">{error}</div>}

        <button type="button" className="btn btn-outline" style={{ width: '100%', marginTop: '10px' }} onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

export default ParentAccountDialog;
