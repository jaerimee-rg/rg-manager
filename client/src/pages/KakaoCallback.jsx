import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function KakaoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { kakaoLogin } = useAuth();
  const [error, setError] = useState('');
  const isProcessing = useRef(false);

  useEffect(() => {
    const processKakaoLogin = async () => {
      // 이미 처리 중이면 중복 실행 방지
      if (isProcessing.current) return;
      isProcessing.current = true;

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('카카오 로그인이 취소되었습니다.');
        setTimeout(() => navigate('/login'), 2000);
        return;
      }

      if (!code) {
        setError('인증 코드가 없습니다.');
        setTimeout(() => navigate('/login'), 2000);
        return;
      }

      try {
        const result = await kakaoLogin(code, state);

        // 초대가 없어 계정이 만들어지지 않은 경우 — 로그인 화면에서 안내한다
        if (result.outcome === 'needsInvite') {
          navigate('/login?outcome=needsInvite', { replace: true });
          return;
        }

        if (result.role === 'parent') {
          // 학부모는 이름을 따로 정하지 않는다 (카카오 닉네임을 쓴다).
          // 아이를 아직 안 넣었으면 온보딩으로 보낸다.
          navigate(result.needsOnboarding ? '/parent/onboarding' : '/parent/schedule');
        } else if (result.role === 'admin') {
          navigate('/admin');
        } else if (result.isNewUser) {
          // 신규 사용자는 이름 등록 페이지로 이동
          navigate('/register-name');
        } else {
          navigate('/');
        }
      } catch (err) {
        setError(err.message || '카카오 로그인에 실패했습니다.');
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    processKakaoLogin();
  }, [searchParams, kakaoLogin, navigate]);

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
        textAlign: 'center',
        maxWidth: '400px'
      }}>
        {error ? (
          <>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 'var(--radius-xl)',
              backgroundColor: 'var(--color-danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--spacing-lg)',
              fontSize: '1.75rem'
            }}>
              ⚠️
            </div>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--color-gray-900)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              로그인 실패
            </h2>
            <p style={{ color: 'var(--color-gray-500)' }}>{error}</p>
            <p style={{ color: 'var(--color-gray-400)', fontSize: '0.875rem', marginTop: 'var(--spacing-md)' }}>
              잠시 후 로그인 페이지로 이동합니다...
            </p>
          </>
        ) : (
          <>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 'var(--radius-xl)',
              backgroundColor: '#FEE500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--spacing-lg)',
              fontSize: '1.75rem'
            }}>
              💬
            </div>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--color-gray-900)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              카카오 로그인 처리 중...
            </h2>
            <p style={{ color: 'var(--color-gray-500)' }}>잠시만 기다려주세요.</p>
            <div style={{
              marginTop: 'var(--spacing-xl)',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <div className="loading-spinner" style={{
                width: 32,
                height: 32,
                border: '3px solid var(--color-gray-200)',
                borderTopColor: '#FEE500',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default KakaoCallback;
