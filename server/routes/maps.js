import express from 'express';
import { getMapConfig } from '../controllers/mapController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// 선생님(이벤트 폼)과 학부모(일정 상세) 모두 쓴다 — 역할 가드 없이 로그인만 확인한다.
router.get('/config', verifyToken, getMapConfig);

export default router;
