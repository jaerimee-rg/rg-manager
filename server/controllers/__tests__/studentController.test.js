import { jest } from '@jest/globals';

// 네이티브 ESM 에서는 jest.mock 이 동작하지 않아 unstable_mockModule 을 쓴다.
jest.unstable_mockModule('../../models/Student.js', () => ({
  default: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getByClassId: jest.fn()
  }
}));

const Student = (await import('../../models/Student.js')).default;
const studentController = await import('../studentController.js');

describe('studentController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      user: {},
      params: {},
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getStudents', () => {
    it('should return all students for admin without filter', async () => {
      const mockStudents = [
        { id: 1, name: '학생1', birthdate: '2010-01-01' },
        { id: 2, name: '학생2', birthdate: '2011-02-02' },
      ];

      req.user = { id: 1, role: 'admin' };
      Student.getAll.mockResolvedValue(mockStudents);

      await studentController.getStudents(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(1, 'admin');
      expect(res.json).toHaveBeenCalledWith(mockStudents);
    });

    it('should return filtered students for admin with filterUserId', async () => {
      const mockStudents = [{ id: 1, name: '학생1', birthdate: '2010-01-01' }];

      req.user = { id: 1, role: 'admin' };
      req.query = { filterUserId: '2' };
      Student.getAll.mockResolvedValue(mockStudents);

      await studentController.getStudents(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(2, 'user');
      expect(res.json).toHaveBeenCalledWith(mockStudents);
    });

    it('should return all students for admin when filterUserId is "all"', async () => {
      const mockStudents = [
        { id: 1, name: '학생1', birthdate: '2010-01-01' },
        { id: 2, name: '학생2', birthdate: '2011-02-02' },
      ];

      req.user = { id: 1, role: 'admin' };
      req.query = { filterUserId: 'all' };
      Student.getAll.mockResolvedValue(mockStudents);

      await studentController.getStudents(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(1, 'admin');
      expect(res.json).toHaveBeenCalledWith(mockStudents);
    });

    it('should return 400 for invalid filterUserId', async () => {
      req.user = { id: 1, role: 'admin' };
      req.query = { filterUserId: 'invalid' };

      await studentController.getStudents(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '잘못된 사용자 ID입니다.' });
    });

    it('should return only user\'s students for non-admin', async () => {
      const mockStudents = [{ id: 1, name: '학생1', birthdate: '2010-01-01' }];

      req.user = { id: 2, role: 'user' };
      Student.getAll.mockResolvedValue(mockStudents);

      await studentController.getStudents(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(2, 'user');
      expect(res.json).toHaveBeenCalledWith(mockStudents);
    });

    it('should handle database errors', async () => {
      req.user = { id: 1, role: 'user' };
      Student.getAll.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await studentController.getStudents(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: '학생 목록 조회 중 오류가 발생했습니다.',
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('createStudent', () => {
    it('should create student with valid data', async () => {
      const newStudent = {
        id: 1,
        name: '새학생',
        birthdate: '2010-05-15',
        phone: '010-1234-5678',
        parentPhone: '010-9876-5432',
      };

      req.user = { id: 1 };
      req.body = {
        name: '새학생',
        birthdate: '2010-05-15',
        phone: '010-1234-5678',
        parentPhone: '010-9876-5432',
      };
      Student.create.mockResolvedValue(newStudent);

      await studentController.createStudent(req, res);

      expect(Student.create).toHaveBeenCalledWith(req.body, 1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(newStudent);
    });

    it('should return 400 when name is missing', async () => {
      req.user = { id: 1 };
      req.body = { birthdate: '2010-05-15' };

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '학생 이름은 필수입니다.' });
      expect(Student.create).not.toHaveBeenCalled();
    });

    it('should return 400 when name is empty string', async () => {
      req.user = { id: 1 };
      req.body = { name: '   ', birthdate: '2010-05-15' };

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '학생 이름은 필수입니다.' });
    });

    it('should return 400 when birthdate is missing', async () => {
      req.user = { id: 1 };
      req.body = { name: '새학생' };

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '생년월일은 필수입니다.' });
      expect(Student.create).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      req.user = { id: 1 };
      req.body = { name: '새학생', birthdate: '2010-05-15' };
      Student.create.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: '학생 등록 중 오류가 발생했습니다.',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateStudent', () => {
    it('should update student successfully', async () => {
      const updatedStudent = {
        id: 1,
        name: '수정된학생',
        birthdate: '2010-05-15',
      };

      req.user = { id: 1, role: 'user' };
      req.params = { id: '1' };
      req.body = { name: '수정된학생', birthdate: '2010-05-15' };
      Student.update.mockResolvedValue(updatedStudent);

      await studentController.updateStudent(req, res);

      expect(Student.update).toHaveBeenCalledWith('1', req.body, 1, 'user');
      expect(res.json).toHaveBeenCalledWith(updatedStudent);
    });

    it('should return 404 when student not found', async () => {
      req.user = { id: 1, role: 'user' };
      req.params = { id: '999' };
      req.body = { name: '수정된학생' };
      Student.update.mockResolvedValue(null);

      await studentController.updateStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: '학생을 찾을 수 없습니다.' });
    });

    it('should allow admin to update any student', async () => {
      const updatedStudent = { id: 1, name: '수정됨', birthdate: '2010-01-01' };

      req.user = { id: 2, role: 'admin' };
      req.params = { id: '1' };
      req.body = { name: '수정됨' };
      Student.update.mockResolvedValue(updatedStudent);

      await studentController.updateStudent(req, res);

      expect(Student.update).toHaveBeenCalledWith('1', req.body, 2, 'admin');
      expect(res.json).toHaveBeenCalledWith(updatedStudent);
    });

    it('should handle database errors', async () => {
      req.user = { id: 1, role: 'user' };
      req.params = { id: '1' };
      req.body = { name: '수정됨' };
      Student.update.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await studentController.updateStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: '학생 수정 중 오류가 발생했습니다.',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteStudent', () => {
    it('should delete student successfully', async () => {
      req.user = { id: 1, role: 'user' };
      req.params = { id: '1' };
      Student.delete.mockResolvedValue();

      await studentController.deleteStudent(req, res);

      expect(Student.delete).toHaveBeenCalledWith('1', 1, 'user');
      expect(res.json).toHaveBeenCalledWith({ message: '학생이 삭제되었습니다.' });
    });

    it('should allow admin to delete any student', async () => {
      req.user = { id: 2, role: 'admin' };
      req.params = { id: '1' };
      Student.delete.mockResolvedValue();

      await studentController.deleteStudent(req, res);

      expect(Student.delete).toHaveBeenCalledWith('1', 2, 'admin');
      expect(res.json).toHaveBeenCalledWith({ message: '학생이 삭제되었습니다.' });
    });

    it('should handle database errors', async () => {
      req.user = { id: 1, role: 'user' };
      req.params = { id: '1' };
      Student.delete.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await studentController.deleteStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: '학생 삭제 중 오류가 발생했습니다.',
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle cascade deletion gracefully', async () => {
      req.user = { id: 1, role: 'user' };
      req.params = { id: '1' };
      Student.delete.mockResolvedValue();

      await studentController.deleteStudent(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: '학생이 삭제되었습니다.' });
    });
  });

  describe('Input validation edge cases', () => {
    it('should reject null name', async () => {
      req.user = { id: 1 };
      req.body = { name: null, birthdate: '2010-05-15' };

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '학생 이름은 필수입니다.' });
    });

    it('should reject undefined birthdate', async () => {
      req.user = { id: 1 };
      req.body = { name: '학생', birthdate: undefined };

      await studentController.createStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '생년월일은 필수입니다.' });
    });

    it('should accept optional phone fields', async () => {
      const newStudent = { id: 1, name: '학생', birthdate: '2010-05-15' };

      req.user = { id: 1 };
      req.body = { name: '학생', birthdate: '2010-05-15' };
      Student.create.mockResolvedValue(newStudent);

      await studentController.createStudent(req, res);

      expect(Student.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
