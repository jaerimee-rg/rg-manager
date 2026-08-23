import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

/**
 * 학부모가 초대 링크를 열었을 때 보는 화면 (로그인 불필요).
 * 여기서 시작한 카카오 로그인만 학부모 계정을 만든다.
 */
function InviteLanding() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [teacherName, setTeacherName] = useState('');
  const [error, setError] = useState('');

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
    try {
      // 초대 토큰을 state 로 실어 보내야 서버가 학부모로 가입시킨다
      const response = await fetch(`/api/auth/kakao?invite=${encodeURIComponent(token)}`);
      const data = await response.json();

      if (!response.ok || !data.url) {
        setError(data.error || '카카오 로그인을 시작할 수 없습니다.');
        return;
      }

      window.location.href = data.url;
    } catch {
      setError('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  if (state === 'loading') {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center', color: 'var(--color-gray-500)' }}>
          초대 링크를 확인하는 중...
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔗</div>
          <h1 style={{ fontSize: '1.125rem', marginBottom: '8px' }}>유효하지 않은 초대 링크예요</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)', lineHeight: 1.6 }}>
            링크가 바뀌었거나 만료됐을 수 있어요.<br />선생님께 새 초대 링크를 요청해 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>🎀</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
            {teacherName ? `${teacherName} 선생님의 초대` : '학부모 초대'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
            대회·이벤트·휴관일 일정을 확인하고<br />우리 아이 이름으로 바로 신청할 수 있어요.
          </p>
        </div>

        <button type="button" className="kakao-login-button" onClick={startKakao}>
          카카오로 시작하기
        </button>

        {error && (
          <div role="alert" style={{
            marginTop: '12px', background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
            padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem'
          }}>
            {error}
          </div>
        )}

        <p style={{
          fontSize: '0.6875rem', color: 'var(--color-gray-400)',
          lineHeight: 1.6, marginTop: '16px', textAlign: 'center'
        }}>
          카카오 닉네임·이메일과 다음 단계에서 입력하는 아이 이름·생년월일이
          {teacherName ? ` ${teacherName} 선생님` : ' 선생님'}에게 제공됩니다.<br />
          이미 가입했다면 카카오로 바로 로그인돼요.
        </p>
      </div>
    </div>
  );
}

export default InviteLanding;
