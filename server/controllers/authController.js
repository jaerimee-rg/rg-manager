import User from '../models/User.js';
import ParentInvite from '../models/ParentInvite.js';
import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import ParentTeacher from '../models/ParentTeacher.js';
import TeacherInvite from '../models/TeacherInvite.js';
import jwt from 'jsonwebtoken';
import { KAKAO_REDIRECT_URI } from '../utils/appUrl.js';
import { encodeState, decodeState, pickAccount, extractInviteToken } from '../utils/oauthState.js';
import { uniqueUsername } from '../utils/usernames.js';
import {
  issueToken,
  issueImpersonationToken,
  describeRoles,
  createTeacherAccount,
  createParentAccount,
  createAdminAccount
} from '../services/roleAccounts.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30d'; // 로그아웃 전까지 유지 (30일)

export const USERNAME_MAX = 30;
const USER_ROLES = ['user', 'admin'];

// 카카오 OAuth 설정 (환경 변수에서 로드)
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;


export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.getByCredentials(username, password);

    if (!user) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    }

    // 비밀번호 제외하고 반환
    const { password: _, ...userWithoutPassword } = user;

    // JWT 토큰 생성
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: '로그인 성공',
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 중복 확인
    const existingUser = await User.getByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: '이미 존재하는 사용자입니다.' });
    }

    const newUser = await User.create({ username, password });

    // JWT 토큰 생성
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: '회원가입 성공',
      user: newUser,
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.getAll();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const userId = parseInt(req.params.id, 10);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: '잘못된 사용자입니다.' });
    }

    const target = await User.getById(userId);
    if (!target) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const { username, password, role } = req.body;

    // 보내지 않은 항목은 기존 값을 유지한다.
    const nextUsername = (username === undefined ? target.username : String(username)).trim();
    const nextRole = role === undefined ? target.role : role;

    if (!nextUsername) {
      return res.status(400).json({ error: '사용자 이름을 입력해주세요.' });
    }
    if (nextUsername.length > USERNAME_MAX) {
      return res.status(400).json({ error: `사용자 이름은 ${USERNAME_MAX}자 이내로 입력해주세요.` });
    }
    if (!USER_ROLES.includes(nextRole)) {
      return res.status(400).json({ error: '잘못된 역할입니다.' });
    }

    // 이름을 바꿀 때만 중복을 확인한다 (자기 자신은 제외).
    if (nextUsername !== target.username) {
      const existing = await User.getByUsername(nextUsername);
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: '이미 사용 중인 이름입니다.' });
      }
    }

    const updatedUser = await User.update(userId, {
      username: nextUsername,
      password,
      role: nextRole
    });

    res.json(updatedUser);
  } catch (error) {
    // 중복 확인과 UPDATE 사이에 같은 이름이 선점된 경우 (unique_violation)
    if (error.code === '23505') {
      return res.status(400).json({ error: '이미 사용 중인 이름입니다.' });
    }
    console.error('사용자 수정 오류:', error);
    res.status(500).json({ error: '사용자 수정 중 오류가 발생했습니다.' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    const { id } = req.params;

    // 관리자가 1명이라 자기 자신을 지우면 아무도 관리할 수 없게 된다.
    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
    }

    /* 선생님을 지우면 학부모 연결을 끊고, 그 결과 어느 선생님과도 연결되지 않은
       학부모 계정만 함께 지운다. 다른 선생님에게도 다니는 학부모는 남는다. */
    await ParentAccount.deleteByTeacher(id);
    await User.delete(id);

    res.json({ message: '사용자가 삭제되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: '사용자 삭제 중 오류가 발생했습니다.' });
  }
};

export const verifyTokenEndpoint = async (req, res) => {
  try {
    // req.user is set by verifyToken middleware
    const user = await User.getById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: '사용자를 찾을 수 없습니다.', tokenExpired: true });
    }
    const { password: _, ...userWithoutPassword } = user;
    // 관리자가 다른 계정으로 들어와 있으면(FR-388) 화면이 배너를 그릴 수 있게 알려준다
    const actor = impersonatedBy(req);
    res.json({ user: userWithoutPassword, ...(actor ? { impersonatedBy: actor } : {}) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 사용자 데이터 이전 (관리자 전용)
export const transferUserData = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const { fromUserId, toUserId } = req.body;

    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: '이전할 사용자와 대상 사용자를 모두 선택해주세요.' });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: '같은 사용자에게 데이터를 이전할 수 없습니다.' });
    }

    const result = await User.transferData(fromUserId, toUserId);
    res.json(result);
  } catch (error) {
    console.error('데이터 이전 오류:', error);
    res.status(500).json({ error: error.message });
  }
};

