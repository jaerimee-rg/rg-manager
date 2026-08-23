import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/ParentAccount.js', () => ({
  default: { listAll: jest.fn(), listByTeacher: jest.fn(), getByUserId: jest.fn(), delete: jest.fn() }
}));

jest.unstable_mockModule('../../models/ParentChild.js', () => ({
  default: { getWithOwner: jest.fn(), link: jest.fn(), unlink: jest.fn(), create: jest.fn(), hasStudent: jest.fn() }
}));

jest.unstable_mockModule('../../models/Student.js', () => ({
  default: { getById: jest.fn() }
}));

const ParentAccount = (await import('../../models/ParentAccount.js')).default;
const ParentChild = (await import('../../models/ParentChild.js')).default;
const Student = (await import('../../models/Student.js')).default;
const { getParents, linkChild, unlinkChild, addChildLink, deleteParent } =
  await import('../parentAdminController.js');

describe('parentAdminController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, params: {}, query: {}, user: { id: 7, role: 'user' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    ParentChild.hasStudent.mockResolvedValue(false);
  });

  describe('목록', () => {
    it('선생님은 본인 학부모만 본다', async () => {
      ParentAccount.listByTeacher.mockResolvedValue([]);

      await getParents(req, res);

      expect(ParentAccount.listByTeacher).toHaveBeenCalledWith(7);
      expect(ParentAccount.listAll).not.toHaveBeenCalled();
    });

    it('선생님이 filterUserId 를 넣어도 본인 것만 본다', async () => {
      req.query.filterUserId = '3';
      ParentAccount.listByTeacher.mockResolvedValue([]);

      await getParents(req, res);

      expect(ParentAccount.listByTeacher).toHaveBeenCalledWith(7);
    });

    it('관리자는 전체 또는 선생님별로 본다', async () => {
      req.user.role = 'admin';
      ParentAccount.listAll.mockResolvedValue([]);
      await getParents(req, res);
      expect(ParentAccount.listAll).toHaveBeenCalled();

      req.query.filterUserId = '3';
      ParentAccount.listByTeacher.mockResolvedValue([]);
      await getParents(req, res);
      expect(ParentAccount.listByTeacher).toHaveBeenCalledWith(3);
    });

    it('요약에 확인 대기·연결된 학생 수를 담는다', async () => {
      ParentAccount.listByTeacher.mockResolvedValue([
        { userId: 1, children: [{ status: 'linked', studentId: 10 }, { status: 'pending', studentId: null }] },
        { userId: 2, children: [{ status: 'linked', studentId: 10 }] } // 같은 학생에 두 학부모
      ]);

      await getParents(req, res);

      expect(res.json.mock.calls[0][0].summary).toEqual({
        parentCount: 2, pendingChildren: 1, linkedStudents: 1
      });
    });
  });

  describe('연결', () => {
    const child = { id: 5, parentUserId: 20, teacherId: 7 };

    it('본인 학부모의 자녀를 본인 학생과 연결한다', async () => {
      ParentChild.getWithOwner.mockResolvedValue(child);
      Student.getById.mockResolvedValue({ id: 10, name: '김민서' });
      ParentChild.link.mockResolvedValue({ id: 5, status: 'linked' });
      req.params.childId = '5';
      req.body.studentId = 10;

      await linkChild(req, res);

      expect(Student.getById).toHaveBeenCalledWith(10, 7, 'user');
      expect(ParentChild.link).toHaveBeenCalledWith(5, 10, 'teacher');
    });

    it('다른 선생님의 학부모는 404', async () => {
      ParentChild.getWithOwner.mockResolvedValue({ ...child, teacherId: 99 });
      req.params.childId = '5';
      req.body.studentId = 10;

      await linkChild(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ParentChild.link).not.toHaveBeenCalled();
    });

    it('내 학생이 아니면 404', async () => {
      ParentChild.getWithOwner.mockResolvedValue(child);
      Student.getById.mockResolvedValue(null);
      req.params.childId = '5';
      req.body.studentId = 10;

      await linkChild(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('이미 연결된 학생은 400', async () => {
      ParentChild.getWithOwner.mockResolvedValue(child);
      Student.getById.mockResolvedValue({ id: 10 });
      ParentChild.hasStudent.mockResolvedValue(true);
      req.params.childId = '5';
      req.body.studentId = 10;

      await linkChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('학생을 고르지 않으면 400', async () => {
      req.params.childId = '5';
      req.body = {};

      await linkChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('관리자는 다른 선생님의 학부모도 연결할 수 있다', async () => {
      req.user.role = 'admin';
      ParentChild.getWithOwner.mockResolvedValue({ ...child, teacherId: 99 });
      Student.getById.mockResolvedValue({ id: 10 });
      ParentChild.link.mockResolvedValue({});
      req.params.childId = '5';
      req.body.studentId = 10;

      await linkChild(req, res);

      // 학생 소유권은 그 학부모의 선생님 기준으로 본다
      expect(Student.getById).toHaveBeenCalledWith(10, 99, 'user');
      expect(ParentChild.link).toHaveBeenCalledWith(5, 10, 'admin');
    });

    it('연결 해제는 확인 대기로 돌린다', async () => {
      ParentChild.getWithOwner.mockResolvedValue(child);
      ParentChild.unlink.mockResolvedValue({ id: 5, status: 'pending' });
      req.params.childId = '5';

      await unlinkChild(req, res);

      expect(ParentChild.unlink).toHaveBeenCalledWith(5);
    });
  });

  describe('학생 연결 직접 추가', () => {
    it('학생 정보로 자녀 행을 만들어 연결한다', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, teacherId: 7 });
      Student.getById.mockResolvedValue({ id: 10, name: '한소율', birthdate: '2019-09-02' });
      ParentChild.create.mockResolvedValue({ id: 9 });
      req.params.userId = '20';
      req.body.studentId = 10;

      await addChildLink(req, res);

      expect(ParentChild.create).toHaveBeenCalledWith(expect.objectContaining({
        parentUserId: 20, childName: '한소율', childBirthdate: '2019-09-02', studentId: 10, linkedBy: 'teacher'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('다른 선생님의 학부모는 404', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, teacherId: 99 });
      req.params.userId = '20';
      req.body.studentId = 10;

      await addChildLink(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('삭제', () => {
    it('본인 학부모만 지운다', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, teacherId: 7 });
      req.params.userId = '20';

      await deleteParent(req, res);

      expect(ParentAccount.delete).toHaveBeenCalledWith(20);
    });

    it('남의 학부모는 404', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, teacherId: 99 });
      req.params.userId = '20';

      await deleteParent(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(ParentAccount.delete).not.toHaveBeenCalled();
    });
  });
});
