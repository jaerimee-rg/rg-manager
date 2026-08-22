import express from 'express';
import {
  getNotificationSettings,
  updateNotificationSetting,
  getNotificationLogs
} from '../controllers/notificationController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 관리자 전용 (컨트롤러에서 role 확인)
router.get('/settings', verifyToken, getNotificationSettings);
router.put(
  '/settings/:eventType',
  verifyToken,
  logAction('UPDATE_NOTIFICATION_SETTING'),
  updateNotificationSetting
);
router.get('/logs', verifyToken, getNotificationLogs);

export default router;
