import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * 토큰에서 역할만 꺼낸다. 인증 자체는 verifyToken 이 담당하므로
 * 여기서는 토큰이 없거나 깨졌다고 막지 않는다 (그 판정은 뒤 미들웨어에 맡긴다).
 */
const peekRole = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

  try {
    return jwt.verify(token, JWT_SECRET)?.role ?? null;
  } catch {
    return null;
  }
};

const forbidden = (res) =>
  res.status(403).json({ error: '이 기능에 접근할 권한이 없습니다.' });

/**
 * 선생님·관리자용 라우터를 학부모 토큰으로부터 보호한다.
 *
 * 기존 `verifyToken` 은 역할을 보지 않아 학부모 토큰도 통과한다. 라우터 파일을
 * 건드리지 않고 server.js 의 등록 지점에서 한 번에 막기 위한 미들웨어다.
 */
export const rejectParents = (req, res, next) => {
  if (peekRole(req) === 'parent') return forbidden(res);
  next();
};

/**
 * 지정한 역할만 통과시킨다. verifyToken 뒤에 써서 req.user 를 신뢰한다.
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return forbidden(res);
  next();
};

export default { rejectParents, requireRole };
