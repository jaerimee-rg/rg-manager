import express from 'express';
import { getLogs, getLlmLogs, getLlmLogDetail } from '../controllers/logController.js';
import { verifyToken } from '../middleware/auth.js';
import { listPhotoViewLog } from '../controllers/albumViewController.js';

const router = express.Router();

router.get('/', verifyToken, getLogs);

// AI 호출 이력 (관리자 전용 — 컨트롤러에서 role 확인)
router.get('/llm', verifyToken, getLlmLogs);
router.get('/llm/:id', verifyToken, getLlmLogDetail);

// 학부모 사진 보기 이력 (관리자 전용 — 컨트롤러에서 role 확인)
router.get('/photo-views', verifyToken, listPhotoViewLog);

export default router;
