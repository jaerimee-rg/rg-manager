import {
  saveToken,
  getToken,
  removeToken,
  saveUser,
  getUser,
  removeUser,
  clearAuth,
  saveLastRole,
  getLastRole,
} from '../tokenStorage';

describe('tokenStorage', () => {
  // Mock document.cookie
  let cookieStore = {};

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Reset cookie store
    cookieStore = {};

    // Mock document.cookie getter and setter
    Object.defineProperty(document, 'cookie', {
      get: jest.fn(() => {
        return Object.entries(cookieStore)
          .map(([key, value]) => `${key}=${value}`)
          .join('; ');
      }),
      set: jest.fn((cookieString) => {
        const [keyValue] = cookieString.split(';');
        const [key, value] = keyValue.split('=');

        // Handle deletion (max-age=0)
        if (cookieString.includes('max-age=0')) {
          delete cookieStore[key];
        } else {
          cookieStore[key] = value;
        }
      }),
      configurable: true,
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    cookieStore = {};
  });

  describe('saveToken & getToken', () => {
    it('should save token to both localStorage and cookie', () => {
      const token = 'test-jwt-token-123';
      saveToken(token);

      expect(localStorage.getItem('token')).toBe(token);
      expect(cookieStore.token).toBe(encodeURIComponent(token));
    });

    it('should retrieve token from localStorage', () => {
      const token = 'test-token-456';
      localStorage.setItem('token', token);

      const result = getToken();
      expect(result).toBe(token);
    });

    it('should retrieve token from cookie when localStorage is empty', () => {
      const token = 'cookie-token-789';
      cookieStore.token = encodeURIComponent(token);

      const result = getToken();
      expect(result).toBe(token);
    });

    it('should restore token to localStorage when retrieved from cookie', () => {
      const token = 'restore-token-abc';
      cookieStore.token = encodeURIComponent(token);

      getToken();

      expect(localStorage.getItem('token')).toBe(token);
    });

    it('should return null when no token exists', () => {
      const result = getToken();
      expect(result).toBeNull();
    });

    it('should prioritize localStorage over cookie', () => {
      const localToken = 'local-token';
      const cookieToken = 'cookie-token';

      localStorage.setItem('token', localToken);
      cookieStore.token = encodeURIComponent(cookieToken);

      const result = getToken();
      expect(result).toBe(localToken);
    });

    it('should handle localStorage errors gracefully during save', () => {
      const token = 'error-token';

      // Mock localStorage.setItem to throw error
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });

      saveToken(token);

      // Should still save to cookie
      expect(cookieStore.token).toBe(encodeURIComponent(token));

      setItemSpy.mockRestore();
    });

    it('should handle localStorage errors gracefully during get', () => {
      const token = 'fallback-token';
      cookieStore.token = encodeURIComponent(token);

      // Mock localStorage.getItem to throw error
      const getItemSpy = jest.spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError');
        });

      const result = getToken();
      expect(result).toBe(token);

      getItemSpy.mockRestore();
    });
  });

  describe('removeToken', () => {
    it('should remove token from both localStorage and cookie', () => {
      const token = 'remove-me';
      localStorage.setItem('token', token);
      cookieStore.token = encodeURIComponent(token);

      removeToken();

      expect(localStorage.getItem('token')).toBeNull();
      expect(cookieStore.token).toBeUndefined();
    });

    it('should handle localStorage errors during removal', () => {
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem')
        .mockImplementation(() => {
          throw new Error('Error');
        });

      removeToken(); // Should not throw

      removeItemSpy.mockRestore();
    });
  });

  describe('saveUser & getUser', () => {
    it('should save user object to both localStorage and cookie', () => {
      const user = { id: 1, username: 'testuser', role: 'user' };
      saveUser(user);

      expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
      expect(cookieStore.user).toBe(encodeURIComponent(JSON.stringify(user)));
    });

    it('should retrieve user from localStorage', () => {
      const user = { id: 2, username: 'admin', role: 'admin' };
      localStorage.setItem('user', JSON.stringify(user));

      const result = getUser();
      expect(result).toEqual(user);
    });

    it('should retrieve user from cookie when localStorage is empty', () => {
      const user = { id: 3, username: 'viewer', role: 'user' };
      cookieStore.user = encodeURIComponent(JSON.stringify(user));

      const result = getUser();
      expect(result).toEqual(user);
    });

    it('should return null when no user exists', () => {
      const result = getUser();
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON in localStorage', () => {
      localStorage.setItem('user', 'invalid-json');

      const result = getUser();
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON in cookie', () => {
      cookieStore.user = encodeURIComponent('invalid-json');

      const result = getUser();
      expect(result).toBeNull();
    });

    it('should handle complex user objects', () => {
      const user = {
        id: 4,
        username: 'complex',
        role: 'admin',
        kakaoId: '12345',
        email: 'test@example.com',
        kakaoMessageConsent: true,
      };

      saveUser(user);
      const result = getUser();

      expect(result).toEqual(user);
    });

    it('should restore user to localStorage when retrieved from cookie', () => {
      const user = { id: 5, username: 'restore' };
      cookieStore.user = encodeURIComponent(JSON.stringify(user));

      getUser();

      expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
    });
  });

  describe('removeUser', () => {
    it('should remove user from both localStorage and cookie', () => {
      const user = { id: 1, username: 'remove' };
      localStorage.setItem('user', JSON.stringify(user));
      cookieStore.user = encodeURIComponent(JSON.stringify(user));

      removeUser();

      expect(localStorage.getItem('user')).toBeNull();
      expect(cookieStore.user).toBeUndefined();
    });

    it('should handle localStorage errors during removal', () => {
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem')
        .mockImplementation(() => {
          throw new Error('Error');
        });

      removeUser(); // Should not throw

      removeItemSpy.mockRestore();
    });
  });

  describe('clearAuth', () => {
    it('should clear both token and user', () => {
      const token = 'test-token';
      const user = { id: 1, username: 'test' };

      saveToken(token);
      saveUser(user);

      clearAuth();

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(cookieStore.token).toBeUndefined();
      expect(cookieStore.user).toBeUndefined();
    });

    it('should work even when nothing is stored', () => {
      clearAuth(); // Should not throw

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('Cookie attributes', () => {
    it('should set cookie with correct attributes', () => {
      const token = 'test-token';
      const setCookieSpy = jest.spyOn(document, 'cookie', 'set');

      saveToken(token);

      expect(setCookieSpy).toHaveBeenCalled();
      const cookieString = setCookieSpy.mock.calls[0][0];

      expect(cookieString).toContain('path=/');
      expect(cookieString).toContain('max-age=2592000'); // 30 days
      expect(cookieString).toContain('SameSite=Lax');

      setCookieSpy.mockRestore();
    });
  });

  describe('iOS Safari dual storage strategy', () => {
    it('should ensure token persists after browser close simulation', () => {
      const token = 'persistent-token';

      // Save token
      saveToken(token);

      // Simulate browser close - clear localStorage only
      localStorage.clear();

      // Token should still be retrievable from cookie
      const retrievedToken = getToken();
      expect(retrievedToken).toBe(token);

      // And should be restored to localStorage
      expect(localStorage.getItem('token')).toBe(token);
    });

    it('should ensure user persists after browser close simulation', () => {
      const user = { id: 1, username: 'persistent' };

      // Save user
      saveUser(user);

      // Simulate browser close - clear localStorage only
      localStorage.clear();

      // User should still be retrievable from cookie
      const retrievedUser = getUser();
      expect(retrievedUser).toEqual(user);

      // And should be restored to localStorage
      expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
    });

    it('should handle complete storage failure gracefully', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('Storage unavailable');
        });

      const token = 'fail-safe-token';

      // Should still save to cookie
      saveToken(token);
      expect(cookieStore.token).toBe(encodeURIComponent(token));

      setItemSpy.mockRestore();
    });
  });

  describe('Edge cases with special characters', () => {
    it('should handle tokens with special characters', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      saveToken(token);
      const result = getToken();

      expect(result).toBe(token);
    });

    it('should handle user with special characters in username', () => {
      const user = { id: 1, username: '한글사용자', role: 'user' };

      saveUser(user);
      const result = getUser();

      expect(result).toEqual(user);
    });

    it('should treat an empty string token as no token', () => {
      // 빈 문자열은 토큰이 아니다. getToken 은 쿠키 복구를 거쳐 null 을 돌려주고,
      // 호출부(fetchWithAuth)는 값이 없으면 Authorization 헤더를 붙이지 않는다.
      saveToken('');
      const result = getToken();

      expect(result).toBeNull();
    });
  });

  describe('마지막 역할 (한 카카오 계정, 여러 역할)', () => {
    it('저장한 역할을 그대로 돌려준다', () => {
      saveLastRole('parent');
      expect(getLastRole()).toBe('parent');
    });

    it('저장한 적이 없으면 null', () => {
      expect(getLastRole()).toBeNull();
    });

    it('빈 값은 저장하지 않는다', () => {
      saveLastRole('user');
      saveLastRole('');
      expect(getLastRole()).toBe('user');
    });

    it('로그아웃(clearAuth)해도 남는다 — 다음 로그인의 힌트라서', () => {
      saveLastRole('admin');
      clearAuth();
      expect(getLastRole()).toBe('admin');
    });

    it('localStorage 를 못 써도 던지지 않는다', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error('nope'); };
      expect(() => saveLastRole('user')).not.toThrow();
      Storage.prototype.setItem = original;
    });
  });
});
