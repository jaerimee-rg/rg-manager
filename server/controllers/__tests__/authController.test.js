import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// 네이티브 ESM 에서는 jest.mock 이 동작하지 않아 unstable_mockModule 을 쓴다.
jest.unstable_mockModule('../../models/User.js', () => ({
  default: {
    create: jest.fn(),
    delete: jest.fn(),
    getAll: jest.fn(),
    getById: jest.fn(),
    getByCredentials: jest.fn(),
    getByUsername: jest.fn(),
    getByKakaoId: jest.fn(),
    createWithKakao: jest.fn(),
    update: jest.fn(),
    updateUsername: jest.fn(),
    updateKakaoInfo: jest.fn(),
    updateKakaoTokens: jest.fn(),
    getKakaoTokens: jest.fn(),
    updateMessageConsent: jest.fn(),
    transferData: jest.fn()
  }
}));

const User = (await import('../../models/User.js')).default;
const authController = await import('../authController.js');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

describe('authController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      user: {},
      params: {},
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedpassword',
        role: 'user',
      };

      req.body = { username: 'testuser', password: 'password123' };
      User.getByCredentials.mockResolvedValue(mockUser);

      await authController.login(req, res);

      expect(User.getByCredentials).toHaveBeenCalledWith('testuser', 'password123');
      expect(res.json).toHaveBeenCalledWith({
        message: '로그인 성공',
        user: { id: 1, username: 'testuser', role: 'user' },
        token: expect.any(String),
      });

      // Verify token
      const response = res.json.mock.calls[0][0];
      const decoded = jwt.verify(response.token, JWT_SECRET);
      expect(decoded.id).toBe(1);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('user');
    });

    it('should return 401 with invalid credentials', async () => {
      req.body = { username: 'testuser', password: 'wrongpassword' };
      User.getByCredentials.mockResolvedValue(null);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '아이디 또는 비밀번호가 일치하지 않습니다.',
      });
    });

    it('should not include password in response', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedpassword',
        role: 'user',
      };

      req.body = { username: 'testuser', password: 'password123' };
      User.getByCredentials.mockResolvedValue(mockUser);

      await authController.login(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.user.password).toBeUndefined();
    });

    it('should handle database errors', async () => {
      req.body = { username: 'testuser', password: 'password123' };
      User.getByCredentials.mockRejectedValue(new Error('Database error'));

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('signup', () => {
    it('should create new user successfully', async () => {
      const newUser = {
        id: 2,
        username: 'newuser',
        role: 'user',
      };

      req.body = { username: 'newuser', password: 'password123' };
      User.getByUsername.mockResolvedValue(null);
      User.create.mockResolvedValue(newUser);

      await authController.signup(req, res);

      expect(User.getByUsername).toHaveBeenCalledWith('newuser');
      expect(User.create).toHaveBeenCalledWith({ username: 'newuser', password: 'password123' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: '회원가입 성공',
        user: newUser,
        token: expect.any(String),
      });
    });

    it('should return 400 if username already exists', async () => {
      req.body = { username: 'existinguser', password: 'password123' };
      User.getByUsername.mockResolvedValue({ id: 1, username: 'existinguser' });

      await authController.signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이미 존재하는 사용자입니다.' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during signup', async () => {
      req.body = { username: 'newuser', password: 'password123' };
      User.getByUsername.mockResolvedValue(null);
      User.create.mockRejectedValue(new Error('Database error'));

      await authController.signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('getUsers', () => {
    it('should return all users', async () => {
      const mockUsers = [
        { id: 1, username: 'user1', role: 'user' },
        { id: 2, username: 'user2', role: 'admin' },
      ];

      User.getAll.mockResolvedValue(mockUsers);

      await authController.getUsers(req, res);

      expect(User.getAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUsers);
    });

    it('should handle errors', async () => {
      User.getAll.mockRejectedValue(new Error('Database error'));

      await authController.getUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('updateUser', () => {
    const target = { id: 1, username: 'before', role: 'user' };

    beforeEach(() => {
      req.user = { id: 9, role: 'admin' };
      req.params = { id: '1' };
      User.getById.mockResolvedValue(target);
      User.getByUsername.mockResolvedValue(null);
    });

    it('관리자는 사용자 이름을 바꿀 수 있다', async () => {
      const updatedUser = { id: 1, username: 'after', role: 'user' };
      req.body = { username: 'after' };
      User.update.mockResolvedValue(updatedUser);

      await authController.updateUser(req, res);

      expect(User.update).toHaveBeenCalledWith(1, {
        username: 'after',
        password: undefined,
        role: 'user'
      });
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it('이름 앞뒤 공백은 잘라서 저장한다', async () => {
      req.body = { username: '  이재림  ' };
      User.update.mockResolvedValue({ id: 1, username: '이재림' });

      await authController.updateUser(req, res);

      expect(User.update).toHaveBeenCalledWith(1, expect.objectContaining({ username: '이재림' }));
    });

    it('빈 이름은 400 을 반환한다', async () => {
      req.body = { username: '   ' };

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '사용자 이름을 입력해주세요.' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('30자를 넘는 이름은 400 을 반환한다', async () => {
      req.body = { username: 'ㄱ'.repeat(31) };

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(User.update).not.toHaveBeenCalled();
    });

    it('다른 사용자가 쓰는 이름이면 400 을 반환한다', async () => {
      req.body = { username: '이재림' };
      User.getByUsername.mockResolvedValue({ id: 2, username: '이재림' });

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이미 사용 중인 이름입니다.' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('이름을 그대로 두면 중복 확인을 하지 않는다', async () => {
      req.body = { username: 'before', role: 'admin' };
      User.update.mockResolvedValue({ id: 1, username: 'before', role: 'admin' });

      await authController.updateUser(req, res);

      expect(User.getByUsername).not.toHaveBeenCalled();
      expect(User.update).toHaveBeenCalledWith(1, expect.objectContaining({ role: 'admin' }));
    });

    it('이름을 보내지 않으면 기존 이름을 유지한다', async () => {
      req.body = { role: 'admin' };
      User.update.mockResolvedValue({ id: 1, username: 'before', role: 'admin' });

      await authController.updateUser(req, res);

      expect(User.update).toHaveBeenCalledWith(1, expect.objectContaining({ username: 'before' }));
    });

    it('없는 사용자는 404 를 반환한다', async () => {
      req.body = { username: 'after' };
      User.getById.mockResolvedValue(null);

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(User.update).not.toHaveBeenCalled();
    });

    it('허용되지 않은 역할은 400 을 반환한다', async () => {
      req.body = { username: 'after', role: 'superuser' };

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '잘못된 역할입니다.' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('저장 직전에 이름을 뺏기면(unique 위반) 400 으로 안내한다', async () => {
      req.body = { username: 'after' };
      const conflict = new Error('duplicate key');
      conflict.code = '23505';
      User.update.mockRejectedValue(conflict);

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이미 사용 중인 이름입니다.' });
    });

    it('should return 403 when not admin', async () => {
      req.user = { role: 'user' };

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: '권한이 없습니다.' });
      expect(User.update).not.toHaveBeenCalled();
    });

    it('should handle update errors', async () => {
      req.body = { username: 'after' };
      User.update.mockRejectedValue(new Error('Update failed'));

      await authController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: '사용자 수정 중 오류가 발생했습니다.' });
    });
  });

  describe('deleteUser', () => {
    it('should delete user when admin', async () => {
      req.user = { role: 'admin' };
      req.params = { id: '1' };
      User.delete.mockResolvedValue();

      await authController.deleteUser(req, res);

      expect(User.delete).toHaveBeenCalledWith('1');
      expect(res.json).toHaveBeenCalledWith({ message: '사용자가 삭제되었습니다.' });
    });

    it('should return 403 when not admin', async () => {
      req.user = { role: 'user' };
      req.params = { id: '1' };

      await authController.deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: '권한이 없습니다.' });
      expect(User.delete).not.toHaveBeenCalled();
    });
  });

  describe('verifyTokenEndpoint', () => {
    it('should return user data for valid token', async () => {
      const mockUser = { id: 1, username: 'testuser', role: 'user', password: 'hash' };

      req.user = { id: 1 };
      User.getById.mockResolvedValue(mockUser);

      await authController.verifyTokenEndpoint(req, res);

      expect(User.getById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        user: { id: 1, username: 'testuser', role: 'user' },
      });
    });

    it('should return 401 if user not found', async () => {
      req.user = { id: 999 };
      User.getById.mockResolvedValue(null);

      await authController.verifyTokenEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '사용자를 찾을 수 없습니다.',
        tokenExpired: true,
      });
    });
  });

  describe('transferUserData', () => {
    it('should transfer data when admin', async () => {
      const transferResult = {
        message: '데이터 이전이 완료되었습니다.',
        transferred: { students: 5, classes: 3, attendance: 20, competitions: 2 },
      };

      req.user = { role: 'admin' };
      req.body = { fromUserId: 1, toUserId: 2 };
      User.transferData.mockResolvedValue(transferResult);

      await authController.transferUserData(req, res);

      expect(User.transferData).toHaveBeenCalledWith(1, 2);
      expect(res.json).toHaveBeenCalledWith(transferResult);
    });

    it('should return 403 when not admin', async () => {
      req.user = { role: 'user' };
      req.body = { fromUserId: 1, toUserId: 2 };

      await authController.transferUserData(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: '권한이 없습니다.' });
    });

    it('should return 400 when fromUserId is missing', async () => {
      req.user = { role: 'admin' };
      req.body = { toUserId: 2 };

      await authController.transferUserData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: '이전할 사용자와 대상 사용자를 모두 선택해주세요.',
      });
    });

    it('should return 400 when toUserId is missing', async () => {
      req.user = { role: 'admin' };
      req.body = { fromUserId: 1 };

      await authController.transferUserData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when fromUserId equals toUserId', async () => {
      req.user = { role: 'admin' };
      req.body = { fromUserId: 1, toUserId: 1 };

      await authController.transferUserData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: '같은 사용자에게 데이터를 이전할 수 없습니다.',
      });
    });
  });

  describe('updateUsername', () => {
    it('should update username successfully', async () => {
      const updatedUser = { id: 1, username: 'newname', role: 'user' };

      req.user = { id: 1 };
      req.body = { username: 'newname' };
      User.getByUsername.mockResolvedValue(null);
      User.updateUsername.mockResolvedValue(updatedUser);

      await authController.updateUsername(req, res);

      expect(User.updateUsername).toHaveBeenCalledWith(1, 'newname');
      expect(res.json).toHaveBeenCalledWith({
        message: '이름이 설정되었습니다.',
        user: updatedUser,
      });
    });

    it('should return 400 for empty username', async () => {
      req.user = { id: 1 };
      req.body = { username: '   ' };

      await authController.updateUsername(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이름을 입력해주세요.' });
    });

    it('should return 400 if username already taken', async () => {
      req.user = { id: 1 };
      req.body = { username: 'existingname' };
      User.getByUsername.mockResolvedValue({ id: 2, username: 'existingname' });

      await authController.updateUsername(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이미 사용 중인 이름입니다.' });
    });

    it('should allow updating to same username for same user', async () => {
      const updatedUser = { id: 1, username: 'myname', role: 'user' };

      req.user = { id: 1 };
      req.body = { username: 'myname' };
      User.getByUsername.mockResolvedValue({ id: 1, username: 'myname' });
      User.updateUsername.mockResolvedValue(updatedUser);

      await authController.updateUsername(req, res);

      expect(User.updateUsername).toHaveBeenCalledWith(1, 'myname');
      expect(res.json).toHaveBeenCalledWith({
        message: '이름이 설정되었습니다.',
        user: updatedUser,
      });
    });

    it('should return 404 if user not found', async () => {
      req.user = { id: 999 };
      req.body = { username: 'newname' };
      User.getByUsername.mockResolvedValue(null);
      User.updateUsername.mockResolvedValue(null);

      await authController.updateUsername(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: '사용자를 찾을 수 없습니다.' });
    });
  });
});
