import express from 'express';
import { getMe, addChildren, getEvents, getEvent, registerChild, cancelChild } from '../controllers/parentController.js';
import {
  listAlbums,
  listMedia,
  createUploads,
  completeUpload,
  deleteMedia,
  confirmTag,
  listFaces,
  addFace,
  deleteFace
} from '../controllers/parentAlbumController.js';
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

// 사진 (앨범). 확정된 이벤트만 열리고, 응답은 화이트리스트를 거친다.
router.get('/albums', listAlbums);
router.get('/events/:id/media', listMedia);
router.post('/events/:id/media/uploads', createUploads);
router.post('/events/:id/media/:mediaId/complete', completeUpload);
router.post('/events/:id/media/:mediaId/confirm', confirmTag);
router.delete('/events/:id/media/:mediaId', deleteMedia);

// 자녀 기준 얼굴 (등록하면 우리 아이 사진을 자동으로 모아 준다)
router.get('/children/:childId/faces', listFaces);
router.post('/children/:childId/faces', addFace);
router.delete('/children/:childId/faces/:profileId', deleteFace);

export default router;
