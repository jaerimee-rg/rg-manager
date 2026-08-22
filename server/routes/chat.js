import express from 'express';
import {
  getChannel,
  updateChannel,
  getPublicChannel,
  startSession,
  getPublicMessages,
  postMessage,
  getSessions,
  getSessionMessages,
  replyToSession,
  deleteSession
} from '../controllers/chatController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 공개 (인증 불필요) — 학부모용
router.get('/public/:publicId', getPublicChannel);
router.post('/public/:publicId/session', startSession);
router.get('/public/:publicId/messages', getPublicMessages);
router.post('/public/:publicId/messages', postMessage);

// 관리자 (인증 필요)
router.get('/channel', verifyToken, getChannel);
router.put('/channel', verifyToken, logAction('UPDATE_CHAT_CHANNEL'), updateChannel);
router.get('/sessions', verifyToken, getSessions);
router.get('/sessions/:id/messages', verifyToken, getSessionMessages);
router.post('/sessions/:id/reply', verifyToken, logAction('REPLY_CHAT_SESSION'), replyToSession);
router.delete('/sessions/:id', verifyToken, logAction('DELETE_CHAT_SESSION'), deleteSession);

export default router;
