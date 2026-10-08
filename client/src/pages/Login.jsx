import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { peekReturnTo, isEventSharePath, albumShareOf } from '../utils/returnTo';
import { Brand } from '../components/ui';

const shareNotice = {
  marginBottom: 'var(--spacing-lg)',
  background: 'var(--color-primary-bg)',
  color: 'var(--color-gray-700)',
  padding: '13px 15px',
  borderRadius: 'var(--shape-box)',
  fontSize: '0.875rem',
  lineHeight: 1.6,
  wordBreak: 'keep-all'
};

function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { getKakaoLoginUrl } = useAuth();

  /* 초대 없이 카카오로 들어와 계정이 만들어지지 않은 경우 (FR-306).
     예전에는 여기서 선생님 계정이 자동으로 생겼다. */
  const needsInvite = searchParams.get('outcome') === 'needsInvite';

  /* 선생님이 보낸 이벤트 공유 링크를 눌러 여기로 온 학부모 — 로그인하면 그 이벤트로 돌아간다. */
  const fromEventLink = isEventSharePath(peekReturnTo());

  /* 선생님이 보낸 사진 폴더 링크 (docs/photo-menu FR-518). 링크에 그 선생님의 초대가 실려 있어서
     처음 온 학부모도 여기서 바로 가입한다 — 그래서 카카오 로그인에 그 초대를 함께 보낸다. */
  const [albumShare] = useState(() => albumShareOf(peekReturnTo()));
  const [sharedBy, setSharedBy] = useState('');
  const shareInvite = albumShare?.invite || null;

  useEffect(() => {
    if (!shareInvite) return undefined;
    let stale = false;
    // 누가 보냈는지 알려 준다. 못 읽어도(초대가 바뀜 등) 로그인은 그대로 된다 — 이름만 빠진다.
    fetch(`/api/invite/${encodeURIComponent(shareInvite)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!stale && data?.teacherName) setSharedBy(data.teacherName); })
      .catch(() => {});
    return () => { stale = true; };
  }, [shareInvite]);

  const handleKakaoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const url = await getKakaoLoginUrl(shareInvite ? { invite: shareInvite, soft: true } : {});
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
          <Brand as="h1" size="lg" style={{ marginBottom: 'var(--spacing-sm)' }} />
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
          border: 'var(--stroke)',
          borderRadius: 'var(--shape-panel)'
        }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-lg)' }}>
              {error}
            </div>
          )}

          {fromEventLink && !needsInvite && (
            <div role="status" style={shareNotice}>
              <b>공유받은 이벤트가 있어요.</b><br />
              카카오로 로그인하면 그 이벤트 신청 화면이 바로 열려요.
            </div>
          )}

          {albumShare && !needsInvite && (
            <div role="status" style={shareNotice}>
              <b>{sharedBy ? `${sharedBy} 선생님이 사진을 공유했어요.` : '공유받은 사진이 있어요.'}</b><br />
              카카오로 로그인하면 그 사진이 바로 열려요.
              {shareInvite && ' 처음이라면 로그인 뒤 아이 정보만 등록하면 돼요.'}
            </div>
          )}

          {needsInvite && (
            <div
              role="alert"
              style={{
                marginBottom: 'var(--spacing-lg)',
                background: 'var(--color-warning-bg)',
                color: 'var(--color-warning)',
                padding: '13px 15px',
                borderRadius: 'var(--shape-box)',
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
              backgroundColor: 'var(--kakao)',
              color: '#000000',
              border: 'var(--stroke)',
              borderRadius: 'var(--shape-btn)',
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
            {shareInvite
              ? <>처음이어도 괜찮아요.<br />받은 사진 링크로 바로 가입할 수 있어요.</>
              : <>초대를 받은 분만 가입할 수 있어요.<br />초대 링크가 있으면 그 링크를 눌러 주세요.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
