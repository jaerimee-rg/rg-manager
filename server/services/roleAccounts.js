import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ParentAccount from '../models/ParentAccount.js';
import ParentTeacher from '../models/ParentTeacher.js';
import { uniqueUsername } from '../utils/usernames.js';

/**
 * 한 카카오 계정의 역할별 계정을 만들고 전환하는 공통 로직
 * (docs/accounts-roles 02 §2.9). 컨트롤러는 이 결과에 HTTP 코드만 매긴다.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30d';

/** 역할 전환·가입·로그인이 모두 같은 형태의 토큰을 쓰도록 한 곳에 모은다 */
export const issueToken = (user) =>
  jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });

const nameTaken = async (name) => Boolean(await User.getByUsername(name));

/** 오류를 예외 대신 값으로 돌려 컨트롤러가 상태 코드를 정하게 한다 */
const fail = (status, error, extra = {}) => ({ ok: false, status, error, ...extra });
const done = (user, extra = {}) => ({ ok: true, user, ...extra });

/**
 * 이 사람이 가진 계정들과 만들 수 있는 역할 (FR-320).
 * 비밀번호 전용 계정(kakaoId 없음)은 다른 역할을 가질 수 없다.
 */
export const describeRoles = async (currentUser) => {
  const kakaoId = currentUser.kakaoId || null;
  const accounts = kakaoId
    ? await User.listByKakaoId(kakaoId)
    : [{ id: currentUser.id, username: currentUser.username, role: currentUser.role }];

  const has = (role) => accounts.some((a) => a.role === role);

  return {
    current: { id: currentUser.id, role: currentUser.role, username: currentUser.username },
    kakao: Boolean(kakaoId),
    accounts,
    canCreate: {
      // 관리자 계정은 이 경로로 만들 수 없다 (FR-335)
      admin: false,
      user: Boolean(kakaoId) && !has('user'),
      parent: Boolean(kakaoId) && !has('parent')
    },
    // 선생님 계정은 관리자만 초대 없이 만들 수 있다 (FR-331)
    teacherNeedsInvite: currentUser.role !== 'admin',
    // 학부모 계정은 선생님이 자기 학원용으로 만들 때만 초대가 필요 없다 (FR-332)
    parentNeedsInvite: currentUser.role !== 'user'
  };
};

/**
 * 선생님 계정 만들기 (FR-331).
 * 알림 발송이 재로그인 없이 되도록 현재 행의 카카오 토큰을 복사한다 (FR-314).
 */
export const createTeacherAccount = async (fromUser) => {
  if (!fromUser.kakaoId) return fail(400, '카카오 계정만 다른 역할 계정을 만들 수 있습니다.');

  if (await User.getByKakaoId(fromUser.kakaoId, 'user')) {
    return fail(409, '이미 선생님 계정이 있습니다.');
  }

  const tokens = (await User.getKakaoTokens(fromUser.id)) || {};

  const user = await User.createWithKakao({
    kakaoId: fromUser.kakaoId,
    // 선생님은 가입 후 /register-name 에서 이름을 정한다 (기존 신규 선생님과 동일)
    username: `카카오_${Date.now()}`,
    email: fromUser.email || null,
    role: 'user',
    accessToken: tokens.kakaoAccessToken || null,
    refreshToken: tokens.kakaoRefreshToken || null,
    tokenExpiresAt: tokens.kakaoTokenExpiresAt || null
  });

  return done(user, { isNewUser: true });
};

/**
 * 학부모 계정 만들기 / 선생님 연결 추가 (FR-332).
 * 이미 학부모 계정이 있으면 계정을 만들지 않고 연결만 더한다.
 */
export const createParentAccount = async (fromUser, { teacherId, inviteId = null }) => {
  if (!fromUser.kakaoId) return fail(400, '카카오 계정만 다른 역할 계정을 만들 수 있습니다.');
  if (!teacherId) return fail(400, '연결할 선생님을 찾을 수 없습니다.');

  const existing = await User.getByKakaoId(fromUser.kakaoId, 'parent');

  if (existing) {
    const alreadyLinked = await ParentTeacher.isLinked(existing.id, teacherId);
    await ParentAccount.create({ userId: existing.id, teacherId, inviteId });
    return done(existing, { linkedOnly: true, alreadyLinked });
  }

  const username = await uniqueUsername(fromUser.username, nameTaken, '학부모');

  const user = await User.createWithKakao({
    kakaoId: fromUser.kakaoId,
    username,
    email: fromUser.email || null,
    role: 'parent',
    // 학부모에게는 카카오 메시지를 보내지 않으므로 토큰을 저장하지 않는다
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null
  });

  await ParentAccount.create({ userId: user.id, teacherId, inviteId });

  return done(user, { isNewUser: true, needsOnboarding: true });
};

/** 관리자 계정 부여 (FR-382) — 관리자만 호출한다 */
export const createAdminAccount = async (targetUser) => {
  if (!targetUser.kakaoId) return fail(400, '카카오 계정에만 관리자 계정을 추가할 수 있습니다.');

  if (await User.getByKakaoId(targetUser.kakaoId, 'admin')) {
    return fail(409, '이미 관리자 계정이 있습니다.');
  }

  const tokens = (await User.getKakaoTokens(targetUser.id)) || {};
  const username = await uniqueUsername(targetUser.username, nameTaken, '관리자');

  const user = await User.createWithKakao({
    kakaoId: targetUser.kakaoId,
    username,
    email: targetUser.email || null,
    role: 'admin',
    accessToken: tokens.kakaoAccessToken || null,
    refreshToken: tokens.kakaoRefreshToken || null,
    tokenExpiresAt: tokens.kakaoTokenExpiresAt || null
  });

  return done(user);
};

export default {
  issueToken,
  describeRoles,
  createTeacherAccount,
  createParentAccount,
  createAdminAccount
};
