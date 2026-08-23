import express from 'express';
import { getAiSetting, updateAiSetting } from '../controllers/settingsController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 관리자 전용 (컨트롤러에서 role 확인)
router.get('/ai', verifyToken, getAiSetting);
router.put('/ai', verifyToken, logAction('UPDATE_AI_PROVIDER'), updateAiSetting);

export default router;
