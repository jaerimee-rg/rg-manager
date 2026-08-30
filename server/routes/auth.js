import express from 'express';
import { login, signup, getUsers, updateUser, deleteUser, verifyTokenEndpoint, getKakaoAuthUrl, kakaoCallback, transferUserData, updateKakaoMessageConsent, getKakaoMessageLogs, sendKakaoMessage, getKakaoUsers, testKakaoMessage, updateUsername, getRoles, switchRole, addRole, grantAdmin, impersonate } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

router.post('/login', logAction('LOGIN'), login);
router.post('/signup', logAction('SIGNUP'), signup);
router.get('/verify', verifyToken, verifyTokenEndpoint);
router.get('/users', verifyToken, getUsers);
router.put('/users/:id', verifyToken, logAction('UPDATE_USER'), updateUser);
router.delete('/users/:id', verifyToken, logAction('DELETE_USER'), deleteUser);

// 데이터 이전 (관리자 전용)
router.post('/users/transfer', verifyToken, logAction('TRANSFER_DATA'), transferUserData);

// 관리자 계정 부여 (관리자 전용) — 같은 카카오 계정에 관리자 행을 하나 더 만든다
router.post('/users/:id/grant-admin', verifyToken, requireRole('admin'), logAction('GRANT_ADMIN'), grantAdmin);

// 다른 계정으로 로그인 (관리자 전용, FR-388) — 대상 계정의 짧은 토큰을 발급한다
router.post('/users/:id/impersonate', verifyToken, requireRole('admin'), logAction('IMPERSONATE'), impersonate);

/* 역할 조회·전환·생성. 학부모도 써야 하므로 server.js 의 rejectParents 목록에
   넣지 않는다 (docs/accounts-roles 02 §6). */
router.get('/roles', verifyToken, getRoles);
router.post('/roles', verifyToken, logAction('ADD_ROLE'), addRole);
router.post('/switch-role', verifyToken, logAction('SWITCH_ROLE'), switchRole);

// 카카오 로그인
router.get('/kakao', getKakaoAuthUrl);
router.post('/kakao/callback', logAction('KAKAO_LOGIN'), kakaoCallback);
router.put('/kakao/consent', verifyToken, updateKakaoMessageConsent);

// 사용자 이름 설정
router.put('/username', verifyToken, logAction('UPDATE_USERNAME'), updateUsername);

// 카카오 메시지 (관리자 전용)
router.get('/kakao/messages', verifyToken, getKakaoMessageLogs);
router.post('/kakao/messages', verifyToken, logAction('SEND_KAKAO_MESSAGE'), sendKakaoMessage);
router.get('/kakao/users', verifyToken, getKakaoUsers);

// 카카오 메시지 테스트
router.post('/kakao/test', verifyToken, testKakaoMessage);

export default router;
