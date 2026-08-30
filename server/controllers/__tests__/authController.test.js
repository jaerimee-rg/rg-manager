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
    listByKakaoId: jest.fn().mockResolvedValue([]),
    createWithKakao: jest.fn(),
    update: jest.fn(),
    updateDisplayName: jest.fn(),
    updateKakaoInfo: jest.fn(),
    updateKakaoTokens: jest.fn(),
    getKakaoTokens: jest.fn(),
    updateMessageConsent: jest.fn(),
    transferData: jest.fn()
  }
}));

// 학부모 관련 모델은 DB 를 건드리므로 함께 대체한다.
jest.unstable_mockModule('../../models/ParentInvite.js', () => ({
  default: { getByToken: jest.fn(), isUsable: jest.fn(() => false), getOrCreate: jest.fn() }
}));

jest.unstable_mockModule('../../models/ParentAccount.js', () => ({
  default: { create: jest.fn(), touchLogin: jest.fn(), deleteByTeacher: jest.fn(), getByUserId: jest.fn() }
}));

jest.unstable_mockModule('../../models/ParentChild.js', () => ({
  default: { listByParent: jest.fn().mockResolvedValue([]) }
}));

jest.unstable_mockModule('../../models/ParentTeacher.js', () => ({
  default: {
    link: jest.fn(),
    isLinked: jest.fn().mockResolvedValue(false),
    listTeachers: jest.fn().mockResolvedValue([]),
    teacherIds: jest.fn().mockResolvedValue([])
  }
}));

jest.unstable_mockModule('../../models/TeacherInvite.js', () => ({
  default: {
    getByToken: jest.fn(),
    isUsable: jest.fn(() => false),
    markUsed: jest.fn(),
    statusOf: jest.fn(() => 'pending')
  },
  DEFAULT_EXPIRES_DAYS: 14
}));

