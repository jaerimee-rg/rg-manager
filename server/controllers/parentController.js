import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import Student from '../models/Student.js';
import Event from '../models/Event.js';
import EventRegistration from '../models/EventRegistration.js';
import { matchChild } from '../services/parentOnboarding.js';
import { canRegister, todayKst } from '../services/eventService.js';
import { sendEventRegistrationKakaoMessage } from '../utils/kakaoMessage.js';

export const CHILD_NAME_MAX = 20;
export const MAX_CHILDREN = 10;

const notFound = (res) => res.status(404).json({ error: '찾을 수 없습니다.' });

/**
 * 선생님에게 신청 소식을 알린다.
 * 신청은 이미 저장된 뒤라 알림이 실패해도 학부모 응답을 막지 않는다.
 */
const notifyTeacher = async ({ teacherId, event, child, optionIds, action }) => {
  try {
    const labels = (event.options || [])
      .filter((o) => (optionIds || []).includes(o.id))
      .map((o) => o.label);

    await sendEventRegistrationKakaoMessage({
      userId: teacherId,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      childName: child.childName,
      optionLabels: labels,
      action
    });
  } catch (error) {
    console.error('이벤트 신청 알림 처리 오류:', error?.message || error);
  }
};

/** 요청한 학부모의 소속 선생님 */
const teacherOf = async (userId) => {
  const account = await ParentAccount.getByUserId(userId);
  return account || null;
};

/** 학부모 화면에 내려보낼 자녀 정보 (다른 집 정보는 담지 않는다) */
const presentChild = (child) => ({
  id: child.id,
  childName: child.childName,
  childBirthdate: child.childBirthdate,
  status: child.status,
  studentId: child.studentId,
  studentName: child.studentName || null
});

