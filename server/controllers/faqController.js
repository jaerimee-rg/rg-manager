import Faq from '../models/Faq.js';

export const QUESTION_MAX = 200;
export const ANSWER_MAX = 2000;

// 입력 검증. 문제가 없으면 null, 있으면 에러 메시지를 반환한다.
export const validateFaq = ({ question, answer }) => {
  if (!question || !question.trim()) return '질문을 입력해주세요.';
  if (question.trim().length > QUESTION_MAX) return `질문은 ${QUESTION_MAX}자 이내로 입력해주세요.`;
  if (!answer || !answer.trim()) return '답변을 입력해주세요.';
  if (answer.trim().length > ANSWER_MAX) return `답변은 ${ANSWER_MAX}자 이내로 입력해주세요.`;
  return null;
};

export const getFaqs = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { q, filterUserId } = req.query;

    const options = { q };
    if (role === 'admin' && filterUserId && filterUserId !== 'all') {
      const targetUserId = parseInt(filterUserId, 10);
      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      }
      options.filterUserId = targetUserId;
    }

    const faqs = await Faq.getAll(userId, role, options);
    res.json(faqs);
  } catch (error) {
    console.error('FAQ 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getFaq = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const faq = await Faq.getById(req.params.id, userId, role);

    if (!faq) {
      return res.status(404).json({ error: 'FAQ를 찾을 수 없습니다.' });
    }

    res.json(faq);
  } catch (error) {
    console.error('FAQ 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const createFaq = async (req, res) => {
  try {
    const error = validateFaq(req.body);
    if (error) return res.status(400).json({ error });

    const faq = await Faq.create(
      {
        question: req.body.question.trim(),
        answer: req.body.answer.trim(),
        isPublished: req.body.isPublished
      },
      req.user.id
    );

    res.status(201).json(faq);
  } catch (error) {
    console.error('FAQ 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const updateFaq = async (req, res) => {
  try {
    const error = validateFaq(req.body);
    if (error) return res.status(400).json({ error });

    const { id: userId, role } = req.user;
    const faq = await Faq.update(
      req.params.id,
      {
        question: req.body.question.trim(),
        answer: req.body.answer.trim(),
        isPublished: req.body.isPublished
      },
      userId,
      role
    );

    if (!faq) {
      return res.status(404).json({ error: 'FAQ를 찾을 수 없습니다.' });
    }

    res.json(faq);
  } catch (error) {
    console.error('FAQ 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteFaq = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const deleted = await Faq.delete(req.params.id, userId, role);

    if (!deleted) {
      return res.status(404).json({ error: 'FAQ를 찾을 수 없습니다.' });
    }

    res.json({ message: 'FAQ가 삭제되었습니다.' });
  } catch (error) {
    console.error('FAQ 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
