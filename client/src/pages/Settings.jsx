import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';
import { useIsMobile } from '../hooks/useMediaQuery';
import DriveAccountCard from './Settings/DriveAccountCard';

function Settings() {
  const { user, logout, updateUserName } = useAuth();
  const navigate = useNavigate();
  const [kakaoMessageConsent, setKakaoMessageConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  // 표시 이름 변경 (카카오 계정은 가입 시 자동 이름이 붙어 특히 필요하다)
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      const response = await fetchWithAuth('/api/auth/verify');
      const data = await response.json();
      if (data.user) {
        setKakaoMessageConsent(data.user.kakaoMessageConsent || false);
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  };

  const startEditName = () => {
    setNameInput(user?.username || '');
    setNameError('');
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameError('');
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (savingName) return;

    const nextName = nameInput.trim();
    if (!nextName) {
      setNameError('이름을 입력해주세요.');
      return;
    }
    if (nextName === user?.username) {
      cancelEditName();
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      await updateUserName(nextName);
      setEditingName(false);
    } catch (error) {
      // 실패 시 입력값을 지우지 않고 이유만 보여준다.
      setNameError(error.message || '이름 변경에 실패했습니다.');
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleKakaoConsent = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/api/auth/kakao/consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: !kakaoMessageConsent })
      });

      if (response.ok) {
        setKakaoMessageConsent(!kakaoMessageConsent);
        alert(kakaoMessageConsent ? '카카오톡 알림이 비활성화되었습니다.' : '카카오톡 알림이 활성화되었습니다.');
      } else {
        const data = await response.json();
        alert(data.error || '설정 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('설정 변경 실패:', error);
      alert('설정 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">설정</h2>
      </div>

      {/* User Info Card */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-header">
          <h3 className="card-title">내 정보</h3>
        </div>
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '120px 1fr',
            gap: 'var(--spacing-md)',
            alignItems: 'center'
          }}>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>사용자명</span>
            {editingName ? (
              <form onSubmit={handleSaveName}>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={30}
                    autoFocus
                    aria-label="사용자명"
                    style={{ flex: 1, minWidth: 140 }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingName}>
                    {savingName ? '저장 중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={cancelEditName}
                    disabled={savingName}
                  >
                    취소
                  </button>
                </div>
                {nameError && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 'var(--spacing-sm)',
                      color: 'var(--color-danger)',
                      fontSize: '0.8125rem'
                    }}
                  >
                    {nameError}
                  </div>
                )}
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                  {user?.username}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={startEditName}>
                  이름 변경
                </button>
              </div>
            )}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '120px 1fr',
            gap: 'var(--spacing-md)',
            alignItems: 'center',
            marginTop: 'var(--spacing-md)'
          }}>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>이메일</span>
            <span style={{ color: 'var(--color-gray-900)' }}>{user?.email || '-'}</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '120px 1fr',
            gap: 'var(--spacing-md)',
            alignItems: 'center',
            marginTop: 'var(--spacing-md)'
          }}>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>계정 유형</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {user?.kakaoId ? (
                <>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    backgroundColor: '#FEE500',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}>
                    💬
                  </span>
                  <span style={{ color: 'var(--color-gray-900)' }}>카카오 계정</span>
                </>
              ) : (
                <span style={{ color: 'var(--color-gray-900)' }}>일반 계정</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings Card */}
      {user?.kakaoId && (
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <h3 className="card-title">알림 설정</h3>
          </div>
          <div style={{ marginTop: 'var(--spacing-lg)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--spacing-lg)',
              padding: 'var(--spacing-lg)',
              backgroundColor: 'var(--color-gray-50)',
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  backgroundColor: '#FEE500',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}>
                  💬
                </span>
                <span style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>
                  카카오톡 알림
                </span>
              </div>
              <div
                onClick={loading ? undefined : handleToggleKakaoConsent}
                style={{
                  width: 52,
                  height: 28,
                  backgroundColor: kakaoMessageConsent ? 'var(--color-success)' : 'var(--color-gray-300)',
                  borderRadius: 14,
                  position: 'relative',
                  transition: 'background-color 0.2s',
                  cursor: loading ? 'wait' : 'pointer',
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: 24,
                  height: 24,
                  backgroundColor: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: 2,
                  left: kakaoMessageConsent ? 26 : 2,
                  transition: 'left 0.2s',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Card */}
      <DriveAccountCard />

      {/* Admin Dashboard Card */}
      {user?.role === 'admin' && (
        <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="card-header">
            <h3 className="card-title">관리자</h3>
          </div>
          <div style={{ marginTop: 'var(--spacing-lg)' }}>
            <div
              onClick={() => navigate('/admin')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                padding: 'var(--spacing-lg)',
                backgroundColor: 'var(--color-primary-bg)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
                border: '1px solid var(--color-primary)'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-hover-bg)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-primary-bg)'}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                backgroundColor: 'var(--color-primary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '1.25rem'
              }}>
                🛠️
              </span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-gray-900)' }}>관리자 대시보드</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-gray-500)' }}>
                  학생, 수업, 대회, 출석, 사용자 통합 관리
                </div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'var(--color-primary)', fontSize: '1.25rem' }}>→</span>
            </div>
          </div>
        </div>
      )}

      {/* Account Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">계정</h3>
        </div>
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <div
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-md)',
              padding: 'var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-gray-100)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{ fontSize: '1.25rem' }}>🚪</span>
            <span style={{ fontWeight: 500, color: 'var(--color-danger)' }}>로그아웃</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