export const getMe = async (req, res) => {
  try {
    const account = await teacherOf(req.user.id);
    if (!account) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    const children = await ParentChild.listByParent(req.user.id);

    res.json({
      user: { id: req.user.id, username: req.user.username },
      teacher: { name: account.teacherName },
      children: children.map(presentChild)
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 온보딩·자녀 추가. 이름·생년월일이 선생님의 학생과 정확히 하나 맞으면 바로 연결하고,
 * 아니면 확인 대기로 두어 가입 자체는 끝난다 (오타로 막히지 않도록).
 */
export const addChildren = async (req, res) => {
  try {
    const account = await teacherOf(req.user.id);
    if (!account) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    const input = Array.isArray(req.body.children) ? req.body.children : [];
    if (input.length === 0) return res.status(400).json({ error: '아이 정보를 입력해주세요.' });

    const existing = await ParentChild.listByParent(req.user.id);
    if (existing.length + input.length > MAX_CHILDREN) {
      return res.status(400).json({ error: `아이는 최대 ${MAX_CHILDREN}명까지 등록할 수 있습니다.` });
    }

    const cleaned = [];
    for (const raw of input) {
      const name = String(raw?.name ?? '').trim();
      const birthdate = String(raw?.birthdate ?? '').trim();

      if (!name) return res.status(400).json({ error: '아이 이름을 입력해주세요.' });
      if (name.length > CHILD_NAME_MAX) {
        return res.status(400).json({ error: `아이 이름은 ${CHILD_NAME_MAX}자 이내로 입력해주세요.` });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
        return res.status(400).json({ error: '생년월일을 선택해주세요.' });
      }
      cleaned.push({ name, birthdate });
    }

    // 선생님의 학생 명단과 대조한다 (그 선생님 학생만 후보)
    const students = await Student.getAll(account.teacherId, 'user');
    const created = [];

    for (const child of cleaned) {
      const match = matchChild(students, { name: child.name, birthdate: child.birthdate });

      // 같은 학생이 이미 연결돼 있으면 중복으로 만들지 않는다
      const duplicate = match.studentId && (await ParentChild.hasStudent(req.user.id, match.studentId));

      const row = await ParentChild.create({
        parentUserId: req.user.id,
        childName: child.name,
        childBirthdate: child.birthdate,
        studentId: duplicate ? null : match.studentId,
        linkedBy: 'auto'
      });

      created.push(row);
    }

    const children = await ParentChild.listByParent(req.user.id);
    res.status(201).json({ children: children.map(presentChild), created: created.length });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 올해 12월 31일 (KST 기준) */
const endOfYear = (today) => `${today.slice(0, 4)}-12-31`;

/**
 * 일정 화면: 오늘부터 올해 말까지의 공개 이벤트 + 내 자녀들의 신청 상태.
 * 달력 없이 카드로 보여주므로 한 번의 호출로 끝난다.
 */
export const getEvents = async (req, res) => {
  try {
    const account = await teacherOf(req.user.id);
    if (!account) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    const today = todayKst();
    const children = await ParentChild.listByParent(req.user.id);
    const events = await Event.listUpcomingForParent(account.teacherId, today, endOfYear(today));

    const studentIds = children.filter((c) => c.studentId).map((c) => c.studentId);
    const registrations = await EventRegistration.listForStudents(
      events.map((e) => e.id),
      studentIds
    );

    const regKey = (eventId, studentId) => `${eventId}:${studentId}`;
    const regMap = new Map(registrations.map((r) => [regKey(r.eventId, r.studentId), r]));
    const now = Date.now();

    res.json({
      today,
      children: children.map(presentChild),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        title: event.title,
        date: event.date,
        endDate: event.endDate,
        startTime: event.startTime,
        location: event.location,
        hasOptions: (event.options || []).length > 0,
        optionCount: (event.options || []).length,
        registrationDeadline: event.registrationDeadline,
        // 자녀별 신청 상태와 신청 가능 여부를 함께 담아 화면이 다시 묻지 않게 한다
        children: children.map((child) => {
          const reg = child.studentId ? regMap.get(regKey(event.id, child.studentId)) : null;
          const allowed = canRegister(event, child, now);
          return {
            childId: child.id,
            childName: child.childName,
            status: reg && reg.status !== 'cancelled' ? reg.status : null,
            optionIds: reg && reg.status !== 'cancelled' ? reg.optionIds : [],
            canRegister: allowed.ok,
            reason: allowed.reason
          };
        })
      }))
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getEvent = async (req, res) => {
  try {
    const account = await teacherOf(req.user.id);
    if (!account) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    const event = await Event.getPublishedForParent(req.params.id, account.teacherId);
    if (!event) return notFound(res);

    const children = await ParentChild.listByParent(req.user.id);
    const studentIds = children.filter((c) => c.studentId).map((c) => c.studentId);
    const registrations = await EventRegistration.listForStudents([event.id], studentIds);
    const byStudent = new Map(registrations.map((r) => [r.studentId, r]));
    const now = Date.now();

    res.json({
      id: event.id,
      type: event.type,
      title: event.title,
      date: event.date,
      endDate: event.endDate,
      startTime: event.startTime,
      location: event.location,
      description: event.description,
      options: event.options,
      requireOption: event.requireOption === true,
      registrationDeadline: event.registrationDeadline,
      children: children.map((child) => {
        const reg = child.studentId ? byStudent.get(child.studentId) : null;
        const allowed = canRegister(event, child, now);
        return {
          childId: child.id,
          childName: child.childName,
          status: reg ? reg.status : null,
          optionIds: reg && reg.status !== 'cancelled' ? reg.optionIds : [],
          canRegister: allowed.ok,
          reason: allowed.reason
        };
      })
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 신청에 필요한 것들을 한 번에 확인한다 (내 자녀인지, 내 선생님 이벤트인지) */
const loadForRegistration = async (req) => {
  const account = await teacherOf(req.user.id);
  if (!account) return { error: 404 };

  const event = await Event.getPublishedForParent(req.params.id, account.teacherId);
  if (!event) return { error: 404 };

  const children = await ParentChild.listByParent(req.user.id);
  const child = children.find((c) => String(c.id) === String(req.params.childId));
  if (!child) return { error: 404 };

  return { account, event, child };
};

export const registerChild = async (req, res) => {
  try {
    const loaded = await loadForRegistration(req);
    if (loaded.error) return notFound(res);

    const { event, child } = loaded;
    const allowed = canRegister(event, child);
    if (!allowed.ok) {
      const messages = {
        none: '휴관일은 신청할 수 없어요.',
        hidden: '지금은 신청할 수 없어요.',
        closed: '지금은 접수를 받지 않아요.',
        deadline: '접수가 마감되었어요. 선생님께 문의해 주세요.',
        started: '이미 시작된 일정이에요.',
        child_pending: '선생님이 아이 정보를 확인한 뒤에 신청할 수 있어요.'
      };
      return res.status(400).json({ error: messages[allowed.reason] || '지금은 신청할 수 없어요.' });
    }

    const validIds = new Set((event.options || []).map((o) => o.id));
    const optionIds = (Array.isArray(req.body.optionIds) ? req.body.optionIds : []).filter((id) =>
      validIds.has(id)
    );

    if (event.requireOption && optionIds.length === 0) {
      return res.status(400).json({ error: '옵션을 1개 이상 선택해 주세요.' });
    }

    const existing = await EventRegistration.getByEventAndStudent(event.id, child.studentId);
    const changing = existing && existing.status !== 'cancelled';

    const saved = await EventRegistration.upsertRegistered({
      eventId: event.id,
      studentId: child.studentId,
      parentUserId: req.user.id,
      optionIds,
      createdBy: 'parent'
    });

    await notifyTeacher({
      teacherId: loaded.account.teacherId,
      event,
      child,
      optionIds: saved.optionIds,
      action: changing ? 'updated' : 'registered'
    });

    res.json({ status: saved.status, optionIds: saved.optionIds });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 신청 취소. 신청할 수 있는 기간 안에서는 자유롭게 되돌릴 수 있다.
 * 확정된 신청을 취소하면 선생님이 알아볼 수 있도록 표시가 남는다.
 */
export const cancelChild = async (req, res) => {
  try {
    const loaded = await loadForRegistration(req);
    if (loaded.error) return notFound(res);

    const { event, child } = loaded;
    const allowed = canRegister(event, child);
    if (!allowed.ok && allowed.reason !== 'child_pending') {
      return res.status(400).json({ error: '접수가 끝나 취소할 수 없어요. 선생님께 문의해 주세요.' });
    }

    const cancelled = await EventRegistration.cancel(event.id, child.studentId);
    if (!cancelled) return res.status(404).json({ error: '신청 내역이 없습니다.' });

    await notifyTeacher({
      teacherId: loaded.account.teacherId,
      event,
      child,
      optionIds: cancelled.optionIds,
      action: cancelled.cancelledAfterConfirm ? 'cancelled_after_confirm' : 'cancelled'
    });

    res.json({
      status: cancelled.status,
      cancelledAfterConfirm: cancelled.cancelledAfterConfirm === true
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getMe, addChildren, getEvents, getEvent, registerChild, cancelChild };
