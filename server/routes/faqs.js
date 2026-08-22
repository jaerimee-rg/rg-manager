import express from 'express';
import {
  getFaqs,
  getFaq,
  createFaq,
  updateFaq,
  deleteFaq
} from '../controllers/faqController.js';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/logger.js';

const router = express.Router();

router.get('/', verifyToken, getFaqs);
router.get('/:id', verifyToken, getFaq);
router.post('/', verifyToken, logAction('CREATE_FAQ'), createFaq);
router.put('/:id', verifyToken, logAction('UPDATE_FAQ'), updateFaq);
router.delete('/:id', verifyToken, logAction('DELETE_FAQ'), deleteFaq);

export default router;
