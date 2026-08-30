import React, { createContext, useState, useContext, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import {
  saveToken, getToken, saveUser, getUser, clearAuth, saveLastRole, getLastRole,
  saveImpersonator, getImpersonator, clearImpersonator, restoreImpersonatorSession
} from '../utils/tokenStorage';

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
  /* 관리자가 다른 계정으로 들어와 있으면 그 관리자 { id, username, token?, user? } (FR-388).
     token 이 없으면(저장소 유실) 배너는 돌아가기 대신 로그아웃만 권한다. */
  const [impersonator, setImpersonator] = useState(null);

  /**
   * 로그인·전환·역할 생성이 모두 같은 방식으로 세션을 갈아 끼운다.
   * 마지막 역할을 함께 남겨 다음 카카오 로그인이 같은 계정으로 들어오게 한다.
   * 다른 계정으로 들어가는 것은 "내가 마지막에 쓴 역할" 이 아니므로 남기지 않는다.
   */
  const applySession = (data, { rememberRole = true } = {}) => {
    setUser(data.user);
    setToken(data.token);
    saveUser(data.user);
    saveToken(data.token);
    if (rememberRole) saveLastRole(data.role || data.user?.role);
  };

  const clearSession = () => {
    setUser(null);
    setToken(null);
    setImpersonator(null);
    clearAuth();
    clearImpersonator();
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
      const storedImpersonator = getImpersonator();
      if (storedImpersonator) setImpersonator(storedImpersonator);

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

          if (data.impersonatedBy) {
            // 토큰은 대신 로그인인데 돌아갈 세션이 없어도(다른 기기·저장소 유실) 배너는 그린다
            if (!storedImpersonator) setImpersonator({ ...data.impersonatedBy, token: null, user: null });
          } else if (storedImpersonator) {
            // 그 사이 다시 로그인해 보통 토큰이 된 경우 — 남은 기록은 버린다
            clearImpersonator();
            setImpersonator(null);
          }
        } else if (storedImpersonator?.token) {
          // 다른 계정용 짧은 토큰이 끝났다 — 로그아웃 대신 관리자 세션으로 돌아간다
          const restored = restoreImpersonatorSession();
          setImpersonator(null);
          setUser(restored.user);
          setToken(restored.token);
        } else {
          // Token is invalid or expired - logout
          clearSession();
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
    // 다른 계정으로 들어와 있었더라도 로그아웃은 전부 끝낸다 — 관리자 세션을 남겨 두면
    // 공용 기기에서 다음 사람이 관리자로 돌아갈 수 있다
    clearSession();
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

  /* ── 다른 계정으로 로그인 (docs/accounts-roles FR-388) ── */

  /**
   * 관리자가 사용자 목록에서 고른 계정으로 들어간다.
   * 돌아올 관리자 세션을 먼저 챙긴 뒤 세션을 갈아 끼운다. 호출한 쪽이 화면을 새로 연다.
   */
  const impersonate = async (userId) => {
    const response = await fetchWithAuth(`/api/auth/users/${userId}/impersonate`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '해당 계정으로 로그인할 수 없습니다.');

    const actor = {
      ...data.impersonator,
      token: token || getToken(),
      user: user || getUser()
    };
    saveImpersonator(actor);
    setImpersonator(actor);
    applySession(data, { rememberRole: false });
    return data;
  };

  /**
   * 관리자 세션으로 돌아온다. 돌아갈 세션이 없거나 그 토큰마저 끝났으면 로그아웃한다.
   * 돌아온 뒤 /verify 로 관리자 정보를 다시 읽어 그 사이 바뀐 이름 등을 맞춘다.
   */
  const stopImpersonating = async () => {
    const restored = restoreImpersonatorSession();
    setImpersonator(null);
    if (!restored) {
      clearSession();
      return null;
    }

    setUser(restored.user);
    setToken(restored.token);

    try {
      const response = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${restored.token}` }
      });
      if (!response.ok) {
        clearSession();
        return null;
      }
      const data = await response.json();
      setUser(data.user);
      saveUser(data.user);
      return data.user;
    } catch (error) {
      // 네트워크 오류면 저장된 관리자 정보로 유지한다
      console.error('관리자 세션 확인 실패:', error);
      return restored.user;
    }
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
    addRole,
    impersonator,
    impersonate,
    stopImpersonating
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
