import { jest } from '@jest/globals';

// 네이티브 ESM 에서는 jest.mock 이 동작하지 않아 unstable_mockModule 을 쓴다.
jest.unstable_mockModule('../../models/Attendance.js', () => ({
  default: { createMany: jest.fn() }
}));
jest.unstable_mockModule('../../models/Class.js', () => ({
  default: { getById: jest.fn() }
}));
jest.unstable_mockModule('../../models/Student.js', () => ({
  default: { getByIds: jest.fn(), getByClassId: jest.fn() }
}));
jest.unstable_mockModule('../../utils/mailer.js', () => ({ sendAttendanceEmail: jest.fn() }));
jest.unstable_mockModule('../../utils/kakaoMessage.js', () => ({ sendAttendanceKakaoMessage: jest.fn() }));

const Attendance = (await import('../../models/Attendance.js')).default;
const Class = (await import('../../models/Class.js')).default;
const Student = (await import('../../models/Student.js')).default;
const { addMakeupAttendance, MAX_MAKEUP_STUDENTS } = await import('../attendanceController.js');

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const call = async (body, user = { id: 7, role: 'user' }) => {
  const res = makeRes();
  await addMakeupAttendance({ body, user, params: {}, query: {} }, res);
  return res;
};

const studentsOf = (ids) => ids.map((id) => ({ id, name: `학생${id}` }));

describe('addMakeupAttendance — 보강 출석 여러 명 한 번에', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Class.getById.mockResolvedValue({ id: 3, name: '초급반' });
    Student.getByIds.mockImplementation(async (ids) => studentsOf(ids));
    Attendance.createMany.mockImplementation(async ({ studentIds }) =>
      studentIds.map((studentId) => ({ studentId }))
    );
  });

  it('고른 학생을 모두 한 번에 넣고 201 로 넣은 학생을 돌려준다', async () => {
    const res = await call({ date: '2026-10-27', classId: 3, studentIds: [1, 2, 5] });

    expect(Attendance.createMany).toHaveBeenCalledTimes(1);
    expect(Attendance.createMany).toHaveBeenCalledWith({ studentIds: [1, 2, 5], classId: 3, date: '2026-10-27' }, 7);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ added: [1, 2, 5], skipped: [] });
  });

  it('이미 출석한 학생은 skipped 로 나눠 알려준다 (고른 순서 유지)', async () => {
    Attendance.createMany.mockResolvedValue([{ studentId: 5 }, { studentId: 1 }]);

    const res = await call({ date: '2026-10-27', classId: 3, studentIds: [1, 2, 5] });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ added: [1, 5], skipped: [2] });
  });

  it('같은 학생이 두 번 오면 한 번만 넣는다', async () => {
    await call({ date: '2026-10-27', classId: 3, studentIds: [2, 2, 4] });
    expect(Attendance.createMany.mock.calls[0][0].studentIds).toEqual([2, 4]);
  });

  it('수업·학생 소유는 토큰의 사용자와 역할로 확인한다', async () => {
    await call({ date: '2026-10-27', classId: 3, studentIds: [1, 2] }, { id: 9, role: 'admin' });
    expect(Class.getById).toHaveBeenCalledWith(3, 9, 'admin');
    expect(Student.getByIds).toHaveBeenCalledWith([1, 2], 9, 'admin');
  });

  it.each([
    ['날짜가 없으면', { classId: 3, studentIds: [1] }, '날짜를 확인해주세요.'],
    ['날짜 형식이 틀리면', { date: '2026/10/27', classId: 3, studentIds: [1] }, '날짜를 확인해주세요.'],
    ['수업이 없으면', { date: '2026-10-27', studentIds: [1] }, '수업을 선택해주세요.'],
    ['수업 id 가 문자열이면', { date: '2026-10-27', classId: '3', studentIds: [1] }, '수업을 선택해주세요.'],
    ['학생이 비었으면', { date: '2026-10-27', classId: 3, studentIds: [] }, '학생을 한 명 이상 선택해주세요.'],
    ['학생 목록이 배열이 아니면', { date: '2026-10-27', classId: 3, studentIds: 1 }, '학생을 한 명 이상 선택해주세요.'],
    ['학생 id 가 숫자가 아니면', { date: '2026-10-27', classId: 3, studentIds: [1, 'x'] }, '학생을 한 명 이상 선택해주세요.'],
  ])('%s 400 이고 아무것도 넣지 않는다', async (_label, body, error) => {
    const res = await call(body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error });
    expect(Attendance.createMany).not.toHaveBeenCalled();
  });

  it(`한 번에 ${MAX_MAKEUP_STUDENTS}명을 넘으면 400`, async () => {
    const ids = Array.from({ length: MAX_MAKEUP_STUDENTS + 1 }, (_, i) => i + 1);
    const res = await call({ date: '2026-10-27', classId: 3, studentIds: ids });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Attendance.createMany).not.toHaveBeenCalled();
  });

  it('남의 수업이면 404 이고 넣지 않는다', async () => {
    Class.getById.mockResolvedValue(null);
    const res = await call({ date: '2026-10-27', classId: 3, studentIds: [1] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(Attendance.createMany).not.toHaveBeenCalled();
  });

  it('고른 학생 중 하나라도 남의 학생이면 404 이고 아무도 넣지 않는다', async () => {
    Student.getByIds.mockResolvedValue(studentsOf([1]));
    const res = await call({ date: '2026-10-27', classId: 3, studentIds: [1, 99] });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: '학생을 찾을 수 없습니다.' });
    expect(Attendance.createMany).not.toHaveBeenCalled();
  });

  it('DB 오류는 500', async () => {
    Attendance.createMany.mockRejectedValue(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ date: '2026-10-27', classId: 3, studentIds: [1] });
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });
});
