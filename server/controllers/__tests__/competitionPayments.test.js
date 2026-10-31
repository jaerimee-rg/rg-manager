import { jest } from '@jest/globals';

const getById = jest.fn();
const updateStudentPaid = jest.fn();

jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const Competition = (await import('../../models/Competition.js')).default;
Competition.getById = getById;
Competition.updateStudentPaid = updateStudentPaid;

const controller = await import('../competitionController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const put = async (body, user = { id: 7, role: 'user' }) => {
  const res = mockRes();
  await controller.updateStudentPaid({ params: { id: '3', studentId: '9' }, user, body }, res);
  return res;
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  getById.mockReset().mockResolvedValue({ id: 3, userId: 7 });
  updateStudentPaid.mockReset().mockResolvedValue({ id: 1 });
});

afterEach(() => jest.restoreAllMocks());

describe('PUT /api/competitions/:id/students/:studentId/paid', () => {
  it('누른 칸만 저장한다', async () => {
    const res = await put({ costumeFeePaid: true });

    expect(updateStudentPaid).toHaveBeenCalledWith('3', '9', { costumeFeePaid: true });
    expect(res.json).toHaveBeenCalledWith({ message: '납부 상태가 업데이트되었습니다.' });
  });

  it('다른 선생님의 대회는 404 이고 저장하지 않는다', async () => {
    getById.mockResolvedValue(null);

    const res = await put({ paid: true });

    expect(getById).toHaveBeenCalledWith('3', 7, 'user');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(updateStudentPaid).not.toHaveBeenCalled();
  });

  it('바꿀 칸이 없으면 400 이다', async () => {
    const res = await put({ paid: 'yes', name: 'x' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateStudentPaid).not.toHaveBeenCalled();
  });

  it('참가 학생이 아니면 404 이다', async () => {
    updateStudentPaid.mockResolvedValue(null);

    const res = await put({ paid: true });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: '등록 정보를 찾을 수 없습니다.' });
  });

  it('저장이 실패하면 500 이다', async () => {
    updateStudentPaid.mockRejectedValue(new Error('db down'));

    const res = await put({ paid: true });

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
