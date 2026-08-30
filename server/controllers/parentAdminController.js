import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import ParentTeacher from '../models/ParentTeacher.js';
import Student from '../models/Student.js';

/**
 * 선생님(관리자는 전체/필터)의 학부모 목록.
 * 화면에서 학부모별·학생별 두 방향으로 쓰므로 자녀를 함께 담아 돌려준다.
 */
export const getParents = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { filterUserId } = req.query;

    let parents;
    if (role === 'admin') {
      if (!filterUserId || filterUserId === 'all') {
        parents = await ParentAccount.listAll();
      } else {
        const parsed = parseInt(filterUserId, 10);
        if (isNaN(parsed)) return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
        parents = await ParentAccount.listByTeacher(parsed);
      }
    } else {
      parents = await ParentAccount.listByTeacher(userId);
    }

    const children = parents.flatMap((p) => p.children);
    const linkedStudentIds = new Set(children.filter((c) => c.studentId).map((c) => c.studentId));

    res.json({
      parents,
      summary: {
        parentCount: parents.length,
        pendingChildren: children.filter((c) => c.status !== 'linked').length,
        linkedStudents: linkedStudentIds.size
      }
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 이 요청자가 그 자녀(그리고 학생)를 다룰 수 있는지.
 * 소속 선생님은 **자녀 행이 직접** 갖고 있다 — 학부모가 여러 선생님과 연결될 수 있어
 * parent_accounts 로는 어느 선생님인지 결정할 수 없다.
 */
const authorize = async (req, child) => {
  const { id: userId, role } = req.user;
  if (!child) return false;
  return role === 'admin' || Number(child.teacherId) === Number(userId);
};

/** 확인 대기 자녀를 학생과 연결한다 */
export const linkChild = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const studentId = parseInt(req.body.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: '학생을 선택해주세요.' });

    const child = await ParentChild.getWithOwner(req.params.childId);
    if (!(await authorize(req, child))) {
      return res.status(404).json({ error: '자녀 정보를 찾을 수 없습니다.' });
    }

    // 학생이 그 선생님 소유인지 확인한다 (관리자는 해당 선생님 기준으로 확인)
    const student = await Student.getById(studentId, child.teacherId, 'user');
    if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

    if (await ParentChild.hasStudent(child.parentUserId, studentId)) {
      return res.status(400).json({ error: '이미 연결된 학생입니다.' });
    }

    const updated = await ParentChild.link(child.id, studentId, role === 'admin' ? 'admin' : 'teacher');
    res.json(updated);
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const unlinkChild = async (req, res) => {
  try {
    const child = await ParentChild.getWithOwner(req.params.childId);
    if (!(await authorize(req, child))) {
      return res.status(404).json({ error: '자녀 정보를 찾을 수 없습니다.' });
    }

    const updated = await ParentChild.unlink(child.id);
    res.json(updated);
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 선생님이 학부모에 학생 연결을 직접 추가한다
 * (학부모가 아이를 안 넣었거나 형제를 추가할 때).
 */
export const addChildLink = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const parentUserId = parseInt(req.params.userId, 10);
    const studentId = parseInt(req.body.studentId, 10);
    if (isNaN(parentUserId) || isNaN(studentId)) {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    const account = await ParentAccount.getByUserId(parentUserId);
    if (!account) return res.status(404).json({ error: '학부모를 찾을 수 없습니다.' });

    /* 관리자는 학생의 소유 선생님을 그대로 쓰고, 선생님은 자기 자신만 다룰 수 있다.
       (학부모가 여러 선생님과 연결될 수 있으므로 "그 학부모의 선생님" 이 하나가 아니다) */
    let teacherId = userId;
    if (role === 'admin') {
      teacherId = req.body.teacherId ? parseInt(req.body.teacherId, 10) : null;
      if (!teacherId) {
        const teachers = await ParentTeacher.listTeachers(parentUserId);
        teacherId = teachers[0]?.id;
      }
      if (!teacherId) return res.status(400).json({ error: '연결할 선생님을 찾을 수 없습니다.' });
    } else if (!(await ParentTeacher.isLinked(parentUserId, userId))) {
      return res.status(404).json({ error: '학부모를 찾을 수 없습니다.' });
    }

    const student = await Student.getById(studentId, teacherId, 'user');
    if (!student) return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });

    if (await ParentChild.hasStudent(parentUserId, studentId)) {
      return res.status(400).json({ error: '이미 연결된 학생입니다.' });
    }

    const created = await ParentChild.create({
      parentUserId,
      teacherId,
      childName: student.name,
      childBirthdate: student.birthdate,
      studentId,
      linkedBy: role === 'admin' ? 'admin' : 'teacher'
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 선생님은 **자기 연결만 해제**한다 (그 학부모가 다른 선생님에게도 다닐 수 있으므로
 * 계정을 지울 권한이 없다). 관리자만 계정을 삭제한다 (FR-361).
 */
export const deleteParent = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const parentUserId = parseInt(req.params.userId, 10);
    if (isNaN(parentUserId)) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const account = await ParentAccount.getByUserId(parentUserId);
    if (!account) return res.status(404).json({ error: '학부모를 찾을 수 없습니다.' });

    if (role === 'admin') {
      await ParentAccount.delete(parentUserId);
      return res.json({ message: '학부모 계정이 삭제되었습니다.' });
    }

    if (!(await ParentTeacher.isLinked(parentUserId, userId))) {
      return res.status(404).json({ error: '학부모를 찾을 수 없습니다.' });
    }

    await ParentTeacher.unlink(parentUserId, userId);
    res.json({ message: '학부모 연결이 해제되었습니다.', unlinkedOnly: true });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 관리자가 특정 선생님과의 연결만 끊는다 (FR-387) */
export const unlinkTeacher = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const parentUserId = parseInt(req.params.userId, 10);
    const teacherId = parseInt(req.params.teacherId, 10);
    if (isNaN(parentUserId) || isNaN(teacherId)) {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    // 선생님은 자기 연결만 끊을 수 있다
    if (role !== 'admin' && teacherId !== userId) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const removed = await ParentTeacher.unlink(parentUserId, teacherId);
    if (!removed) return res.status(404).json({ error: '연결을 찾을 수 없습니다.' });

    res.json({ message: '연결이 해제되었습니다.' });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getParents, linkChild, unlinkChild, addChildLink, deleteParent, unlinkTeacher };
