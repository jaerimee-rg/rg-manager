import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../auth.js';

// Mock environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

describe('verifyToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('유효한 토큰', () => {
    it('should verify valid token with Bearer prefix', () => {
      const payload = { id: 1, username: 'testuser', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should verify valid token without Bearer prefix', () => {
      const payload = { id: 2, username: 'admin', role: 'admin' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

      req.headers.authorization = token;

      verifyToken(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set req.user with decoded token payload', () => {
      const payload = { id: 3, username: 'viewer', role: 'user' };
      const token = jwt.sign(payload, JWT_SECRET);

      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(req.user.id).toBe(payload.id);
      expect(req.user.username).toBe(payload.username);
      expect(req.user.role).toBe(payload.role);
      expect(req.user.iat).toBeDefined(); // JWT adds 'issued at' timestamp
    });
  });

  describe('누락된 토큰', () => {
    it('should return 401 when authorization header is missing', () => {
      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '토큰이 제공되지 않았습니다.',
        tokenExpired: true,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is empty string', () => {
      req.headers.authorization = '';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '토큰이 제공되지 않았습니다.',
        tokenExpired: true,
      });
    });

    it('should return 401 when authorization header is null', () => {
      req.headers.authorization = null;

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '토큰이 제공되지 않았습니다.',
        tokenExpired: true,
      });
    });
  });

  describe('만료된 토큰', () => {
    it('should return 401 for expired token', () => {
      const payload = { id: 1, username: 'testuser', role: 'user' };
      const expiredToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' }); // Already expired

      req.headers.authorization = `Bearer ${expiredToken}`;

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '토큰이 만료되었습니다.',
        tokenExpired: true,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should include tokenExpired flag for expired token', () => {
      const expiredToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
      req.headers.authorization = expiredToken;

      verifyToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ tokenExpired: true })
      );
    });
  });

  describe('유효하지 않은 토큰', () => {
    it('should return 401 for invalid token signature', () => {
      const payload = { id: 1, username: 'testuser' };
      const invalidToken = jwt.sign(payload, 'wrong-secret');

      req.headers.authorization = `Bearer ${invalidToken}`;

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '유효하지 않은 토큰입니다.',
        tokenExpired: true,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for malformed token', () => {
      req.headers.authorization = 'Bearer invalid.token.here';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '유효하지 않은 토큰입니다.',
        tokenExpired: true,
      });
    });

    it('should return 401 for random string token', () => {
      req.headers.authorization = 'Bearer randomstring123';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '유효하지 않은 토큰입니다.',
        tokenExpired: true,
      });
    });

    it('should return 401 for empty Bearer token', () => {
      req.headers.authorization = 'Bearer ';

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '유효하지 않은 토큰입니다.',
        tokenExpired: true,
      });
    });
  });

  describe('서버 오류 처리', () => {
    it('should handle unexpected errors gracefully', () => {
      // Mock jwt.verify to throw unexpected error
      const originalVerify = jwt.verify;
      jwt.verify = jest.fn(() => {
        throw new Error('Unexpected error');
      });

      const token = jwt.sign({ id: 1 }, JWT_SECRET);
      req.headers.authorization = `Bearer ${token}`;

      verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: '서버 오류가 발생했습니다.',
      });
      expect(next).not.toHaveBeenCalled();

      // Restore original function
      jwt.verify = originalVerify;
    });
  });

  describe('토큰 형식 처리', () => {
    it('should handle Bearer prefix with lowercase', () => {
      const payload = { id: 1, username: 'testuser' };
      const token = jwt.sign(payload, JWT_SECRET);

      req.headers.authorization = `bearer ${token}`; // lowercase

      verifyToken(req, res, next);

      // Should not work with lowercase 'bearer'
      expect(req.user).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should extract token correctly from "Bearer <token>" format', () => {
      const payload = { id: 5, username: 'extractor' };
      const token = jwt.sign(payload, JWT_SECRET);
      const bearerToken = `Bearer ${token}`;

      req.headers.authorization = bearerToken;

      verifyToken(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalled();
    });
  });
});
