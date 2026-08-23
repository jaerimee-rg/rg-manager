import User from '../models/User.js';
import ParentInvite from '../models/ParentInvite.js';
import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import jwt from 'jsonwebtoken';
import { KAKAO_REDIRECT_URI } from '../utils/appUrl.js';

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

    // 선생님을 지우면 그 선생님에게 속한 학부모 계정도 함께 지운다.
    // (parent_accounts 만 CASCADE 로 사라지면 소속 없는 학부모 계정이 남는다)
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
    res.json({ user: userWithoutPassword });
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
  // talk_message scope 추가 (카카오톡 메시지 전송 권한)
  const scope = 'talk_message';
  let kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code&scope=${scope}`;

  // 학부모 초대 링크에서 온 경우, 어느 선생님의 초대인지 state 로 실어 보낸다.
  // (카카오가 콜백에 그대로 돌려주므로 별도 세션 저장이 필요 없다)
  const invite = String(req.query.invite || '').trim();
  if (invite) {
    kakaoAuthUrl += `&state=${encodeURIComponent(invite)}`;
  }

  res.json({ url: kakaoAuthUrl });
};

/**
 * 학부모 이름은 카카오 닉네임을 쓴다. username 은 UNIQUE 라 겹치면 뒤에 숫자를 붙인다.
 */
const uniqueParentUsername = async (nickname) => {
  const base = String(nickname || '학부모').trim().slice(0, USERNAME_MAX) || '학부모';

  if (!(await User.getByUsername(base))) return base;

  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}_${i}`;
    if (!(await User.getByUsername(candidate))) return candidate;
  }

  return `${base}_${Date.now()}`;
};

/** 학부모가 온보딩(아이 등록)을 아직 안 했는지 */
const needsOnboarding = async (user) => {
  if (user.role !== 'parent') return false;
  const children = await ParentChild.listByParent(user.id);
  return children.length === 0;
};

// 카카오 콜백 처리
export const kakaoCallback = async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ error: '인증 코드가 없습니다.' });
    }

    // state 에 초대 토큰이 실려 있으면 학부모 가입 흐름이다.
    // 토큰이 유효하지 않으면 여기서 끊는다 (아무나 학부모로 가입하지 못하도록).
    const inviteToken = String(state || '').trim();
    let invite = null;

    if (inviteToken) {
      invite = await ParentInvite.getByToken(inviteToken);
      if (!ParentInvite.isUsable(invite)) {
        return res.status(400).json({ error: '유효하지 않은 초대 링크입니다. 선생님께 새 링크를 요청해 주세요.' });
      }
    }

    // 1. 인증 코드로 액세스 토큰 발급
    const tokenParams = {
      grant_type: 'authorization_code',
      client_id: KAKAO_CLIENT_ID,
      redirect_uri: KAKAO_REDIRECT_URI,
      code,
    };

    // Client Secret이 설정된 경우 추가
    if (KAKAO_CLIENT_SECRET) {
      tokenParams.client_secret = KAKAO_CLIENT_SECRET;
    }

    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams(tokenParams),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('카카오 토큰 발급 실패:', tokenData);
      return res.status(400).json({ error: '카카오 인증에 실패했습니다.' });
    }

    // 토큰 정보 추출
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // 초 단위
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 2. 액세스 토큰으로 사용자 정보 가져오기
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    const kakaoUser = await userResponse.json();

    if (!kakaoUser.id) {
      return res.status(400).json({ error: '카카오 사용자 정보를 가져올 수 없습니다.' });
    }

    const kakaoId = kakaoUser.id.toString();
    const nickname = kakaoUser.properties?.nickname || `카카오${kakaoId.slice(-4)}`;
    const email = kakaoUser.kakao_account?.email || null;

    // 3. 기존 사용자 확인 또는 새 사용자 생성
    let user = await User.getByKakaoId(kakaoId);
    let isNewUser = false;

    if (invite) {
      // ── 학부모 초대 흐름 ──
      if (user && user.role !== 'parent') {
        return res.status(409).json({
          error: '이미 선생님 계정으로 사용 중인 카카오 계정입니다. 다른 카카오 계정으로 가입해 주세요.'
        });
      }

      if (!user) {
        user = await User.createWithKakao({
          kakaoId,
          username: await uniqueParentUsername(nickname),
          email,
          role: 'parent',
          // 학부모에게는 알림을 보내지 않으므로 메시지 토큰을 저장하지 않는다.
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        });
        isNewUser = true;
      }

      await ParentAccount.create({
        userId: user.id,
        teacherId: invite.userId,
        inviteId: invite.id,
      });
    } else if (!user) {
      // 새 사용자 생성 (토큰 포함) - 임시 이름으로 생성
      const tempUsername = `카카오_${Date.now()}`;
      user = await User.createWithKakao({
        kakaoId,
        username: tempUsername,
        email,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      });
      isNewUser = true;
    } else if (user.role === 'parent') {
      // 이미 가입한 학부모가 로그인 페이지의 카카오 버튼으로 들어온 경우.
      // 학부모에게는 메시지 토큰이 필요 없으므로 마지막 로그인만 갱신한다.
      await ParentAccount.touchLogin(user.id);
    } else {
      // 기존 사용자 토큰 및 이메일 업데이트
      const updatedUser = await User.updateKakaoTokens(user.id, {
        email,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      });
      if (updatedUser) {
        user = updatedUser;
      }
    }

    // 4. JWT 토큰 생성
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // 비밀번호 제외하고 반환
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: '카카오 로그인 성공',
      user: userWithoutPassword,
      token,
      isNewUser,  // 신규 사용자 여부 반환
      role: user.role,
      // 학부모가 아직 아이를 등록하지 않았으면 온보딩 화면으로 보낸다
      needsOnboarding: await needsOnboarding(user),
    });
  } catch (error) {
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
