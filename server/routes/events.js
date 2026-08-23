import express from 'express';
import {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getRegistrations,
  confirmRegistration,
  confirmAllRegistrations,
  registerStudent,
  cancelStudentRegistration
} from '../controllers/eventController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 이벤트 CRUD
router.get('/', verifyToken, getEvents);
router.get('/:id', verifyToken, getEvent);
router.post('/', verifyToken, logAction('CREATE_EVENT'), createEvent);
router.put('/:id', verifyToken, logAction('UPDATE_EVENT'), updateEvent);
router.delete('/:id', verifyToken, logAction('DELETE_EVENT'), deleteEvent);

// 신청 현황
router.get('/:id/registrations', verifyToken, getRegistrations);
router.post('/:id/registrations/confirm-all', verifyToken, logAction('CONFIRM_EVENT_REGISTRATIONS'), confirmAllRegistrations);
router.put('/:id/registrations/:regId/confirm', verifyToken, logAction('CONFIRM_EVENT_REGISTRATION'), confirmRegistration);

// 선생님 대리 신청·취소
router.put('/:id/registrations/student/:studentId', verifyToken, logAction('TEACHER_EVENT_REGISTER'), registerStudent);
router.delete('/:id/registrations/student/:studentId', verifyToken, logAction('TEACHER_EVENT_CANCEL'), cancelStudentRegistration);

export default router;
