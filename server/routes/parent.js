import express from 'express';
import { getMe, addChildren, deleteChild, updateName, getEvents, getEvent, registerChild, cancelChild, addTeacher } from '../controllers/parentController.js';
import {
  listAlbums, listAllMedia, listAllPeople,
  listMedia,
  listPeople,
  createUploads,
  completeUpload,
  saveOwnFaces,
  deleteMedia,
  confirmTag,
  listFaces,
  addFace,
  deleteFace
} from '../controllers/parentAlbumController.js';
import { listShops } from '../controllers/parentShopController.js';
import { recordView } from '../controllers/albumViewController.js';
import { verifyToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

// 이 라우터는 학부모 토큰만 통과한다 (선생님·관리자는 403)
router.use(verifyToken, requireRole('parent'));

router.get('/me', getMe);
router.post('/children', addChildren);
// 내 정보 — 내가 등록한 아이 삭제 (선생님 명단의 학생·신청은 남는다)
router.delete('/children/:childId', logAction('DELETE_PARENT_CHILD'), deleteChild);
// 내 정보 — 학부모명 변경 ("예림엄마")
router.put('/name', logAction('UPDATE_PARENT_NAME'), updateName);
// 초대 링크를 붙여넣어 선생님을 추가한다 (학부모가 여러 선생님과 연결될 수 있다)
router.post('/teachers', logAction('ADD_PARENT_TEACHER'), addTeacher);
router.get('/events', getEvents);
router.get('/events/:id', getEvent);
router.put('/events/:id/registrations/:childId', registerChild);
router.delete('/events/:id/registrations/:childId', cancelChild);

// 사진 (앨범). 확정된 이벤트만 열리고, 응답은 화이트리스트를 거친다.
router.get('/albums', listAlbums);
// 전체 사진 — 볼 수 있는 모든 앨범의 사진 · 그 앨범들에 나온 사람마다 얼굴 하나
router.get('/albums/media', listAllMedia);
router.get('/albums/people', listAllPeople);
router.get('/events/:id/media', listMedia);
router.get('/events/:id/people', listPeople);
router.post('/events/:id/media/uploads', createUploads);
router.post('/events/:id/media/:mediaId/complete', completeUpload);
router.post('/events/:id/media/:mediaId/faces', saveOwnFaces);
router.post('/events/:id/media/:mediaId/confirm', confirmTag);
router.delete('/events/:id/media/:mediaId', deleteMedia);
// 본 기록 — 앨범을 열었다 · 사진을 크게 봤다 (볼 수 있는 앨범의 숨기지 않은 사진만)
router.post('/events/:id/views', recordView);

// 추천 상품 탭 — 연결된 선생님의 공개 상점 (상품은 공유 링크 /shop/:publicId 화면이 보여 준다)
router.get('/shops', listShops);

// 자녀 기준 얼굴 (등록하면 우리 아이 사진을 자동으로 모아 준다)
router.get('/children/:childId/faces', listFaces);
router.post('/children/:childId/faces', addFace);
router.delete('/children/:childId/faces/:profileId', deleteFace);

export default router;
