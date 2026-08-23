import React, { createContext, useState, useContext, useEffect } from 'react';
import { saveToken, getToken, saveUser, getUser, clearAuth } from '../utils/tokenStorage';

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
    setUser(data.user);
    setToken(data.token);
    saveUser(data.user);
    saveToken(data.token);
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

  // 카카오 로그인 URL 가져오기
  const getKakaoLoginUrl = async () => {
    const response = await fetch('/api/auth/kakao');
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
        throw new Error(error.error || '카카오 로그인에 실패했습니다.');
      }
      throw new Error('카카오 로그인에 실패했습니다. 서버 오류가 발생했습니다.');
    }

    const data = await response.json();
    setUser(data.user);
    setToken(data.token);
    saveUser(data.user);
    saveToken(data.token);
    return {
      user: data.user,
      isNewUser: data.isNewUser,
      role: data.role || data.user?.role,
      needsOnboarding: data.needsOnboarding === true
    };
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
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
