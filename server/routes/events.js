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
import {
  getAlbum,
  createAlbum,
  updateAlbum,
  refreshAlbum,
  listMedia,
  createUploads,
  completeUpload,
  bulkAction,
  addTag,
  removeTag,
  listUnanalyzed,
  saveFaces,
  rematch,
  deleteMedia
} from '../controllers/albumController.js';
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

// 앨범 (사진·영상). 리터럴 경로를 :mediaId 보다 먼저 둔다.
router.get('/:id/album', verifyToken, getAlbum);
router.post('/:id/album', verifyToken, logAction('CREATE_ALBUM'), createAlbum);
router.patch('/:id/album', verifyToken, logAction('UPDATE_ALBUM'), updateAlbum);
router.post('/:id/album/refresh', verifyToken, refreshAlbum);

router.get('/:id/media', verifyToken, listMedia);
router.get('/:id/media/unanalyzed', verifyToken, listUnanalyzed);
router.post('/:id/media/uploads', verifyToken, createUploads);
router.post('/:id/media/bulk', verifyToken, logAction('UPDATE_ALBUM_MEDIA'), bulkAction);
router.post('/:id/media/rematch', verifyToken, rematch);
router.post('/:id/media/:mediaId/complete', verifyToken, logAction('UPLOAD_ALBUM_MEDIA'), completeUpload);
router.post('/:id/media/:mediaId/faces', verifyToken, saveFaces);
router.post('/:id/media/:mediaId/tags', verifyToken, logAction('TAG_ALBUM_MEDIA'), addTag);
router.delete('/:id/media/:mediaId/tags/:studentId', verifyToken, logAction('UNTAG_ALBUM_MEDIA'), removeTag);
router.delete('/:id/media/:mediaId', verifyToken, logAction('DELETE_ALBUM_MEDIA'), deleteMedia);

export default router;
