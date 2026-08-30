import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const page = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-primary)',
  padding: 'var(--spacing-lg)'
};

const column = { width: '100%', maxWidth: '400px' };

const card = {
  background: 'var(--bg-secondary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--spacing-2xl)',
  boxShadow: 'var(--shadow-md)'
};

/**
 * 관리자가 보낸 선생님 초대 링크를 연 화면 (로그인 불필요).
 *
 * 선생님 계정은 학원 데이터 전체를 갖는 고권한 계정이라, 이 링크를 거친
 * 카카오 로그인만 계정을 만든다. 학부모 초대(InviteLanding)와 달리 **일회용**이다.
 */
function TeacherInviteLanding() {
  const { token } = useParams();
  const { getKakaoLoginUrl } = useAuth();
  const [state, setState] = useState('loading');
  const [adminName, setAdminName] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch(`/api/teacher-invite/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) {
          setState('invalid');
          return;
        }
        const data = await response.json();
        setAdminName(data.adminName || '');
        setExpiresAt(data.expiresAt || null);
        setState('valid');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const startKakao = async () => {
    setError('');
    setStarting(true);
    try {
      // 초대 토큰을 state 로 실어 보내야 서버가 선생님으로 가입시킨다
      const url = await getKakaoLoginUrl({ tinvite: token });
      window.location.href = url;
    } catch (err) {
      setError(err.message || '카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      setStarting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div style={page}>
        <div style={{ ...column, textAlign: 'center', color: 'var(--color-gray-500)' }}>
          초대 링크를 확인하는 중...
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div style={page}>
        <div style={column}>
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-md)' }}>🔗</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--spacing-sm)' }}>
              유효하지 않은 초대 링크예요
            </h1>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-gray-500)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
              이미 사용됐거나 만료·회수됐을 수 있어요.<br />관리자에게 새 초대 링크를 요청해 주세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={column}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
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
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--color-gray-900)',
            marginBottom: 'var(--spacing-sm)',
            wordBreak: 'keep-all'
          }}>
            {adminName ? `${adminName} 관리자의 초대` : '선생님 초대'}
          </h1>
          <p style={{
            color: 'var(--color-gray-500)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            wordBreak: 'keep-all'
          }}>
            카카오로 시작하면 <b>선생님 계정</b>이 만들어져요.<br />
            학생·수업·출석·이벤트를 직접 관리할 수 있어요.
          </p>
        </div>

        <div style={card}>
          {error && (
            <div role="alert" style={{
              marginBottom: 'var(--spacing-lg)',
              background: 'var(--color-danger-bg)',
              color: 'var(--color-danger)',
              padding: '11px 13px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          {/* 로그인·학부모 초대 화면과 같은 카카오 버튼 */}
          <button
            type="button"
            onClick={startKakao}
            disabled={starting}
            style={{
              width: '100%',
              padding: '16px 20px',
              backgroundColor: '#FEE500',
              color: '#000000',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              fontSize: '1.0625rem',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: starting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacing-sm)',
              opacity: starting ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#000000" aria-hidden="true">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.89 5.33 4.71 6.73-.14.51-.93 3.3-.96 3.51 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.68-2.42 4.26-2.83.55.08 1.1.12 1.66.12 5.52 0 10-3.58 10-8 0-4.42-4.48-8-10-8z" />
            </svg>
            {starting ? '카카오로 이동 중...' : '카카오로 시작하기'}
          </button>

          <p style={{
            textAlign: 'center',
            marginTop: 'var(--spacing-xl)',
            color: 'var(--color-gray-400)',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            wordBreak: 'keep-all'
          }}>
            이 링크는 <b>한 번만</b> 사용할 수 있어요.
            {expiresAt && <> · {String(expiresAt).slice(0, 10)}까지</>}<br />
            이미 선생님 계정이 있다면 그대로 로그인돼요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default TeacherInviteLanding;
