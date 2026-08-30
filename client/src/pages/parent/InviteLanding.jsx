import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

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
 * 학부모가 초대 링크를 열었을 때 보는 화면 (로그인 불필요).
 * 여기서 시작한 카카오 로그인만 학부모 계정을 만든다.
 *
 * 로그인 화면과 같은 폭·같은 카카오 버튼을 쓴다. 학부모는 거의 휴대폰으로 열기 때문에
 * 버튼은 화면 폭을 꽉 채우고, 좁은 화면에서도 가로 스크롤이 생기지 않아야 한다.
 */
function InviteLanding() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [teacherName, setTeacherName] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) {
          setState('invalid');
          return;
        }
        const data = await response.json();
        setTeacherName(data.teacherName || '');
        setState('valid');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  const startKakao = async () => {
    setError('');
    setStarting(true);
    try {
      // 초대 토큰을 state 로 실어 보내야 서버가 학부모로 가입시킨다
      const response = await fetch(`/api/auth/kakao?invite=${encodeURIComponent(token)}`);
      const data = await response.json();

      if (!response.ok || !data.url) {
        setError(data.error || '카카오 로그인을 시작할 수 없습니다.');
        setStarting(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
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
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-gray-500)', lineHeight: 1.6 }}>
              링크가 바뀌었거나 만료됐을 수 있어요.<br />선생님께 새 초대 링크를 요청해 주세요.
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
            {teacherName ? `${teacherName} 선생님의 초대` : '학부모 초대'}
          </h1>
          <p style={{
            color: 'var(--color-gray-500)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            wordBreak: 'keep-all'
          }}>
            대회·이벤트·휴관일 일정을 확인하고<br />우리 아이 이름으로 바로 신청할 수 있어요.
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

          {/* 로그인 화면과 같은 카카오 버튼 */}
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
            카카오 닉네임·이메일과 다음 단계에서 입력하는 학부모명·아이 이름·생년월일이
            {teacherName ? ` ${teacherName} 선생님` : ' 선생님'}에게 제공됩니다.<br />
            이미 가입했다면 카카오로 바로 로그인돼요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default InviteLanding;