const User = (await import('../../models/User.js')).default;
const ParentInvite = (await import('../../models/ParentInvite.js')).default;
const ParentAccount = (await import('../../models/ParentAccount.js')).default;
const ParentChild = (await import('../../models/ParentChild.js')).default;
const ParentTeacher = (await import('../../models/ParentTeacher.js')).default;
const TeacherInvite = (await import('../../models/TeacherInvite.js')).default;
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

  describe('updateDisplayName (설정 → 이름 변경, /register-name)', () => {
    it('표시 이름을 저장하고 사용자를 돌려준다', async () => {
      const updatedUser = { id: 1, username: '카카오_1788076610466', displayName: '최재웅', role: 'user' };

      req.user = { id: 1 };
      req.body = { username: '최재웅' };
      User.updateDisplayName.mockResolvedValue(updatedUser);

      await authController.updateDisplayName(req, res);

      expect(User.updateDisplayName).toHaveBeenCalledWith(1, '최재웅');
      expect(res.json).toHaveBeenCalledWith({
        message: '이름이 설정되었습니다.',
        user: updatedUser,
      });
    });

    it('username 은 건드리지 않는다 — UNIQUE 식별자라 같은 사람의 다른 역할 행과 겹쳐도 된다', async () => {
      req.user = { id: 12 };
      req.body = { username: '최재웅' };
      // 관리자 행(id 8)이 이미 "최재웅" 이어도 확인하지 않고 그대로 저장한다
      User.getByUsername.mockResolvedValue({ id: 8, username: '최재웅' });
      User.updateDisplayName.mockResolvedValue({ id: 12, username: '카카오_1788076610466', displayName: '최재웅' });

      await authController.updateDisplayName(req, res);

      expect(User.getByUsername).not.toHaveBeenCalled();
      expect(User.updateDisplayName).toHaveBeenCalledWith(12, '최재웅');
      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('displayName 키로 보내도 받는다', async () => {
      req.user = { id: 1 };
      req.body = { displayName: '이재림' };
      User.updateDisplayName.mockResolvedValue({ id: 1, displayName: '이재림' });

      await authController.updateDisplayName(req, res);

      expect(User.updateDisplayName).toHaveBeenCalledWith(1, '이재림');
    });

    it('빈 이름은 400', async () => {
      req.user = { id: 1 };
      req.body = { username: '   ' };

      await authController.updateDisplayName(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '이름을 입력해주세요.' });
      expect(User.updateDisplayName).not.toHaveBeenCalled();
    });

    it('30자를 넘는 이름은 400 을 반환한다', async () => {
      req.user = { id: 1 };
      req.body = { username: 'ㄱ'.repeat(31) };

      await authController.updateDisplayName(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(User.updateDisplayName).not.toHaveBeenCalled();
    });

    it('앞뒤 공백은 잘라서 저장한다', async () => {
      req.user = { id: 1 };
      req.body = { username: '  이재림  ' };
      User.updateDisplayName.mockResolvedValue({ id: 1, displayName: '이재림' });

      await authController.updateDisplayName(req, res);

      expect(User.updateDisplayName).toHaveBeenCalledWith(1, '이재림');
    });

    it('사용자가 없으면 404', async () => {
      req.user = { id: 999 };
      req.body = { username: 'newname' };
      User.updateDisplayName.mockResolvedValue(null);

      await authController.updateDisplayName(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: '사용자를 찾을 수 없습니다.' });
    });

    it('저장에 실패하면 500', async () => {
      req.user = { id: 1 };
      req.body = { username: '이재림' };
      User.updateDisplayName.mockRejectedValue(new Error('db down'));

      await authController.updateDisplayName(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('카카오 콜백 — 계정 선택과 초대 (docs/accounts-roles 02 §4.2 판정표)', () => {
    const kakaoOk = () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({ id: 12345, properties: { nickname: '민서엄마' }, kakao_account: { email: 'm@example.com' } }) });
    };

    // 클라이언트가 보내는 것과 같은 형식의 state
    const stateFor = (payload) => Buffer.from(JSON.stringify({ v: 1, ...payload })).toString('base64url');

    beforeEach(() => {
      jest.clearAllMocks();
      ParentChild.listByParent.mockResolvedValue([]);
      User.listByKakaoId.mockResolvedValue([]);
      req.body = { code: 'auth-code' };
    });

    afterEach(() => {
      delete global.fetch;
    });

    // ── 초대도 계정도 없을 때 (이번 변경의 핵심) ──
    it('초대도 계정도 없으면 계정을 만들지 않고 403 으로 안내한다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([]);

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      const payload = res.json.mock.calls[0][0];
      expect(payload.outcome).toBe('needsInvite');
      expect(payload.token).toBeUndefined();
    });

    // ── 이미 있는 계정으로 로그인 ──
    it('계정이 하나면 그 계정으로 로그인한다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([{ id: 9, username: '이재림', role: 'user' }]);
      User.getByKakaoId.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });
      User.updateKakaoTokens.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });

      await authController.kakaoCallback(req, res);

      expect(User.getByKakaoId).toHaveBeenCalledWith('12345', 'user');
      expect(User.createWithKakao).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('user');
      expect(payload.isNewUser).toBe(false);
    });

    it('계정이 여럿이면 마지막에 쓰던 역할(prefer)로 로그인한다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([
        { id: 9, username: '이재림', role: 'user' },
        { id: 20, username: '이재림_2', role: 'parent' }
      ]);
      User.getByKakaoId.mockResolvedValue({ id: 20, username: '이재림_2', role: 'parent' });
      req.body.state = stateFor({ p: 'parent' });

      await authController.kakaoCallback(req, res);

      expect(User.getByKakaoId).toHaveBeenCalledWith('12345', 'parent');
      expect(ParentAccount.touchLogin).toHaveBeenCalledWith(20);
      expect(res.json.mock.calls[0][0].role).toBe('parent');
    });

    it('힌트가 없으면 관리자 > 선생님 > 학부모 순으로 고른다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([
        { id: 20, username: '박원장_3', role: 'parent' },
        { id: 8, username: '박원장', role: 'admin' },
        { id: 9, username: '박원장_2', role: 'user' }
      ]);
      User.getByKakaoId.mockResolvedValue({ id: 8, username: '박원장', role: 'admin' });
      User.updateKakaoTokens.mockResolvedValue({ id: 8, username: '박원장', role: 'admin' });

      await authController.kakaoCallback(req, res);

      expect(User.getByKakaoId).toHaveBeenCalledWith('12345', 'admin');
      expect(res.json.mock.calls[0][0].role).toBe('admin');
    });

    it('응답에 이 카카오 계정의 다른 역할 계정을 함께 담는다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([
        { id: 9, username: '이재림', role: 'user' },
        { id: 20, username: '이재림_2', role: 'parent' }
      ]);
      User.getByKakaoId.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });
      User.updateKakaoTokens.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });

      await authController.kakaoCallback(req, res);

      expect(res.json.mock.calls[0][0].accounts).toEqual([
        { role: 'user', username: '이재림' },
        { role: 'parent', username: '이재림_2' }
      ]);
    });

    // ── 선생님 초대 ──
    it('유효한 선생님 초대면 선생님 계정을 만들고 초대를 소비한다', async () => {
      kakaoOk();
      TeacherInvite.getByToken.mockResolvedValue({ id: 5, token: 'T1' });
      TeacherInvite.isUsable.mockReturnValue(true);
      TeacherInvite.markUsed.mockResolvedValue({ id: 5 });
      User.createWithKakao.mockResolvedValue({ id: 30, username: '카카오_1', role: 'user' });
      req.body.state = stateFor({ t: 'T1' });

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).toHaveBeenCalledWith(expect.objectContaining({ role: 'user' }));
      expect(TeacherInvite.markUsed).toHaveBeenCalledWith(5, 30);
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('user');
      expect(payload.isNewUser).toBe(true);
    });

    it('무효·만료·회수된 선생님 초대는 카카오에 가기 전에 400 으로 막는다', async () => {
      TeacherInvite.getByToken.mockResolvedValue({ id: 5, revokedAt: 'x' });
      TeacherInvite.isUsable.mockReturnValue(false);
      req.body.state = stateFor({ t: 'T1' });

      await authController.kakaoCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).toBeUndefined();
      expect(User.createWithKakao).not.toHaveBeenCalled();
    });

    it('이미 선생님 계정이 있으면 로그인만 하고 초대를 쓰지 않는다', async () => {
      kakaoOk();
      TeacherInvite.getByToken.mockResolvedValue({ id: 5 });
      TeacherInvite.isUsable.mockReturnValue(true);
      User.listByKakaoId.mockResolvedValue([{ id: 9, username: '이재림', role: 'user' }]);
      User.getByKakaoId.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });
      User.updateKakaoTokens.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });
      req.body.state = stateFor({ t: 'T1' });

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).not.toHaveBeenCalled();
      expect(TeacherInvite.markUsed).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].role).toBe('user');
    });

    it('같은 링크를 동시에 열어 초대를 뺏기면 만든 계정을 되돌리고 409', async () => {
      kakaoOk();
      TeacherInvite.getByToken.mockResolvedValue({ id: 5 });
      TeacherInvite.isUsable.mockReturnValue(true);
      TeacherInvite.markUsed.mockResolvedValue(null); // 경합에서 졌다
      User.createWithKakao.mockResolvedValue({ id: 30, username: '카카오_1', role: 'user' });
      req.body.state = stateFor({ t: 'T1' });

      await authController.kakaoCallback(req, res);

      expect(User.delete).toHaveBeenCalledWith(30);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    // ── 학부모 초대 ──
    it('유효한 학부모 초대면 학부모 계정을 만들고 선생님에 묶는다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7, token: 'tok' });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByUsername.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 20, username: '민서엄마', role: 'parent' });
      req.body.state = stateFor({ i: 'tok' });

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).toHaveBeenCalledWith(expect.objectContaining({
        role: 'parent', username: '민서엄마', accessToken: null
      }));
      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 20, teacherId: 7, inviteId: 3 });
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('parent');
      expect(payload.needsOnboarding).toBe(true);
    });

    it('닉네임이 겹치면 뒤에 숫자를 붙인다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByUsername.mockResolvedValueOnce({ id: 1 }).mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 21, username: '민서엄마_2', role: 'parent' });
      req.body.state = stateFor({ i: 'tok' });

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).toHaveBeenCalledWith(expect.objectContaining({ username: '민서엄마_2' }));
    });

    it('만료·위조 학부모 토큰이면 400 으로 막는다', async () => {
      ParentInvite.getByToken.mockResolvedValue(null);
      ParentInvite.isUsable.mockReturnValue(false);
      req.body.state = stateFor({ i: 'gone' });

      await authController.kakaoCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(global.fetch).toBeUndefined();
    });

    it('선생님 카카오로 학부모 초대에 들어와도 거절하지 않고 학부모 계정을 만든다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7 });
      ParentInvite.isUsable.mockReturnValue(true);
      // 선생님 계정은 있지만 학부모 계정은 없다
      User.listByKakaoId.mockResolvedValue([{ id: 5, username: '이재림', role: 'user' }]);
      User.getByUsername.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 21, username: '민서엄마', role: 'parent' });
      req.body.state = stateFor({ i: 'tok' });

      await authController.kakaoCallback(req, res);

      expect(res.status).not.toHaveBeenCalledWith(409);
      expect(User.createWithKakao).toHaveBeenCalledWith(expect.objectContaining({ role: 'parent' }));
      expect(res.json.mock.calls[0][0].role).toBe('parent');
    });

    it('이미 학부모 계정이 있으면 계정을 만들지 않고 선생님 연결만 더한다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 9, userId: 11 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.listByKakaoId.mockResolvedValue([{ id: 20, username: '민서엄마', role: 'parent' }]);
      User.getByKakaoId.mockResolvedValue({ id: 20, username: '민서엄마', role: 'parent' });
      req.body.state = stateFor({ i: 'tok2' });

      await authController.kakaoCallback(req, res);

      expect(User.createWithKakao).not.toHaveBeenCalled();
      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 20, teacherId: 11, inviteId: 9 });
    });

    it('이미 가입한 학부모는 초대 없이도 로그인된다', async () => {
      kakaoOk();
      User.listByKakaoId.mockResolvedValue([{ id: 20, username: '민서엄마', role: 'parent' }]);
      User.getByKakaoId.mockResolvedValue({ id: 20, username: '민서엄마', role: 'parent' });
      ParentChild.listByParent.mockResolvedValue([{ id: 1 }]);

      await authController.kakaoCallback(req, res);

      expect(ParentAccount.touchLogin).toHaveBeenCalledWith(20);
      // 학부모에게는 메시지 토큰을 저장하지 않는다
      expect(User.updateKakaoTokens).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('parent');
      expect(payload.needsOnboarding).toBe(false);
    });

    // ── 하위 호환 ──
    it('옛 형식(초대 토큰 원문) state 도 학부모 흐름으로 받아준다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByUsername.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 22, username: '민서엄마', role: 'parent' });
      req.body.state = 'legacy-raw-token';

      await authController.kakaoCallback(req, res);

      expect(ParentInvite.getByToken).toHaveBeenCalledWith('legacy-raw-token');
      expect(res.json.mock.calls[0][0].role).toBe('parent');
    });

    // ── 마이그레이션 미적용 감지 ──
    it('옛 UNIQUE 제약이 남아 있으면(23505) 409 로 안내한다', async () => {
      kakaoOk();
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByUsername.mockResolvedValue(null);
      const dup = new Error('duplicate key');
      dup.code = '23505';
      User.createWithKakao.mockRejectedValue(dup);
      req.body.state = stateFor({ i: 'tok' });

      await authController.kakaoCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].error).toContain('관리자에게 문의');
    });
  });

  describe('getKakaoAuthUrl', () => {
    const stateOf = (url) => {
      const raw = decodeURIComponent(new URL(url).searchParams.get('state'));
      return JSON.parse(Buffer.from(raw, 'base64url').toString());
    };

    it('invite 쿼리를 state 에 실어 보낸다', () => {
      req.query = { invite: 'tok123' };

      authController.getKakaoAuthUrl(req, res);

      expect(stateOf(res.json.mock.calls[0][0].url)).toEqual({ v: 1, i: 'tok123' });
    });

    it('선생님 초대와 역할 힌트도 실어 보낸다', () => {
      req.query = { tinvite: 'T9', prefer: 'parent' };

      authController.getKakaoAuthUrl(req, res);

      expect(stateOf(res.json.mock.calls[0][0].url)).toEqual({ v: 1, p: 'parent', t: 'T9' });
    });

    it('아무 것도 없으면 state 를 붙이지 않는다 (지금까지와 같은 URL)', () => {
      req.query = {};

      authController.getKakaoAuthUrl(req, res);

      expect(res.json.mock.calls[0][0].url).not.toContain('state=');
    });
  });

  describe('switchRole — 역할 전환', () => {
    beforeEach(() => {
      req.user = { id: 9, username: '이재림', role: 'user' };
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
    });

    it('같은 카카오 계정의 다른 역할로 새 토큰을 발급한다', async () => {
      req.body = { role: 'parent' };
      User.getByKakaoId.mockResolvedValue({ id: 20, username: '이재림_2', role: 'parent', kakaoId: 'K1' });

      await authController.switchRole(req, res);

      // 대상은 **현재 계정의 kakaoId** 로만 찾는다
      expect(User.getByKakaoId).toHaveBeenCalledWith('K1', 'parent');
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('parent');
      expect(jwt.verify(payload.token, JWT_SECRET).id).toBe(20);
      expect(ParentAccount.touchLogin).toHaveBeenCalledWith(20);
    });

    it('요청 본문에 kakaoId 를 넣어도 남의 계정으로 전환되지 않는다', async () => {
      req.body = { role: 'admin', kakaoId: 'SOMEONE_ELSE', id: 1 };
      User.getByKakaoId.mockResolvedValue(null);
      User.listByKakaoId.mockResolvedValue([{ id: 9, role: 'user' }]);

      await authController.switchRole(req, res);

      expect(User.getByKakaoId).toHaveBeenCalledWith('K1', 'admin');
      expect(User.getByKakaoId).not.toHaveBeenCalledWith('SOMEONE_ELSE', expect.anything());
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('그 역할 계정이 없으면 404 와 만들 수 있는지 여부를 준다', async () => {
      req.body = { role: 'parent' };
      User.getByKakaoId.mockResolvedValue(null);
      User.listByKakaoId.mockResolvedValue([{ id: 9, role: 'user' }]);

      await authController.switchRole(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].canCreate).toBe(true);
    });

    it('카카오 계정이 아니면 400', async () => {
      req.body = { role: 'parent' };
      User.getById.mockResolvedValue({ id: 1, username: 'admin', role: 'admin', kakaoId: null });

      await authController.switchRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('같은 역할이면 토큰만 다시 발급한다', async () => {
      req.body = { role: 'user' };

      await authController.switchRole(req, res);

      expect(User.getByKakaoId).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].role).toBe('user');
    });

    it('잘못된 역할은 400', async () => {
      req.body = { role: 'superuser' };

      await authController.switchRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('addRole — 역할 계정 만들기', () => {
    beforeEach(() => {
      req.user = { id: 9, username: '이재림', role: 'user' };
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
      User.getByUsername.mockResolvedValue(null);
      User.getKakaoTokens.mockResolvedValue({ kakaoAccessToken: 'a' });
    });

    it('관리자 계정은 이 경로로 만들 수 없다', async () => {
      req.body = { role: 'admin' };

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(User.createWithKakao).not.toHaveBeenCalled();
    });

    it('선생님 계정은 초대 없이 만들 수 없다', async () => {
      req.body = { role: 'user' };
      TeacherInvite.isUsable.mockReturnValue(false);

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].needsInvite).toBe(true);
      expect(User.createWithKakao).not.toHaveBeenCalled();
    });

    it('관리자는 초대 없이 선생님 계정을 만들 수 있다', async () => {
      req.user = { id: 8, username: '박원장', role: 'admin' };
      User.getById.mockResolvedValue({ id: 8, username: '박원장', role: 'admin', kakaoId: 'K2' });
      User.getByKakaoId.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 31, username: '카카오_2', role: 'user' });
      req.body = { role: 'user' };

      await authController.addRole(req, res);

      expect(TeacherInvite.getByToken).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].isNewUser).toBe(true);
    });

    it('유효한 선생님 초대가 있으면 만들고 초대를 소비한다', async () => {
      req.body = { role: 'user', invite: 'T1' };
      TeacherInvite.getByToken.mockResolvedValue({ id: 5 });
      TeacherInvite.isUsable.mockReturnValue(true);
      TeacherInvite.markUsed.mockResolvedValue({ id: 5 });
      User.getByKakaoId.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 32, username: '카카오_3', role: 'user' });

      await authController.addRole(req, res);

      expect(TeacherInvite.markUsed).toHaveBeenCalledWith(5, 32);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('초대 링크 전체를 붙여넣어도 토큰을 뽑아 쓴다', async () => {
      req.body = { role: 'user', invite: 'https://rg-manager.vercel.app/teacher-invite/T7' };
      TeacherInvite.getByToken.mockResolvedValue({ id: 6 });
      TeacherInvite.isUsable.mockReturnValue(true);
      TeacherInvite.markUsed.mockResolvedValue({ id: 6 });
      User.getByKakaoId.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 33, username: '카카오_4', role: 'user' });

      await authController.addRole(req, res);

      expect(TeacherInvite.getByToken).toHaveBeenCalledWith('T7');
    });

    it('선생님은 초대 없이 자기 학원 학부모가 될 수 있다', async () => {
      req.body = { role: 'parent' };
      User.getByKakaoId.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 40, username: '이재림_2', role: 'parent' });

      await authController.addRole(req, res);

      // 소속은 자기 자신(선생님 행)
      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 40, teacherId: 9, inviteId: null });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].needsOnboarding).toBe(true);
    });

    it('관리자는 초대 없이 학부모가 될 수 없다', async () => {
      req.user = { id: 8, username: '박원장', role: 'admin' };
      User.getById.mockResolvedValue({ id: 8, username: '박원장', role: 'admin', kakaoId: 'K2' });
      req.body = { role: 'parent' };

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].needsInvite).toBe(true);
    });

    it('학부모 초대가 있으면 그 선생님에게 연결한다', async () => {
      req.body = { role: 'parent', invite: 'P1' };
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 77 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByKakaoId.mockResolvedValue(null);
      User.createWithKakao.mockResolvedValue({ id: 41, username: '이재림_2', role: 'parent' });

      await authController.addRole(req, res);

      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 41, teacherId: 77, inviteId: 3 });
    });

    it('이미 학부모 계정이 있으면 계정을 만들지 않고 연결만 더한다', async () => {
      req.body = { role: 'parent', invite: 'P1' };
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 77 });
      ParentInvite.isUsable.mockReturnValue(true);
      User.getByKakaoId.mockResolvedValue({ id: 42, username: '이재림_2', role: 'parent' });
      ParentTeacher.isLinked.mockResolvedValue(false);

      await authController.addRole(req, res);

      expect(User.createWithKakao).not.toHaveBeenCalled();
      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 42, teacherId: 77, inviteId: 3 });
      expect(res.json.mock.calls[0][0].linkedOnly).toBe(true);
    });

    it('선생님 계정이 이미 있으면 409', async () => {
      req.user = { id: 8, username: '박원장', role: 'admin' };
      User.getById.mockResolvedValue({ id: 8, username: '박원장', role: 'admin', kakaoId: 'K2' });
      User.getByKakaoId.mockResolvedValue({ id: 31, role: 'user' });
      req.body = { role: 'user' };

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('카카오 계정이 아니면 400', async () => {
      User.getById.mockResolvedValue({ id: 1, username: 'admin', role: 'admin', kakaoId: null });
      req.body = { role: 'user' };

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getRoles', () => {
    it('가진 계정과 만들 수 있는 역할을 알려준다', async () => {
      req.user = { id: 9, role: 'user' };
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
      User.listByKakaoId.mockResolvedValue([
        { id: 9, username: '이재림', role: 'user' },
        { id: 20, username: '이재림_2', role: 'parent' }
      ]);

      await authController.getRoles(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.accounts).toHaveLength(2);
      expect(payload.canCreate).toEqual({ admin: false, user: false, parent: false });
      // 선생님은 자기 학원 학부모가 될 수 있으므로 초대가 필요 없다
      expect(payload.parentNeedsInvite).toBe(false);
      expect(payload.teacherNeedsInvite).toBe(true);
    });

    it('비밀번호 전용 계정은 다른 역할을 가질 수 없다', async () => {
      req.user = { id: 1, role: 'admin' };
      User.getById.mockResolvedValue({ id: 1, username: 'admin', role: 'admin', kakaoId: null });

      await authController.getRoles(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.kakao).toBe(false);
      expect(payload.canCreate).toEqual({ admin: false, user: false, parent: false });
    });

    it('관리자는 초대 없이 선생님 계정을 만들 수 있다고 알려준다', async () => {
      req.user = { id: 8, role: 'admin' };
      User.getById.mockResolvedValue({ id: 8, username: '박원장', role: 'admin', kakaoId: 'K2' });
      User.listByKakaoId.mockResolvedValue([{ id: 8, username: '박원장', role: 'admin' }]);

      await authController.getRoles(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.canCreate.user).toBe(true);
      expect(payload.teacherNeedsInvite).toBe(false);
    });
  });

  describe('grantAdmin — 관리자 계정 부여', () => {
    it('같은 카카오 계정에 관리자 행을 만든다', async () => {
      req.params = { id: '9' };
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
      User.getByKakaoId.mockResolvedValue(null);
      User.getByUsername.mockResolvedValue(null);
      User.getKakaoTokens.mockResolvedValue({});
      User.createWithKakao.mockResolvedValue({ id: 50, username: '이재림_2', role: 'admin' });

      await authController.grantAdmin(req, res);

      expect(User.createWithKakao).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', kakaoId: 'K1' }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('이미 관리자 계정이 있으면 409', async () => {
      req.params = { id: '9' };
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
      User.getByKakaoId.mockResolvedValue({ id: 50, role: 'admin' });

      await authController.grantAdmin(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('카카오 계정이 아니면 400', async () => {
      req.params = { id: '1' };
      User.getById.mockResolvedValue({ id: 1, username: 'admin', role: 'admin', kakaoId: null });

      await authController.grantAdmin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('없는 사용자는 404', async () => {
      req.params = { id: '999' };
      User.getById.mockResolvedValue(null);

      await authController.grantAdmin(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });


  describe('impersonate — 관리자가 다른 계정으로 로그인 (FR-388)', () => {
    beforeEach(() => {
      req.user = { id: 1, username: 'admin', role: 'admin' };
      req.params = { id: '9' };
      User.getById.mockImplementation(async (id) => ({
        1: { id: 1, username: 'admin', role: 'admin', kakaoId: null },
        9: { id: 9, username: '이재림', role: 'user', kakaoId: 'K1' },
        20: { id: 20, username: '이재림_학부모', role: 'parent', kakaoId: 'K1' }
      })[id] || null);
    });

    it('대상 계정의 토큰을 발급하고 act 에 원래 관리자를 남긴다', async () => {
      await authController.impersonate(req, res);

      expect(res.status).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.role).toBe('user');
      expect(payload.user).toEqual({ id: 9, username: '이재림', role: 'user', kakaoId: 'K1' });
      expect(payload.impersonator).toEqual({ id: 1, username: 'admin', displayName: null });

      const decoded = jwt.verify(payload.token, JWT_SECRET);
      expect(decoded).toMatchObject({ id: 9, username: '이재림', role: 'user', act: { id: 1, username: 'admin' } });
      // 남의 계정 토큰은 30일이 아니라 1시간만 산다
      expect(decoded.exp - decoded.iat).toBe(60 * 60);
    });

    it('카카오 계정이 아닌 대상(비밀번호 계정)도 된다 — 역할 전환과 다른 점', async () => {
      User.getById.mockImplementation(async (id) =>
        id === 1
          ? { id: 1, username: 'admin', role: 'admin', kakaoId: null }
          : { id: 7, username: '비번선생님', role: 'user', kakaoId: null }
      );
      req.params = { id: '7' };

      await authController.impersonate(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(jwt.verify(res.json.mock.calls[0][0].token, JWT_SECRET).id).toBe(7);
    });

    it('학부모 계정으로도 들어갈 수 있고 응답 역할이 parent 다', async () => {
      req.params = { id: '20' };

      await authController.impersonate(req, res);

      expect(res.json.mock.calls[0][0].role).toBe('parent');
      // 학부모 마지막 로그인 시각은 실제 학부모 로그인에만 남긴다
      expect(ParentAccount.touchLogin).not.toHaveBeenCalled();
    });

    it('자기 자신은 400', async () => {
      req.params = { id: '1' };

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('없는 사용자는 404', async () => {
      req.params = { id: '999' };

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('잘못된 id 는 400', async () => {
      req.params = { id: 'abc' };

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('토큰이 관리자여도 DB 행이 더 이상 관리자가 아니면 403', async () => {
      User.getById.mockImplementation(async (id) =>
        id === 1 ? { id: 1, username: 'admin', role: 'user', kakaoId: null } : { id: 9, username: '이재림', role: 'user' }
      );

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('이미 다른 계정으로 로그인한 채로는 또 들어갈 수 없다 (403)', async () => {
      req.user = { id: 50, username: '다른관리자', role: 'admin', act: { id: 1, username: 'admin' } };

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(User.getById).not.toHaveBeenCalled();
    });

    it('DB 오류는 500', async () => {
      User.getById.mockRejectedValue(new Error('boom'));

      await authController.impersonate(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('다른 계정으로 로그인 중에는 역할을 바꿀 수 없다 (FR-388)', () => {
    beforeEach(() => {
      req.user = { id: 9, username: '이재림', role: 'user', act: { id: 1, username: 'admin' } };
    });

    it('switchRole 은 403 이고 계정을 찾지 않는다', async () => {
      req.body = { role: 'admin' };

      await authController.switchRole(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(User.getByKakaoId).not.toHaveBeenCalled();
    });

    it('addRole 도 403 이고 계정을 만들지 않는다', async () => {
      req.body = { role: 'parent' };

      await authController.addRole(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(User.createWithKakao).not.toHaveBeenCalled();
    });

    it('verify 응답에 누가 들어와 있는지 함께 준다', async () => {
      User.getById.mockResolvedValue({ id: 9, username: '이재림', role: 'user' });

      await authController.verifyTokenEndpoint(req, res);

      expect(res.json).toHaveBeenCalledWith({
        user: { id: 9, username: '이재림', role: 'user' },
        impersonatedBy: { id: 1, username: 'admin' }
      });
    });
  });

});
