import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';
import { listAlbums, createPhotoFolder, updatePhotoFolder, deletePhotoFolder } from '../controllers/albumListController.js';
import {
  listAllMedia, listAllPeople, deleteAllPerson, deleteAllPeople, excludeAllPersonPhotos, restoreAllPersonPhotos
} from '../controllers/albumController.js';

// 선생님 사진 메뉴 (docs/photo-menu). 앨범 하나하나는 /api/events/:id/album · /media 가 맡는다.
const router = express.Router();

router.get('/', verifyToken, listAlbums);
router.post('/', verifyToken, createPhotoFolder);
// 전체 사진 — 모든 폴더의 사진을 한 목록으로, 모든 폴더에 나온 사람마다 얼굴 하나
router.get('/media', verifyToken, listAllMedia);
router.get('/people', verifyToken, listAllPeople);
// 관계없는 사람을 얼굴 목록에서 뺀다(길게 눌러 X) — 모든 폴더에서 그 사람의 얼굴만, 사진은 그대로
router.delete('/people/:key', verifyToken, logAction('REMOVE_ALBUM_PERSON'), deleteAllPerson);
// 여러 사람을 한 번에([얼굴 빼기]) — 하나라도 안 되면 아무것도 지우지 않는다
router.post('/people/remove', verifyToken, logAction('REMOVE_ALBUM_PEOPLE'), deleteAllPeople);
router.post('/people/:key/exclude', verifyToken, logAction('EXCLUDE_PERSON_PHOTOS'), excludeAllPersonPhotos);
router.post('/people/:key/restore', verifyToken, logAction('RESTORE_PERSON_PHOTOS'), restoreAllPersonPhotos);
// 이름·날짜는 사진 전용 폴더(type='folder')만 — 이벤트 앨범은 이벤트 관리가 맡는다. 삭제는 이벤트 앨범도 받는다(이벤트는 남는다) (FR-519)
router.patch('/:id', verifyToken, logAction('UPDATE_PHOTO_FOLDER'), updatePhotoFolder);
router.delete('/:id', verifyToken, logAction('DELETE_PHOTO_FOLDER'), deletePhotoFolder);

export default router;
