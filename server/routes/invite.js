import express from 'express';
import { checkInvite } from '../controllers/parentInviteController.js';

const router = express.Router();

// 학부모가 링크를 열었을 때 (비로그인 공개)
router.get('/:token', checkInvite);

export default router;