// 카카오 로그인 URL 생성
export const getKakaoAuthUrl = (req, res) => {
  if (!KAKAO_CLIENT_ID) {
    return res.status(500).json({ error: '카카오 로그인이 설정되지 않았습니다.' });
  }
  // talk_message scope 추가 (카카오톡 메시지 전송 권한).
  // 로그인 시점에는 어느 역할로 들어갈지 모르므로 선생님·관리자에게 필요한 권한을 항상 요청한다.
  const scope = 'talk_message';
  let kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code&scope=${scope}`;

  /* 초대 토큰과 "마지막에 쓰던 역할" 힌트를 state 로 실어 보낸다.
     (카카오가 콜백에 그대로 돌려주므로 별도 세션 저장이 필요 없다)
     셋 다 없으면 state 자체를 붙이지 않아 지금까지와 같은 URL 이 된다. */
  const state = encodeState({
    prefer: String(req.query.prefer || '').trim() || undefined,
    invite: String(req.query.invite || '').trim() || undefined,
    tinvite: String(req.query.tinvite || '').trim() || undefined
  });

  if (state) {
    kakaoAuthUrl += `&state=${encodeURIComponent(state)}`;
  }

  res.json({ url: kakaoAuthUrl });
};

/** username 은 UNIQUE 라 겹치면 뒤에 숫자를 붙인다 (utils/usernames 공용) */
const nameTaken = async (name) => Boolean(await User.getByUsername(name));

/** 학부모가 온보딩(아이 등록)을 아직 안 했는지 */
const needsOnboarding = async (user) => {
  if (user.role !== 'parent') return false;
  const children = await ParentChild.listByParent(user.id);
  return children.length === 0;
};

/**
 * 카카오 인증 코드를 액세스 토큰과 사용자 정보로 바꾼다.
 * 실패하면 { error } 를, 성공하면 프로필과 토큰을 돌려준다.
 */
const exchangeKakaoCode = async (code) => {
  const tokenParams = {
    grant_type: 'authorization_code',
    client_id: KAKAO_CLIENT_ID,
    redirect_uri: KAKAO_REDIRECT_URI,
    code,
  };

  if (KAKAO_CLIENT_SECRET) {
    tokenParams.client_secret = KAKAO_CLIENT_SECRET;
  }

  const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(tokenParams),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error('카카오 토큰 발급 실패:', tokenData);
    return { error: '카카오 인증에 실패했습니다.' };
  }

  const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
  });

  const kakaoUser = await userResponse.json();

  if (!kakaoUser.id) {
    return { error: '카카오 사용자 정보를 가져올 수 없습니다.' };
  }

  const kakaoId = kakaoUser.id.toString();

  return {
    kakaoId,
    nickname: kakaoUser.properties?.nickname || `카카오${kakaoId.slice(-4)}`,
    email: kakaoUser.kakao_account?.email || null,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };
};

/**
 * 카카오 콜백 (docs/accounts-roles 02 §4.2 판정표).
 *
 * 핵심 변경 두 가지:
 *  1. **초대 없이는 계정을 만들지 않는다.** 예전에는 카카오 로그인만으로 누구나
 *     선생님 계정이 생겼다. 이제 선생님은 관리자 초대, 학부모는 선생님 초대가 있어야 한다.
 *  2. 한 카카오 계정이 역할마다 계정을 가질 수 있으므로, 계정을 **목록으로** 읽고
 *     "마지막에 쓰던 역할" 힌트 → 관리자 > 선생님 > 학부모 순으로 하나를 고른다.
 */
export const kakaoCallback = async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: '인증 코드가 없습니다.' });
    }

    const { prefer, invite: inviteToken, tinvite: teacherInviteToken } = decodeState(state);

    /* 초대 토큰은 카카오를 다녀오기 **전에** 확인한다.
       무효한 링크로 굳이 카카오 인증까지 시키지 않기 위함이다. */
    let parentInvite = null;
    if (inviteToken) {
      parentInvite = await ParentInvite.getByToken(inviteToken);
      if (!ParentInvite.isUsable(parentInvite)) {
        return res.status(400).json({ error: '유효하지 않은 초대 링크입니다. 선생님께 새 링크를 요청해 주세요.' });
      }
    }

    let teacherInvite = null;
    if (teacherInviteToken) {
      teacherInvite = await TeacherInvite.getByToken(teacherInviteToken);
      if (!TeacherInvite.isUsable(teacherInvite)) {
        return res.status(400).json({ error: '유효하지 않은 초대 링크입니다. 관리자에게 새 링크를 요청해 주세요.' });
      }
    }

    const profile = await exchangeKakaoCode(code);
    if (profile.error) {
      return res.status(400).json({ error: profile.error });
    }

    const { kakaoId, nickname, email, accessToken, refreshToken, tokenExpiresAt } = profile;
    const accounts = await User.listByKakaoId(kakaoId);
    const accountOf = (role) => accounts.find((a) => a.role === role) || null;

    let user = null;
    let isNewUser = false;

    if (teacherInvite) {
      // ── 선생님 초대 흐름 ──
      const existing = accountOf('user');

      if (existing) {
        /* 이미 선생님 계정이 있으면 로그인만 시키고 토큰은 **쓰지 않는다**.
           관리자가 그 링크를 다른 사람에게 다시 줄 수 있어야 한다. */
        user = await User.getByKakaoId(kakaoId, 'user');
        const updated = await User.updateKakaoTokens(user.id, { email, accessToken, refreshToken, tokenExpiresAt });
        if (updated) user = updated;
      } else {
        user = await User.createWithKakao({
          kakaoId,
          username: `카카오_${Date.now()}`,
          email,
          role: 'user',
          accessToken,
          refreshToken,
          tokenExpiresAt,
        });
        isNewUser = true;

        // 동시에 같은 링크를 연 사람이 있으면 여기서 진다 (usedAt IS NULL 조건)
        const consumed = await TeacherInvite.markUsed(teacherInvite.id, user.id);
        if (!consumed) {
          await User.delete(user.id);
          return res.status(409).json({ error: '이미 사용된 초대 링크입니다. 관리자에게 새 링크를 요청해 주세요.' });
        }
      }
    } else if (parentInvite) {
      // ── 학부모 초대 흐름 ──
      const existing = accountOf('parent');

      if (existing) {
        user = await User.getByKakaoId(kakaoId, 'parent');
        // 이미 있는 계정이면 새 선생님 연결만 더한다 (다른 선생님 링크를 탄 경우)
        await ParentAccount.create({ userId: user.id, teacherId: parentInvite.userId, inviteId: parentInvite.id });
      } else {
        user = await User.createWithKakao({
          kakaoId,
          username: await uniqueUsername(nickname, nameTaken, '학부모'),
          email,
          role: 'parent',
          // 학부모에게는 알림을 보내지 않으므로 메시지 토큰을 저장하지 않는다.
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        });
        isNewUser = true;
        await ParentAccount.create({ userId: user.id, teacherId: parentInvite.userId, inviteId: parentInvite.id });
      }
    } else if (accounts.length === 0) {
      /* ── 초대도 없고 계정도 없다 ──
         예전에는 여기서 선생님 계정이 자동으로 생겼다. 이제는 만들지 않는다. */
      return res.status(403).json({
        outcome: 'needsInvite',
        error: '가입에는 초대가 필요합니다. 선생님은 관리자에게, 학부모는 다니는 학원 선생님에게 초대 링크를 요청해 주세요.'
      });
    } else {
      // ── 이미 있는 계정으로 로그인 ──
      const picked = pickAccount(accounts, prefer);
      user = await User.getByKakaoId(kakaoId, picked.role);

      if (user.role === 'parent') {
        // 학부모에게는 메시지 토큰이 필요 없으므로 마지막 로그인만 갱신한다.
        await ParentAccount.touchLogin(user.id);
      } else {
        const updated = await User.updateKakaoTokens(user.id, { email, accessToken, refreshToken, tokenExpiresAt });
        if (updated) user = updated;
      }
    }

    const token = issueToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: '카카오 로그인 성공',
      user: userWithoutPassword,
      token,
      isNewUser,  // 신규 사용자 여부 반환
      role: user.role,
      // 학부모가 아직 아이를 등록하지 않았으면 온보딩 화면으로 보낸다
      needsOnboarding: await needsOnboarding(user),
      // 이 카카오 계정이 가진 다른 역할 계정 (화면이 전환 메뉴를 그릴 때 쓴다)
      accounts: (isNewUser ? [...accounts, { role: user.role, username: user.username }] : accounts)
        .map(({ role, username }) => ({ role, username })),
    });
  } catch (error) {
    /* 운영 DB 에 옛 단일 UNIQUE("kakaoId") 가 남아 있으면 두 번째 역할 계정 생성이
       여기서 막힌다. 마이그레이션 미적용 신호이므로 알아볼 수 있게 남긴다. */
    if (error?.code === '23505') {
      console.error('카카오 계정 UNIQUE 위반 — users 의 kakaoId 복합 인덱스 마이그레이션이 적용됐는지 확인하세요:', error.detail);
      return res.status(409).json({
        error: '같은 카카오 계정의 다른 역할 계정이 있어 지금은 가입할 수 없습니다. 관리자에게 문의해 주세요.'
      });
    }
    console.error('카카오 로그인 오류:', error);
    res.status(500).json({ error: '카카오 로그인 처리 중 오류가 발생했습니다.' });
  }
};

// 카카오 메시지 알림 동의 설정
export const updateKakaoMessageConsent = async (req, res) => {
  try {
    const { consent, targetUserId } = req.body;

    // 관리자인 경우 다른 사용자의 동의 설정 변경 가능
    let userId = req.user.id;
    if (targetUserId && req.user.role === 'admin') {
      userId = targetUserId;
    }

    // 카카오 알림 동의 변경 처리

    const user = await User.updateMessageConsent(userId, consent);

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      message: consent ? '카카오톡 알림이 활성화되었습니다.' : '카카오톡 알림이 비활성화되었습니다.',
      user
    });
  } catch (error) {
    console.error('알림 설정 변경 오류:', error);
    res.status(500).json({ error: error.message });
  }
};

// 카카오 메시지 로그 조회 (관리자 전용)
export const getKakaoMessageLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const { default: KakaoMessageLog } = await import('../models/KakaoMessageLog.js');
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const logs = await KakaoMessageLog.getAll(limit, offset);
    const total = await KakaoMessageLog.getCount();

    res.json({ logs, total });
  } catch (error) {
    console.error('카카오 메시지 로그 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
};

// 카카오 메시지 전송 (관리자 전용)
export const sendKakaoMessage = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const { recipientId, message } = req.body;

    if (!recipientId || !message) {
      return res.status(400).json({ error: '수신자와 메시지 내용을 입력해주세요.' });
    }

    // 수신자가 카카오 사용자인지 확인
    const recipient = await User.getById(recipientId);
    if (!recipient || !recipient.kakaoId) {
      return res.status(400).json({ error: '수신자가 카카오 계정이 아닙니다.' });
    }

    const { sendCustomKakaoMessage } = await import('../utils/kakaoMessage.js');
    const result = await sendCustomKakaoMessage({
      senderId: req.user.id,
      recipientId,
      message,
    });

    if (result.success) {
      res.json({ message: '메시지가 전송되었습니다.' });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('카카오 메시지 전송 오류:', error);
    res.status(500).json({ error: error.message });
  }
};

// 카카오 사용자 목록 조회 (관리자 전용)
export const getKakaoUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const users = await User.getAll();
    const kakaoUsers = users.filter(u => u.kakaoId);

    res.json(kakaoUsers);
  } catch (error) {
    console.error('카카오 사용자 조회 오류:', error);
    res.status(500).json({ error: error.message });
  }
};

// 사용자 이름 업데이트 (카카오 가입 후 이름 설정)
export const updateUsername = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username } = req.body;

    const nextUsername = (username || '').trim();

    if (!nextUsername) {
      return res.status(400).json({ error: '이름을 입력해주세요.' });
    }
    if (nextUsername.length > USERNAME_MAX) {
      return res.status(400).json({ error: `이름은 ${USERNAME_MAX}자 이내로 입력해주세요.` });
    }

    // 중복 확인
    const existingUser = await User.getByUsername(nextUsername);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: '이미 사용 중인 이름입니다.' });
    }

    const user = await User.updateUsername(userId, nextUsername);

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      message: '이름이 설정되었습니다.',
      user
    });
  } catch (error) {
    // 확인과 UPDATE 사이에 같은 이름이 선점된 경우 (unique_violation)
    if (error.code === '23505') {
      return res.status(400).json({ error: '이미 사용 중인 이름입니다.' });
    }
    console.error('이름 설정 오류:', error);
    res.status(500).json({ error: '이름 변경 중 오류가 발생했습니다.' });
  }
};

// 카카오 토큰 상태 확인 및 테스트 메시지 전송
export const testKakaoMessage = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. 토큰 정보 가져오기
    const tokens = await User.getKakaoTokens(userId);

    if (!tokens) {
      return res.json({
        status: 'NO_TOKENS',
        message: '카카오 토큰이 없습니다. 카카오로 다시 로그인해주세요.',
        tokens: null
      });
    }

    // 토큰 만료 여부 확인
    const now = new Date();
    const expiresAt = tokens.kakaoTokenExpiresAt ? new Date(tokens.kakaoTokenExpiresAt) : null;
    const isExpired = expiresAt ? now > expiresAt : true;

    if (!tokens.kakaoAccessToken) {
      return res.json({
        status: 'NO_ACCESS_TOKEN',
        message: '액세스 토큰이 없습니다. 카카오로 다시 로그인해주세요.',
        tokens: {
          hasAccessToken: false,
          hasRefreshToken: !!tokens.kakaoRefreshToken,
          expiresAt: tokens.kakaoTokenExpiresAt,
          messageConsent: tokens.kakaoMessageConsent
        }
      });
    }

    if (!tokens.kakaoMessageConsent) {
      return res.json({
        status: 'NO_CONSENT',
        message: '카카오톡 알림에 동의하지 않았습니다. 설정에서 알림을 활성화해주세요.',
        tokens: {
          hasAccessToken: true,
          hasRefreshToken: !!tokens.kakaoRefreshToken,
          expiresAt: tokens.kakaoTokenExpiresAt,
          isExpired,
          messageConsent: false
        }
      });
    }

    // 2. 테스트 메시지 전송 시도
    const { sendAttendanceKakaoMessage } = await import('../utils/kakaoMessage.js');

    const testResult = await sendAttendanceKakaoMessage({
      userId,
      date: new Date().toISOString().split('T')[0],
      className: '테스트 수업',
      schedule: '테스트 시간',
      students: [{ id: 1, name: '테스트학생' }],
      presentStudentIds: [1]
    });

    res.json({
      status: testResult.success ? 'SUCCESS' : 'FAILED',
      message: testResult.success ? '테스트 메시지가 전송되었습니다!' : testResult.error,
      tokens: {
        hasAccessToken: true,
        hasRefreshToken: !!tokens.kakaoRefreshToken,
        expiresAt: tokens.kakaoTokenExpiresAt,
        isExpired,
        messageConsent: true
      },
      testResult
    });
  } catch (error) {
    console.error('카카오 테스트 오류:', error);
    res.status(500).json({ error: '카카오 테스트 중 오류가 발생했습니다.' });
  }
};


/* ───────── 역할 전환 · 역할 계정 만들기 (docs/accounts-roles §5.3~5.4) ───────── */

/** 현재 로그인한 사람의 DB 행 (kakaoId 는 여기서만 읽는다 — 요청 본문을 믿지 않는다) */
const currentUserRow = (req) => User.getById(req.user.id);

/** 관리자가 다른 계정으로 들어와 있으면 그 관리자, 아니면 null (FR-388) */
const impersonatedBy = (req) => req.user?.act || null;

const IMPERSONATING_CANNOT_SWITCH =
  '다른 계정으로 로그인 중에는 역할을 바꿀 수 없습니다. 먼저 관리자로 돌아가세요.';

/** 이 카카오 계정이 가진 계정들과 만들 수 있는 역할 (FR-320) */
export const getRoles = async (req, res) => {
  try {
    const me = await currentUserRow(req);
    if (!me) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    res.json(await describeRoles(me));
  } catch (error) {
    console.error('역할 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 역할 전환 (FR-321).
 * 대상 행은 **현재 계정의 kakaoId** 로만 찾는다. 요청 본문에 무엇을 넣어도
 * 남의 카카오 계정으로는 넘어갈 수 없다.
 */
export const switchRole = async (req, res) => {
  try {
    // 대신 로그인한 토큰으로 전환하면 `act` 가 빠진 토큰이 나와 추적이 끊긴다
    if (impersonatedBy(req)) {
      return res.status(403).json({ error: IMPERSONATING_CANNOT_SWITCH });
    }

    const role = String(req.body?.role || '').trim();
    if (!['admin', 'user', 'parent'].includes(role)) {
      return res.status(400).json({ error: '잘못된 역할입니다.' });
    }

    const me = await currentUserRow(req);
    if (!me) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    if (me.role === role) {
      return res.json({ user: me, token: issueToken(me), role: me.role });
    }

    if (!me.kakaoId) {
      return res.status(400).json({ error: '카카오 계정만 역할을 전환할 수 있습니다.' });
    }

    const target = await User.getByKakaoId(me.kakaoId, role);
    if (!target) {
      const { canCreate } = await describeRoles(me);
      return res.status(404).json({ error: '해당 역할의 계정이 없습니다.', canCreate: canCreate[role] === true });
    }

    if (target.role === 'parent') {
      await ParentAccount.touchLogin(target.id);
    }

    const { password: _, ...userWithoutPassword } = target;
    res.json({ user: userWithoutPassword, token: issueToken(target), role: target.role });
  } catch (error) {
    console.error('역할 전환 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 없는 역할의 계정 만들기 (FR-330~336).
 * 선생님은 관리자 초대가 필요하고(관리자 본인은 예외), 학부모는 선생님 초대가
 * 필요하다(선생님이 자기 학원 학부모가 되는 경우는 예외).
 */
export const addRole = async (req, res) => {
  try {
    if (impersonatedBy(req)) {
      return res.status(403).json({ error: IMPERSONATING_CANNOT_SWITCH });
    }

    const role = String(req.body?.role || '').trim();
    const inviteInput = extractInviteToken(req.body?.invite);

    if (role === 'admin') {
      return res.status(400).json({ error: '관리자 계정은 관리자가 부여합니다.' });
    }
    if (!['user', 'parent'].includes(role)) {
      return res.status(400).json({ error: '잘못된 역할입니다.' });
    }

    const me = await currentUserRow(req);
    if (!me) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (!me.kakaoId) {
      return res.status(400).json({ error: '카카오 계정만 다른 역할 계정을 만들 수 있습니다.' });
    }

    if (role === 'user') {
      // 관리자는 스스로에게 초대를 발급할 수 있으므로 토큰을 요구하지 않는다.
      let invite = null;
      if (me.role !== 'admin') {
        invite = inviteInput ? await TeacherInvite.getByToken(inviteInput) : null;
        if (!TeacherInvite.isUsable(invite)) {
          return res.status(400).json({ error: '선생님 초대 링크가 필요합니다.', needsInvite: true });
        }
      }

      const created = await createTeacherAccount(me);
      if (!created.ok) return res.status(created.status).json({ error: created.error });

      if (invite) {
        const consumed = await TeacherInvite.markUsed(invite.id, created.user.id);
        if (!consumed) {
          await User.delete(created.user.id);
          return res.status(409).json({ error: '이미 사용된 초대 링크입니다.' });
        }
      }

      return res.status(201).json({
        user: created.user,
        token: issueToken(created.user),
        role: 'user',
        isNewUser: true
      });
    }

    // role === 'parent'
    let teacherId = null;
    let inviteId = null;

    if (inviteInput) {
      const invite = await ParentInvite.getByToken(inviteInput);
      if (!ParentInvite.isUsable(invite)) {
        return res.status(400).json({ error: '유효하지 않은 초대 링크입니다.', needsInvite: true });
      }
      teacherId = invite.userId;
      inviteId = invite.id;
    } else if (me.role === 'user') {
      // 선생님이 자기 학원 학부모가 되는 경우 (자기 학생과 연결하면 되므로 초대가 필요 없다)
      teacherId = me.id;
    } else {
      return res.status(400).json({ error: '초대 링크가 필요합니다.', needsInvite: true });
    }

    const created = await createParentAccount(me, { teacherId, inviteId });
    if (!created.ok) return res.status(created.status).json({ error: created.error });

    const children = await ParentChild.listByParent(created.user.id);
    res.status(created.linkedOnly ? 200 : 201).json({
      user: created.user,
      token: issueToken(created.user),
      role: 'parent',
      isNewUser: created.isNewUser === true,
      linkedOnly: created.linkedOnly === true,
      alreadyLinked: created.alreadyLinked === true,
      needsOnboarding: children.length === 0
    });
  } catch (error) {
    console.error('역할 계정 생성 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 관리자 계정 부여 (FR-382) — 관리자 전용 */
export const grantAdmin = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) return res.status(400).json({ error: '잘못된 사용자입니다.' });

    const target = await User.getById(targetId);
    if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const created = await createAdminAccount(target);
    if (!created.ok) return res.status(created.status).json({ error: created.error });

    res.status(201).json({ user: created.user });
  } catch (error) {
    console.error('관리자 계정 부여 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 관리자가 다른 사용자 계정으로 로그인 (FR-388) — 관리자 전용.
 *
 * 역할 전환(FR-321)과 달리 대상이 누구든 된다 — 관리자는 이미 모든 데이터를 다룰 수
 * 있으므로 권한이 늘어나지 않는다. 대신 발급한 토큰의 `act` 에 원래 관리자를 남겨
 * 로그(`middleware/logger.js`)와 화면 배너가 누가 보고 있는지 알 수 있게 한다.
 * 관리자 여부는 토큰이 아니라 DB 행으로 다시 확인한다 — 30일짜리 토큰이 살아 있는
 * 동안 역할이 바뀌었을 수 있다.
 */
export const impersonate = async (req, res) => {
  try {
    // 대신 로그인한 채로 또 들어가면 원래 관리자가 누구인지 잃어버린다
    if (impersonatedBy(req)) {
      return res.status(403).json({ error: '다른 계정으로 로그인 중에는 또 다른 계정으로 들어갈 수 없습니다.' });
    }

    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) return res.status(400).json({ error: '잘못된 사용자입니다.' });
    if (targetId === req.user.id) return res.status(400).json({ error: '지금 로그인한 계정입니다.' });

    const admin = await currentUserRow(req);
    if (!admin) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (admin.role !== 'admin') return res.status(403).json({ error: '이 기능에 접근할 권한이 없습니다.' });

    const target = await User.getById(targetId);
    if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    const { password: _, ...userWithoutPassword } = target;
    res.json({
      user: userWithoutPassword,
      token: issueImpersonationToken(target, admin),
      role: target.role,
      impersonator: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    console.error('다른 계정으로 로그인 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
