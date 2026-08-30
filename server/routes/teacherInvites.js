import express from 'express';
import { listInvites, createInvite, revokeInvite, checkInvite } from '../controllers/teacherInviteController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { logAction } from '../middleware/logger.js';

/** 관리자 전용 — 선생님 초대 발급·조회·회수 */
export const adminRouter = express.Router();

adminRouter.use(verifyToken, requireRole('admin'));

adminRouter.get('/', listInvites);
adminRouter.post('/', logAction('CREATE_TEACHER_INVITE'), createInvite);
adminRouter.post('/:id/revoke', logAction('REVOKE_TEACHER_INVITE'), revokeInvite);

/** 공개 — 초대 링크를 연 사람이 유효한지 확인만 한다 */
export const publicRouter = express.Router();

publicRouter.get('/:token', checkInvite);

export default adminRouter;
