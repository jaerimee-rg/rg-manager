import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';
import { listAlbums, createPhotoFolder, updatePhotoFolder, deletePhotoFolder } from '../controllers/albumListController.js';

// 선생님 사진 메뉴 (docs/photo-menu). 앨범 하나하나는 /api/events/:id/album · /media 가 맡는다.
const router = express.Router();

router.get('/', verifyToken, listAlbums);
router.post('/', verifyToken, createPhotoFolder);
// 이름·날짜는 사진 전용 폴더(type='folder')만 — 이벤트 앨범은 이벤트 관리가 맡는다. 삭제는 이벤트 앨범도 받는다(이벤트는 남는다) (FR-519)
router.patch('/:id', verifyToken, logAction('UPDATE_PHOTO_FOLDER'), updatePhotoFolder);
router.delete('/:id', verifyToken, logAction('DELETE_PHOTO_FOLDER'), deletePhotoFolder);

export default router;
