import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/Faq.js', () => ({
  default: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));

const Faq = (await import('../../models/Faq.js')).default;
const { getFaqs, createFaq, updateFaq, deleteFaq, validateFaq } = await import('../faqController.js');

describe('faqController', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, user: { id: 1, role: 'user' }, params: {}, query: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.clearAllMocks();
  });

  describe('validateFaq', () => {
    it('질문이 비어 있으면 에러 메시지를 반환한다', () => {
      expect(validateFaq({ question: '  ', answer: '답변' })).toBe('질문을 입력해주세요.');
    });

    it('답변이 비어 있으면 에러 메시지를 반환한다', () => {
      expect(validateFaq({ question: '질문', answer: '' })).toBe('답변을 입력해주세요.');
    });

    it('질문이 200자를 넘으면 에러 메시지를 반환한다', () => {
      expect(validateFaq({ question: 'ㄱ'.repeat(201), answer: '답변' })).toContain('200자');
    });

    it('답변이 2000자를 넘으면 에러 메시지를 반환한다', () => {
      expect(validateFaq({ question: '질문', answer: 'ㄱ'.repeat(2001) })).toContain('2000자');
    });

    it('정상 입력이면 null 을 반환한다', () => {
      expect(validateFaq({ question: '질문', answer: '답변' })).toBeNull();
    });
  });

  describe('getFaqs', () => {
    it('일반 사용자는 본인 FAQ만 조회한다', async () => {
      Faq.getAll.mockResolvedValue([{ id: 1 }]);
      req.query = { filterUserId: '99' }; // 일반 사용자는 무시되어야 한다

      await getFaqs(req, res);

      expect(Faq.getAll).toHaveBeenCalledWith(1, 'user', { q: undefined });
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });

    it('관리자는 filterUserId 로 다른 사용자 FAQ를 조회할 수 있다', async () => {
      Faq.getAll.mockResolvedValue([]);
      req.user = { id: 1, role: 'admin' };
      req.query = { filterUserId: '3' };

      await getFaqs(req, res);

      expect(Faq.getAll).toHaveBeenCalledWith(1, 'admin', { q: undefined, filterUserId: 3 });
    });

    it('잘못된 filterUserId 는 400 을 반환한다', async () => {
      req.user = { id: 1, role: 'admin' };
      req.query = { filterUserId: 'abc' };

      await getFaqs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Faq.getAll).not.toHaveBeenCalled();
    });
  });

  describe('createFaq', () => {
    it('검증 실패 시 400 을 반환하고 저장하지 않는다', async () => {
      req.body = { question: '', answer: '답변' };

      await createFaq(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Faq.create).not.toHaveBeenCalled();
    });

    it('정상 입력이면 201 과 생성된 FAQ 를 반환한다', async () => {
      const created = { id: 5, question: '질문', answer: '답변' };
      Faq.create.mockResolvedValue(created);
      req.body = { question: '  질문  ', answer: '  답변  ', isPublished: true };

      await createFaq(req, res);

      expect(Faq.create).toHaveBeenCalledWith(
        { question: '질문', answer: '답변', isPublished: true },
        1
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('updateFaq', () => {
    it('다른 사용자의 FAQ 는 404 를 반환한다', async () => {
      Faq.update.mockResolvedValue(null);
      req.params = { id: '7' };
      req.body = { question: '질문', answer: '답변' };

      await updateFaq(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteFaq', () => {
    it('삭제 대상이 없으면 404 를 반환한다', async () => {
      Faq.delete.mockResolvedValue(false);
      req.params = { id: '7' };

      await deleteFaq(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('삭제되면 완료 메시지를 반환한다', async () => {
      Faq.delete.mockResolvedValue(true);
      req.params = { id: '7' };

      await deleteFaq(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'FAQ가 삭제되었습니다.' });
    });
  });
});
