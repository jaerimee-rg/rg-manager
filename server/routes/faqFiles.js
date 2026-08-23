import express from 'express';
import {
  listFaqFiles,
  uploadFaqFile,
  deleteFaqFile,
  viewFaqFile
} from '../controllers/faqFileController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';
import { MAX_FILE_BYTES } from '../utils/faqFileTypes.js';

const router = express.Router();

// 파일 바이트를 그대로 받는다. 형식 검사는 컨트롤러가 확장자로 한다.
// 여기 한도는 마지막 방어선이고, 사용자에게 보여줄 메시지는 컨트롤러가 만든다.
const rawBody = express.raw({ type: () => true, limit: MAX_FILE_BYTES + 1024 });

// 학부모는 로그인하지 않으므로 열람은 인증 없이 열어둔다.
router.get('/:id/view', viewFaqFile);

router.get('/', verifyToken, listFaqFiles);
router.post('/', verifyToken, rawBody, logAction('UPLOAD_FAQ_FILE'), uploadFaqFile);
router.delete('/:id', verifyToken, logAction('DELETE_FAQ_FILE'), deleteFaqFile);

export default router;
