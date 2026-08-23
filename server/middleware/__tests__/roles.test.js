import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const { rejectParents, requireRole } = await import('../roles.js');

const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const tokenFor = (role) => jwt.sign({ id: 1, username: 'u', role }, SECRET, { expiresIn: '1h' });

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('rejectParents — 학부모 토큰 차단', () => {
  it('학부모 토큰은 403 으로 막는다', () => {
    const req = { headers: { authorization: `Bearer ${tokenFor('parent')}` } };
    const res = makeRes();
    const next = jest.fn();

    rejectParents(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('Bearer 접두사가 없어도 학부모 토큰을 막는다', () => {
    const req = { headers: { authorization: tokenFor('parent') } };
    const res = makeRes();
    const next = jest.fn();

    rejectParents(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('선생님·관리자 토큰은 통과시킨다', () => {
    for (const role of ['user', 'admin']) {
      const req = { headers: { authorization: `Bearer ${tokenFor(role)}` } };
      const res = makeRes();
      const next = jest.fn();

      rejectParents(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it('토큰이 없으면 통과시킨다 (인증 판정은 verifyToken 이 한다)', () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    rejectParents(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('깨진 토큰도 통과시킨다 (401 은 verifyToken 이 낸다)', () => {
    const req = { headers: { authorization: 'Bearer not-a-token' } };
    const res = makeRes();
    const next = jest.fn();

    rejectParents(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('만료된 학부모 토큰은 막지 않는다 (어차피 verifyToken 이 401)', () => {
    const expired = jwt.sign({ id: 1, role: 'parent' }, SECRET, { expiresIn: -10 });
    const req = { headers: { authorization: `Bearer ${expired}` } };
    const res = makeRes();
    const next = jest.fn();

    rejectParents(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('허용된 역할만 통과시킨다', () => {
    const req = { user: { role: 'parent' } };
    const res = makeRes();
    const next = jest.fn();

    requireRole('parent')(req, res, next);
    expect(next).toHaveBeenCalled();

    const res2 = makeRes();
    const next2 = jest.fn();
    requireRole('admin')(req, res2, next2);
    expect(res2.status).toHaveBeenCalledWith(403);
    expect(next2).not.toHaveBeenCalled();
  });

  it('req.user 가 없으면 403', () => {
    const res = makeRes();
    const next = jest.fn();

    requireRole('parent')({}, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
