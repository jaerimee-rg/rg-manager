import Competition from '../models/Competition.js';
import { mirrorFromCompetition, syncCompetitionMirror } from '../services/competitionMirror.js';
import EventRegistration from '../models/EventRegistration.js';

export const getCompetitions = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const filterUserId = req.query.filterUserId;

    if (role === 'admin' && filterUserId && filterUserId !== 'all') {
      const targetUserId = parseInt(filterUserId, 10);
      if (isNaN(targetUserId)) {
        return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
      }
      const competitions = await Competition.getAll(targetUserId, 'user');
      res.json(competitions);
    } else {
      const competitions = await Competition.getAll(userId, role);
      res.json(competitions);
    }
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    const competition = await Competition.getById(id, userId, role);

    if (!competition) {
      return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
    }

    res.json(competition);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const createCompetition = async (req, res) => {
  try {
    const userId = req.user.id;
    const newCompetition = await Competition.create(req.body, userId);

    // 학부모 일정에도 보이도록 이벤트를 함께 만든다.
    // 실패해도 대회 등록은 성공이며, 빠진 이벤트는 다음 부팅의 백필이 메운다.
    await mirrorFromCompetition(newCompetition);

    res.status(201).json(newCompetition);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const updateCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    const updatedCompetition = await Competition.update(id, req.body, userId, role);

    if (!updatedCompetition) {
      return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
    }

    // 이벤트의 이름·날짜·장소를 맞춰 둔다 (실패해도 대회 수정은 그대로).
    await syncCompetitionMirror(updatedCompetition);

    res.json(updatedCompetition);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    await Competition.delete(id, userId, role);
    res.json({ message: '대회가 삭제되었습니다.' });
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 대회 참가 학생 관련
export const getCompetitionStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    const students = await Competition.getStudents(id, userId, role);
    res.json(students);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const addStudentToCompetition = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, events } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    // 대회 소유권 확인
    const competition = await Competition.getById(id, userId, role);
    if (!competition) {
      return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
    }

    await Competition.addStudent(id, studentId, events);
    res.status(201).json({ message: '학생이 대회에 등록되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: '대회 학생 등록 중 오류가 발생했습니다.' });
  }
};

export const updateStudentEvents = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { events } = req.body;
    const result = await Competition.updateStudentEvents(id, studentId, events);
    if (!result) {
      return res.status(404).json({ error: '등록 정보를 찾을 수 없습니다.' });
    }
    res.json({ message: '종목 정보가 업데이트되었습니다.' });
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getStudentEvents = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const events = await Competition.getStudentEvents(id, studentId);
    res.json(events);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getCompetitionStudentsWithEvents = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;
    const students = await Competition.getStudentsWithEvents(id, userId, role);
    res.json(students);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const removeStudentFromCompetition = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    // 대회 소유권 확인
    const competition = await Competition.getById(id, userId, role);
    if (!competition) {
      return res.status(404).json({ error: '대회를 찾을 수 없습니다.' });
    }

    await Competition.removeStudent(id, studentId);

    // 참가 학생에서 빼면 그 학부모 신청은 확정 이전(신청) 상태로 되돌린다.
    // 실패해도 참가 학생 제거는 그대로 둔다.
    await EventRegistration.revertConfirmation(id, studentId).catch((error) =>
      console.error('확정 해제 반영 실패:', error?.message || error)
    );
    res.json({ message: '학생이 대회에서 제외되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: '대회 학생 제외 중 오류가 발생했습니다.' });
  }
};

export const getCompetitionStudentIds = async (req, res) => {
  try {
    const { id } = req.params;
    const studentIds = await Competition.getStudentIds(id);
    res.json(studentIds);
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const updateStudentPaid = async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { paid, coachFeePaid } = req.body;
    const result = await Competition.updateStudentPaid(id, studentId, paid, coachFeePaid);
    if (!result) {
      return res.status(404).json({ error: '등록 정보를 찾을 수 없습니다.' });
    }
    res.json({ message: '납부 상태가 업데이트되었습니다.' });
  } catch (error) {
    console.error('대회 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
