import Attendance from '../models/Attendance.js';
import { sendAttendanceEmail } from '../utils/mailer.js';
import { sendAttendanceKakaoMessage } from '../utils/kakaoMessage.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';

export const getAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const filterUserId = req.query.filterUserId;

    // Admin이 특정 사용자로 필터링하는 경우
    if (role === 'admin' && filterUserId && filterUserId !== 'all') {
      const targetUserId = parseInt(filterUserId, 10);
      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      }
      const attendance = await Attendance.getAll(targetUserId, 'user');
      res.json(attendance);
    } else {
      const attendance = await Attendance.getAll(userId, role);
      res.json(attendance);
    }
  } catch (error) {
    console.error('출석 조회 오류:', error);
    res.status(500).json({ error: '출석 조회 중 오류가 발생했습니다.' });
  }
};

export const checkAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const newRecord = await Attendance.create(req.body, userId);
    res.status(201).json(newRecord);
  } catch (error) {
    console.error('출석 체크 오류:', error);
    res.status(500).json({ error: '출석 체크 중 오류가 발생했습니다.' });
  }
};

// 보강 출석은 한 번에 이만큼까지 — 학원 학생 전체를 골라도 넘지 않는 수
export const MAX_MAKEUP_STUDENTS = 200;

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

// 보강 출석 여러 명 추가 — 이미 출석한 학생은 건너뛰고, 넣은 학생과 건너뛴 학생을 나눠 돌려준다.
// 일괄 저장(/bulk)과 달리 그날 수업의 기존 출석은 지우지 않는다.
export const addMakeupAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { date, classId, studentIds } = req.body || {};

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '날짜를 확인해주세요.' });
    }
    if (!isPositiveInt(classId)) {
      return res.status(400).json({ error: '수업을 선택해주세요.' });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !studentIds.every(isPositiveInt)) {
      return res.status(400).json({ error: '학생을 한 명 이상 선택해주세요.' });
    }
    const ids = [...new Set(studentIds)];
    if (ids.length > MAX_MAKEUP_STUDENTS) {
      return res.status(400).json({ error: `한 번에 ${MAX_MAKEUP_STUDENTS}명까지 추가할 수 있습니다.` });
    }

    // 남의 수업·학생으로는 출석을 만들 수 없다
    const classInfo = await Class.getById(classId, userId, role);
    if (!classInfo) {
      return res.status(404).json({ error: '수업을 찾을 수 없습니다.' });
    }
    const owned = await Student.getByIds(ids, userId, role);
    if (owned.length !== ids.length) {
      return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });
    }

    const created = await Attendance.createMany({ studentIds: ids, classId, date }, userId);
    const addedIds = new Set(created.map((row) => row.studentId));

    res.status(201).json({
      added: ids.filter((id) => addedIds.has(id)),
      skipped: ids.filter((id) => !addedIds.has(id)),
    });
  } catch (error) {
    console.error('보강 출석 추가 오류:', error);
    res.status(500).json({ error: '보강 출석 추가 중 오류가 발생했습니다.' });
  }
};

export const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    const filterUserId = req.query.filterUserId;

    // Admin이 특정 사용자로 필터링하는 경우
    if (role === 'admin' && filterUserId && filterUserId !== 'all') {
      const targetUserId = parseInt(filterUserId, 10);
      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      }
      const attendance = await Attendance.getByDate(date, targetUserId, 'user');
      res.json(attendance);
    } else {
      const attendance = await Attendance.getByDate(date, userId, role);
      res.json(attendance);
    }
  } catch (error) {
    console.error('출석 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    await Attendance.delete(id, userId, role);
    res.json({ message: '출석 기록이 삭제되었습니다.' });
  } catch (error) {
    console.error('출석 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteAttendanceByDateAndClass = async (req, res) => {
  try {
    const { date, classId } = req.body;
    const userId = req.user.id;
    const role = req.user.role;
    await Attendance.deleteByDateAndClass(date, classId, userId, role);
    res.json({ message: '출석 기록이 삭제되었습니다.' });
  } catch (error) {
    console.error('출석 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 출석 제출 후 이메일 발송
export const submitAttendanceWithEmail = async (req, res) => {
  try {
    const { date, classId, className, schedule, students, presentStudentIds } = req.body;

    // 이메일 발송
    const emailResult = await sendAttendanceEmail({
      date,
      className,
      schedule,
      students,
      presentStudentIds
    });

    if (emailResult.success) {
      res.json({ message: '출석 이메일이 발송되었습니다.', messageId: emailResult.messageId });
    } else {
      res.status(500).json({ error: '이메일 발송 실패', details: emailResult.error });
    }
  } catch (error) {
    console.error('출석 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 일괄 출석 제출 + 카카오톡 알림
export const submitBulkAttendance = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { date, classId, studentIds, sendKakaoMessage } = req.body;

    // 1. 기존 출석 삭제 (해당 날짜 + 수업)
    await Attendance.deleteByDateAndClass(date, classId, userId, role);

    // 2. 새 출석 기록 생성
    const attendancePromises = studentIds.map((studentId) =>
      Attendance.create({ studentId, classId, date }, userId)
    );
    await Promise.all(attendancePromises);

    // 3. 카카오 메시지 전송 (요청된 경우)
    let kakaoResult = { skipped: true };
    if (sendKakaoMessage) {
      try {
        const classInfo = await Class.getById(classId, userId, role);
        const allStudents = await Student.getByClassId(classId, userId, role);

        kakaoResult = await sendAttendanceKakaoMessage({
          userId,
          date,
          className: classInfo?.name || '알 수 없는 수업',
          schedule: classInfo?.schedule || '',
          students: allStudents,
          presentStudentIds: studentIds,
        });
      } catch (kakaoError) {
        console.error('카카오 메시지 전송 중 오류:', kakaoError);
        kakaoResult = { success: false, error: '메시지 전송 실패' };
      }
    }

    res.json({
      message: '출석 체크가 완료되었습니다.',
      attendanceCount: studentIds.length,
      kakaoMessage: kakaoResult,
    });
  } catch (error) {
    console.error('출석 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
