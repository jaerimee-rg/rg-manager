import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userLabel } from '../utils/userName';

/** `카카오_1788076610466` 같은 자동 식별자는 이름이 아니므로 미리 채우지 않는다 */
const PLACEHOLDER_RE = /^카카오_?\d+(_\d+)?$/;

function RegisterName() {
  const { user, updateUserName } = useAuth();
  // 초대·역할 추가로 만든 계정은 닉네임·현재 계정 이름이 표시 이름으로 미리 들어 있다
  const initial = userLabel(user);
  const [name, setName] = useState(PLACEHOLDER_RE.test(initial) ? '' : initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // 로그인 안 되어 있으면 로그인 페이지로
  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (name.trim().length < 2) {
      setError('이름은 2자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    try {
      await updateUserName(name.trim());
      navigate('/');
    } catch (err) {
      setError(err.message || '이름 설정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: 'var(--spacing-lg)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: 'var(--spacing-3xl)'
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--radius-xl)',
            backgroundColor: '#FEE500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--spacing-xl)',
            fontSize: '2.5rem'
          }}>
            👋
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--color-gray-900)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            환영합니다!
          </h1>
          <p style={{
            color: 'var(--color-gray-500)',
            fontSize: '0.9375rem',
            lineHeight: 1.6
          }}>
            사용하실 이름을 입력해주세요
          </p>
        </div>

        {/* Form Card */}
        <div className="card" style={{
          padding: 'var(--spacing-2xl)',
          border: 'none',
          boxShadow: 'var(--shadow-md)'
        }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-lg)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">이름</label>
              <input
                type="text"
                placeholder="예: 홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                style={{
                  fontSize: '1.125rem',
                  padding: '16px'
                }}
              />
              <p style={{
                color: 'var(--color-gray-500)',
                fontSize: '0.8125rem',
                marginTop: 'var(--spacing-sm)'
              }}>
                관리자 화면에서 표시되는 이름입니다.
              </p>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '1.0625rem',
                marginTop: 'var(--spacing-lg)'
              }}
            >
              {loading ? '설정 중...' : '시작하기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RegisterName;
