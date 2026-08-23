import express from 'express';
import { getMe, addChildren, getEvents, getEvent, registerChild, cancelChild } from '../controllers/parentController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = express.Router();

// 이 라우터는 학부모 토큰만 통과한다 (선생님·관리자는 403)
router.use(verifyToken, requireRole('parent'));

router.get('/me', getMe);
router.post('/children', addChildren);
router.get('/events', getEvents);
router.get('/events/:id', getEvent);
router.put('/events/:id/registrations/:childId', registerChild);
router.delete('/events/:id/registrations/:childId', cancelChild);

export default router;
