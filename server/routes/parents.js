import express from 'express';
import { getParents, linkChild, unlinkChild, addChildLink, deleteParent } from '../controllers/parentAdminController.js';
import { getInvite, regenerateInvite } from '../controllers/parentInviteController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 초대 링크 (선생님)
router.get('/invite', verifyToken, getInvite);
router.post('/invite/regenerate', verifyToken, logAction('REGENERATE_PARENT_INVITE'), regenerateInvite);

// 학부모 목록·연결
router.get('/', verifyToken, getParents);
router.post('/:userId/children', verifyToken, logAction('LINK_PARENT_CHILD'), addChildLink);
router.put('/children/:childId/link', verifyToken, logAction('LINK_PARENT_CHILD'), linkChild);
router.delete('/children/:childId/link', verifyToken, logAction('UNLINK_PARENT_CHILD'), unlinkChild);
router.delete('/:userId', verifyToken, logAction('DELETE_PARENT'), deleteParent);

export default router;
