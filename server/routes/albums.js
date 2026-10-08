import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { listAlbums, createPhotoFolder } from '../controllers/albumListController.js';

// 선생님 사진 메뉴 (docs/photo-menu). 앨범 하나하나는 /api/events/:id/album · /media 가 맡는다.
const router = express.Router();

router.get('/', verifyToken, listAlbums);
router.post('/', verifyToken, createPhotoFolder);

export default router;
