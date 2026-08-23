import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';
import {
  getAccount,
  startConnect,
  handleCallback,
  updateAccount,
  disconnect
} from '../controllers/driveController.js';

const router = express.Router();

// Google 이 브라우저를 이 주소로 되돌려 보낸다. Authorization 헤더가 없으므로
// verifyToken 을 걸 수 없고, 대신 state 안의 서명된 사용자 id 를 검증한다.
router.get('/callback', handleCallback);

router.get('/account', verifyToken, getAccount);
router.get('/connect', verifyToken, startConnect);
router.patch('/account', verifyToken, logAction('UPDATE_DRIVE_ACCOUNT'), updateAccount);
router.delete('/account', verifyToken, logAction('DISCONNECT_DRIVE'), disconnect);

export default router;
