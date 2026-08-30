import React, { createContext, useState, useContext, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { saveToken, getToken, saveUser, getUser, clearAuth, saveLastRole, getLastRole } from '../utils/tokenStorage';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * 로그인·전환·역할 생성이 모두 같은 방식으로 세션을 갈아 끼운다.
   * 마지막 역할을 함께 남겨 다음 카카오 로그인이 같은 계정으로 들어오게 한다.
   */
  const applySession = (data) => {
    setUser(data.user);
    setToken(data.token);
    saveUser(data.user);
    saveToken(data.token);
    saveLastRole(data.role || data.user?.role);
  };

  useEffect(() => {
    const verifyStoredToken = async () => {
      const storedToken = getToken();
      const storedUser = getUser();

      if (!storedToken || !storedUser) {
        setLoading(false);
        return;
      }

      // 저장된 사용자 정보로 먼저 로그인 상태 설정 (빠른 UX)
      setUser(storedUser);
      setToken(storedToken);

      try {
        const response = await fetch('/api/auth/verify', {
          headers: {
            'Authorization': `Bearer ${storedToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          saveUser(data.user);
        } else {
          // Token is invalid or expired - logout
          setUser(null);
          setToken(null);
          clearAuth();
        }
      } catch (error) {
        // 네트워크 오류 시 저장된 정보로 로그인 유지
        console.error('Token verification failed (network error):', error);
      }

      setLoading(false);
    };

    verifyStoredToken();
  }, []);

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    applySession(data);
    return data.user;
  };

  const signup = async (username, password) => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    setUser(data.user);
    setToken(data.token);
    saveUser(data.user);
    saveToken(data.token);
    return data.user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    clearAuth();
  };

  /**
   * 카카오 로그인 URL 가져오기.
   * 초대 토큰(학부모 invite / 선생님 tinvite)과 "마지막에 쓰던 역할" 힌트를 함께 보낸다.
   * 힌트가 있으면 계정이 여럿인 사람이 매번 같은 역할로 들어온다 (FR-301).
   */
  const getKakaoLoginUrl = async ({ invite, tinvite } = {}) => {
    const params = new URLSearchParams();
    if (invite) params.set('invite', invite);
    if (tinvite) params.set('tinvite', tinvite);

    const prefer = getLastRole();
    if (prefer) params.set('prefer', prefer);

    const query = params.toString();
    const response = await fetch(`/api/auth/kakao${query ? `?${query}` : ''}`);
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        throw new Error(error.error || '카카오 로그인 URL을 가져올 수 없습니다.');
      }
      throw new Error('카카오 로그인 URL을 가져올 수 없습니다.');
    }
    const data = await response.json();
    return data.url;
  };

  // 카카오 로그인 콜백 처리
  const kakaoLogin = async (code, state) => {
    const response = await fetch('/api/auth/kakao/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // state 에는 학부모 초대 토큰이 실려 온다 (선생님 로그인은 비어 있다)
      body: JSON.stringify({ code, state })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();

        /* 초대가 없어 가입이 막힌 경우는 "실패" 가 아니라 안내할 상태다.
           화면이 무엇을 해야 하는지 알려줄 수 있게 던지지 않고 돌려준다 (FR-306). */
        if (error.outcome) return { outcome: error.outcome, error: error.error };

        throw new Error(error.error || '카카오 로그인에 실패했습니다.');
      }
      throw new Error('카카오 로그인에 실패했습니다. 서버 오류가 발생했습니다.');
    }

    const data = await response.json();
    applySession(data);
    return {
      user: data.user,
      isNewUser: data.isNewUser,
      role: data.role || data.user?.role,
      needsOnboarding: data.needsOnboarding === true,
      accounts: data.accounts || []
    };
  };

  /* ── 역할 전환 · 역할 계정 만들기 (docs/accounts-roles §5.3~5.4) ── */

  /** 이 카카오 계정이 가진 계정들과 만들 수 있는 역할 */
  const listRoles = async () => {
    const response = await fetchWithAuth('/api/auth/roles');
    if (!response.ok) throw new Error('역할 정보를 가져올 수 없습니다.');
    return response.json();
  };

  /**
   * 같은 카카오 계정의 다른 역할로 갈아탄다 (카카오 재인증 없음).
   * 세션 교체이므로 이 브라우저의 다른 탭도 다음 요청부터 새 역할로 동작한다.
   */
  const switchRole = async (role) => {
    const response = await fetchWithAuth('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role })
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || '역할을 전환할 수 없습니다.');
      error.canCreate = data.canCreate === true;
      throw error;
    }

    applySession(data);
    return data;
  };

  /** 없는 역할의 계정을 만들고 바로 그 역할로 전환한다 */
  const addRole = async (role, invite) => {
    const response = await fetchWithAuth('/api/auth/roles', {
      method: 'POST',
      body: JSON.stringify({ role, invite })
    });

    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || '계정을 만들 수 없습니다.');
      error.needsInvite = data.needsInvite === true;
      throw error;
    }

    applySession(data);
    return data;
  };

  // 사용자 이름 설정
  const updateUserName = async (username) => {
    const response = await fetch('/api/auth/username', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    setUser(data.user);
    saveUser(data.user);
    return data.user;
  };

  // 내 정보가 다른 화면(관리자 사용자 관리 등)에서 바뀐 뒤 다시 읽어온다.
  const refreshUser = async () => {
    const currentToken = token || getToken();
    if (!currentToken) return null;

    try {
      const response = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (!response.ok) return null;

      const data = await response.json();
      setUser(data.user);
      saveUser(data.user);
      return data.user;
    } catch (error) {
      console.error('사용자 정보 갱신 실패:', error);
      return null;
    }
  };

  const value = {
    user,
    token,
    login,
    signup,
    logout,
    loading,
    getKakaoLoginUrl,
    kakaoLogin,
    updateUserName,
    refreshUser,
    listRoles,
    switchRole,
    addRole
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
