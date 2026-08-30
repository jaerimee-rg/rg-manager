import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { getKakaoLoginUrl } = useAuth();

  /* 초대 없이 카카오로 들어와 계정이 만들어지지 않은 경우 (FR-306).
     예전에는 여기서 선생님 계정이 자동으로 생겼다. */
  const needsInvite = searchParams.get('outcome') === 'needsInvite';

  const handleKakaoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const url = await getKakaoLoginUrl();
      window.location.href = url;
    } catch (err) {
      setError(err.message || '카카오 로그인을 시작할 수 없습니다.');
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
        {/* Logo / Title */}
        <div style={{
          textAlign: 'center',
          marginBottom: 'var(--spacing-3xl)'
        }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--spacing-xl)',
            fontSize: '2.5rem'
          }}>
            🎀
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--color-gray-900)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            리듬체조 출석 관리
          </h1>
          <p style={{
            color: 'var(--color-gray-500)',
            fontSize: '0.9375rem',
            lineHeight: 1.6
          }}>
            카카오 계정으로 간편하게 시작하세요
          </p>
        </div>

        {/* Login Card */}
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

          {needsInvite && (
            <div
              role="alert"
              style={{
                marginBottom: 'var(--spacing-lg)',
                background: 'var(--color-warning-bg, #FFF7DC)',
                color: 'var(--color-warning, #B8860B)',
                padding: '13px 15px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                wordBreak: 'keep-all'
              }}
            >
              <b>가입에는 초대가 필요해요.</b><br />
              <b>선생님</b>이라면 관리자에게, <b>학부모</b>라면 다니는 학원 선생님에게
              초대 링크를 요청해 주세요.
            </div>
          )}

          {/* 카카오 로그인 버튼 */}
          <button
            type="button"
            onClick={handleKakaoLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 20px',
              backgroundColor: '#FEE500',
              color: '#000000',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              fontSize: '1.0625rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacing-sm)',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#000000">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.89 5.33 4.71 6.73-.14.51-.93 3.3-.96 3.51 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.68-2.42 4.26-2.83.55.08 1.1.12 1.66.12 5.52 0 10-3.58 10-8 0-4.42-4.48-8-10-8z"/>
            </svg>
            {loading ? '로그인 중...' : '카카오로 시작하기'}
          </button>

          <p style={{
            textAlign: 'center',
            marginTop: 'var(--spacing-xl)',
            color: 'var(--color-gray-400)',
            fontSize: '0.8125rem',
            lineHeight: 1.6
          }}>
            초대를 받은 분만 가입할 수 있어요.<br />초대 링크가 있으면 그 링크를 눌러 주세요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
