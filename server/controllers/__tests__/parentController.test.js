import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/ParentAccount.js', () => ({
  default: { getByUserId: jest.fn(), create: jest.fn(), updateDisplayName: jest.fn() }
}));

jest.unstable_mockModule('../../models/ParentInvite.js', () => ({
  default: { getByToken: jest.fn(), isUsable: jest.fn(() => false) }
}));

// 학부모 ↔ 선생님 다대다 — 학부모가 볼 수 있는 범위를 만드는 유일한 곳
jest.unstable_mockModule('../../models/ParentTeacher.js', () => ({
  default: {
    listTeachers: jest.fn(),
    teacherIds: jest.fn(),
    isLinked: jest.fn().mockResolvedValue(false),
    link: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/ParentChild.js', () => ({
  default: { listByParent: jest.fn(), create: jest.fn(), hasStudent: jest.fn() }
}));

jest.unstable_mockModule('../../models/Student.js', () => ({
  default: { getAll: jest.fn() }
}));

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { listUpcomingForParent: jest.fn(), getPublishedForParent: jest.fn() }
}));

jest.unstable_mockModule('../../models/ChildFaceProfile.js', () => ({
  default: { countsByStudents: jest.fn().mockResolvedValue({}) },
  MAX_PER_PARENT: 3,
  MAX_PER_STUDENT: 5
}));

jest.unstable_mockModule('../../models/EventRegistration.js', () => ({
  default: {
    listForStudents: jest.fn(),
    upsertRegistered: jest.fn(),
    cancel: jest.fn(),
    getByEventAndStudent: jest.fn()
  }
}));

// 알림은 신청이 저장된 뒤에 나가고 실패해도 응답을 막지 않는다.
jest.unstable_mockModule('../../utils/kakaoMessage.js', () => ({
  sendEventRegistrationKakaoMessage: jest.fn().mockResolvedValue({ success: true })
}));

const ParentAccount = (await import('../../models/ParentAccount.js')).default;
const ParentInvite = (await import('../../models/ParentInvite.js')).default;
const ParentTeacher = (await import('../../models/ParentTeacher.js')).default;
const ParentChild = (await import('../../models/ParentChild.js')).default;
const Student = (await import('../../models/Student.js')).default;
const Event = (await import('../../models/Event.js')).default;
const EventRegistration = (await import('../../models/EventRegistration.js')).default;
const { sendEventRegistrationKakaoMessage } = await import('../../utils/kakaoMessage.js');
const { getMe, addChildren, updateName, getEvents, getEvent, registerChild, cancelChild, addTeacher } =
  await import('../parentController.js');

// 선생님 1명과 연결된 기본 상태 (기존 동작이 그대로인지 확인하는 기준)
const teacherA = { id: 7, name: '이재림', since: '2026-02-10' };
const teacherB = { id: 8, name: '박지우', since: '2026-08-30' };

const linkedChild = { id: 1, teacherId: 7, teacherName: '이재림', childName: '김민서', childBirthdate: '2018-03-05', status: 'linked', studentId: 100, studentName: '김민서' };
const pendingChild = { id: 2, teacherId: 7, teacherName: '이재림', childName: '김준호', childBirthdate: '2020-11-12', status: 'pending', studentId: null };
// 다른 선생님(박지우)에게 다니는 아이
const otherTeacherChild = { id: 3, teacherId: 8, teacherName: '박지우', childName: '김나윤', childBirthdate: '2019-06-15', status: 'linked', studentId: 200, studentName: '김나윤' };

// 신청할 수 있는 미래 이벤트를 만든다 (오늘 기준 상대 날짜)
const futureDate = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
};

const openEvent = {
  id: 5, userId: 7, teacherName: '이재림',
  type: 'competition', title: '대회', date: futureDate(20), startTime: '09:00',
  isPublished: true, registrationOpen: true, registrationDeadline: null,
  options: [{ id: 'opt_a', label: '볼' }, { id: 'opt_b', label: '후프' }], requireOption: false
};

describe('parentController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {}, params: {}, query: {}, user: { id: 20, username: '민서엄마', role: 'parent' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    ParentTeacher.listTeachers.mockResolvedValue([teacherA]);
    ParentTeacher.teacherIds.mockResolvedValue([7]);
    ParentChild.listByParent.mockResolvedValue([linkedChild, pendingChild]);
    ParentChild.hasStudent.mockResolvedValue(false);
    // 아직 학부모명을 정하지 않은 계정이 기본 상태
    ParentAccount.getByUserId.mockResolvedValue({ userId: 20, displayName: null });
    ParentAccount.updateDisplayName.mockImplementation(async (userId, displayName) => ({ userId, displayName }));
    EventRegistration.listForStudents.mockResolvedValue([]);
    EventRegistration.getByEventAndStudent.mockResolvedValue(null);
  });

  describe('getMe', () => {
    it('연결된 선생님 목록과 자녀를 돌려준다', async () => {
      await getMe(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.teachers).toEqual([teacherA]);
      expect(payload.children).toHaveLength(2);
      // 옛 클라이언트 호환 — 대표 선생님도 함께 내려보낸다
      expect(payload.teacher).toEqual({ name: '이재림' });
    });

    it('선생님이 여럿이면 전부 돌려준다', async () => {
      ParentTeacher.listTeachers.mockResolvedValue([teacherA, teacherB]);
      ParentChild.listByParent.mockResolvedValue([linkedChild, otherTeacherChild]);

      await getMe(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.teachers).toHaveLength(2);
      // 자녀마다 어느 선생님 아이인지 표시된다
      expect(payload.children.map((c) => c.teacherName)).toEqual(['이재림', '박지우']);
    });

    it('학부모가 정한 이름을 내려보낸다', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, displayName: '민서엄마' });

      await getMe(req, res);

      expect(res.json.mock.calls[0][0].user).toEqual({ id: 20, username: '민서엄마', displayName: '민서엄마' });
    });

    it('이름을 정하지 않은 옛 계정은 null 로 준다 (화면이 카카오 닉네임으로 되돌린다)', async () => {
      ParentAccount.getByUserId.mockResolvedValue(null);

      await getMe(req, res);

      expect(res.json.mock.calls[0][0].user.displayName).toBeNull();
    });

    it('연결된 선생님이 없으면 빈 목록으로 답한다 (오류가 아니다)', async () => {
      ParentTeacher.listTeachers.mockResolvedValue([]);
      ParentChild.listByParent.mockResolvedValue([]);

      await getMe(req, res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].teachers).toEqual([]);
      expect(res.json.mock.calls[0][0].teacher).toBeNull();
    });
  });

  describe('addChildren (온보딩)', () => {
    beforeEach(() => {
      ParentChild.listByParent.mockResolvedValue([]);
      Student.getAll.mockResolvedValue([
        { id: 100, name: '김민서', birthdate: '2018-03-05' },
        { id: 101, name: '이하은', birthdate: '2017-07-22' }
      ]);
      ParentChild.create.mockImplementation(async (data) => ({ id: 1, ...data }));
    });

    it('이름·생일이 맞으면 학생과 바로 연결한다', async () => {
      req.body = { children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(ParentChild.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: 100, linkedBy: 'auto' }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('맞는 학생이 없으면 확인 대기로 저장하고 가입은 끝낸다', async () => {
      req.body = { children: [{ name: '박새로', birthdate: '2019-01-01' }] };

      await addChildren(req, res);

      expect(ParentChild.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: null }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('그 선생님의 학생만 후보로 본다', async () => {
      req.body = { children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(7, 'user');
    });

    it('이미 연결한 학생이면 중복으로 연결하지 않는다', async () => {
      ParentChild.hasStudent.mockResolvedValue(true);
      req.body = { children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(ParentChild.create).toHaveBeenCalledWith(expect.objectContaining({ studentId: null }));
    });

    it('이름이 비면 400', async () => {
      req.body = { children: [{ name: '  ', birthdate: '2018-03-05' }] };
      await addChildren(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('생년월일 형식이 아니면 400', async () => {
      req.body = { children: [{ name: '김민서', birthdate: '2018년 3월' }] };
      await addChildren(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('아이가 하나도 없으면 400', async () => {
      req.body = { children: [] };
      await addChildren(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('보내온 학부모명을 저장한다', async () => {
      req.body = { parentName: '칸쵸엄마', children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(ParentAccount.updateDisplayName).toHaveBeenCalledWith(20, '칸쵸엄마');
      expect(res.json.mock.calls[0][0].displayName).toBe('칸쵸엄마');
    });

    it('학부모명이 비면 첫 아이 이름으로 기본값을 만든다', async () => {
      req.body = { children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(ParentAccount.updateDisplayName).toHaveBeenCalledWith(20, '김민서엄마');
    });

    it('이미 이름을 정한 계정이면 빈 값이 와도 덮어쓰지 않는다', async () => {
      ParentAccount.getByUserId.mockResolvedValue({ userId: 20, displayName: '칸쵸엄마' });
      req.body = { children: [{ name: '이하은', birthdate: '2017-07-22' }] };

      await addChildren(req, res);

      expect(ParentAccount.updateDisplayName).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('학부모명이 너무 길면 400 (아이는 저장하지 않는다)', async () => {
      req.body = { parentName: '가'.repeat(21), children: [{ name: '김민서', birthdate: '2018-03-05' }] };

      await addChildren(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ParentChild.create).not.toHaveBeenCalled();
    });
  });

  describe('updateName (내 정보에서 이름 변경)', () => {
    it('학부모명을 바꾼다', async () => {
      req.body = { parentName: '  쵸파엄마  ' };

      await updateName(req, res);

      expect(ParentAccount.updateDisplayName).toHaveBeenCalledWith(20, '쵸파엄마');
      expect(res.json.mock.calls[0][0]).toEqual({ displayName: '쵸파엄마' });
    });

    it('빈 값이면 400 — 이름을 지울 수는 없다', async () => {
      req.body = { parentName: '   ' };

      await updateName(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ParentAccount.updateDisplayName).not.toHaveBeenCalled();
    });

    it('학부모 계정이 없으면 404', async () => {
      ParentAccount.updateDisplayName.mockResolvedValue(null);
      req.body = { parentName: '예림엄마' };

      await updateName(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getEvents (일정)', () => {
    it('오늘~연말 범위로 조회한다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([]);

      await getEvents(req, res);

      const [teacherIds, from, to] = Event.listUpcomingForParent.mock.calls[0];
      // 연결된 선생님 전부를 스코프로 조회한다
      expect(teacherIds).toEqual([7]);
      expect(to).toBe(`${from.slice(0, 4)}-12-31`);
      expect(to >= from).toBe(true);
    });

    it('자녀별 신청 상태와 신청 가능 여부를 함께 담는다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([openEvent]);
      EventRegistration.listForStudents.mockResolvedValue([
        { eventId: 5, studentId: 100, status: 'registered', optionIds: ['opt_a'] }
      ]);

      await getEvents(req, res);

      const event = res.json.mock.calls[0][0].events[0];
      const mine = event.children.find((c) => c.childId === 1);
      const pending = event.children.find((c) => c.childId === 2);

      expect(mine.status).toBe('registered');
      expect(mine.optionIds).toEqual(['opt_a']);
      expect(mine.canRegister).toBe(true);
      // 확인 대기 자녀는 신청할 수 없다
      expect(pending.canRegister).toBe(false);
      expect(pending.reason).toBe('child_pending');
    });

    it('취소한 신청은 상태를 비워 다시 신청할 수 있게 한다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([openEvent]);
      EventRegistration.listForStudents.mockResolvedValue([
        { eventId: 5, studentId: 100, status: 'cancelled', optionIds: ['opt_a'] }
      ]);

      await getEvents(req, res);

      const mine = res.json.mock.calls[0][0].events[0].children[0];
      expect(mine.status).toBeNull();
      expect(mine.canRegister).toBe(true);
    });

    it('옵션 라벨은 목록에 내려보내지 않는다 (상세에서만)', async () => {
      Event.listUpcomingForParent.mockResolvedValue([openEvent]);

      await getEvents(req, res);

      const event = res.json.mock.calls[0][0].events[0];
      expect(event.hasOptions).toBe(true);
      expect(event).not.toHaveProperty('options');
    });
  });

  describe('getEvent (상세)', () => {
    it('공개되지 않았거나 다른 선생님 이벤트는 404', async () => {
      Event.getPublishedForParent.mockResolvedValue(null);
      req.params.id = '5';

      await getEvent(req, res);

      expect(Event.getPublishedForParent).toHaveBeenCalledWith('5', [7]);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('옵션과 자녀별 상태를 함께 준다', async () => {
      Event.getPublishedForParent.mockResolvedValue(openEvent);
      req.params.id = '5';

      await getEvent(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.options).toHaveLength(2);
      expect(payload.children).toHaveLength(2);
    });
  });

  describe('registerChild (신청)', () => {
    beforeEach(() => {
      Event.getPublishedForParent.mockResolvedValue(openEvent);
      EventRegistration.upsertRegistered.mockResolvedValue({ status: 'registered', optionIds: ['opt_a'] });
      req.params = { id: '5', childId: '1' };
    });

    it('내 자녀를 옵션과 함께 신청한다', async () => {
      req.body = { optionIds: ['opt_a'] };

      await registerChild(req, res);

      expect(EventRegistration.upsertRegistered).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 5, studentId: 100, parentUserId: 20, optionIds: ['opt_a'], createdBy: 'parent'
      }));
    });

    it('이벤트에 없는 옵션은 걸러낸다', async () => {
      req.body = { optionIds: ['opt_a', 'opt_hack'] };

      await registerChild(req, res);

      expect(EventRegistration.upsertRegistered).toHaveBeenCalledWith(
        expect.objectContaining({ optionIds: ['opt_a'] })
      );
    });

    it('옵션 필수인데 안 고르면 400', async () => {
      Event.getPublishedForParent.mockResolvedValue({ ...openEvent, requireOption: true });
      req.body = { optionIds: [] };

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(EventRegistration.upsertRegistered).not.toHaveBeenCalled();
    });

    it('확인 대기 자녀는 신청할 수 없다', async () => {
      req.params.childId = '2';
      req.body = { optionIds: [] };

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('선생님');
    });

    it('접수가 닫혀 있으면 400', async () => {
      Event.getPublishedForParent.mockResolvedValue({ ...openEvent, registrationOpen: false });
      req.body = { optionIds: [] };

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('마감이 지나면 400', async () => {
      Event.getPublishedForParent.mockResolvedValue({
        ...openEvent, registrationDeadline: '2020-01-01T00:00:00+09:00'
      });
      req.body = { optionIds: [] };

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('내 자녀가 아니면 404', async () => {
      req.params.childId = '999';

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(EventRegistration.upsertRegistered).not.toHaveBeenCalled();
    });

    it('신청하면 선생님에게 알림을 보낸다', async () => {
      req.body = { optionIds: ['opt_a'] };

      await registerChild(req, res);

      expect(sendEventRegistrationKakaoMessage).toHaveBeenCalledWith(expect.objectContaining({
        userId: 7, childName: '김민서', optionLabels: ['볼'], action: 'registered'
      }));
    });

    it('이미 신청한 건이면 변경 알림으로 보낸다', async () => {
      EventRegistration.getByEventAndStudent.mockResolvedValue({ status: 'registered', optionIds: ['opt_b'] });
      req.body = { optionIds: ['opt_a'] };

      await registerChild(req, res);

      expect(sendEventRegistrationKakaoMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updated' })
      );
    });

    it('알림이 실패해도 신청은 정상 응답한다', async () => {
      sendEventRegistrationKakaoMessage.mockRejectedValueOnce(new Error('kakao down'));
      req.body = { optionIds: ['opt_a'] };

      await registerChild(req, res);

      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].status).toBe('registered');
    });
  });

  describe('cancelChild (취소)', () => {
    beforeEach(() => {
      Event.getPublishedForParent.mockResolvedValue(openEvent);
      req.params = { id: '5', childId: '1' };
    });

    it('신청을 취소한다', async () => {
      EventRegistration.cancel.mockResolvedValue({ status: 'cancelled', cancelledAfterConfirm: false });

      await cancelChild(req, res);

      expect(EventRegistration.cancel).toHaveBeenCalledWith(5, 100);
      expect(res.json).toHaveBeenCalledWith({ status: 'cancelled', cancelledAfterConfirm: false });
    });

    it('확정된 신청을 취소하면 표시가 남는다', async () => {
      EventRegistration.cancel.mockResolvedValue({ status: 'cancelled', cancelledAfterConfirm: true });

      await cancelChild(req, res);

      expect(res.json.mock.calls[0][0].cancelledAfterConfirm).toBe(true);
      // 확정 후 취소는 선생님이 바로 알아야 한다
      expect(sendEventRegistrationKakaoMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'cancelled_after_confirm' })
      );
    });

    it('보통 취소는 취소 알림으로 보낸다', async () => {
      EventRegistration.cancel.mockResolvedValue({ status: 'cancelled', cancelledAfterConfirm: false, optionIds: [] });

      await cancelChild(req, res);

      expect(sendEventRegistrationKakaoMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'cancelled' })
      );
    });

    it('접수가 끝난 뒤에는 취소할 수 없다', async () => {
      Event.getPublishedForParent.mockResolvedValue({ ...openEvent, registrationOpen: false });

      await cancelChild(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(EventRegistration.cancel).not.toHaveBeenCalled();
    });

    it('신청 내역이 없으면 404', async () => {
      EventRegistration.cancel.mockResolvedValue(null);

      await cancelChild(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('여러 선생님과 연결된 학부모 (docs/accounts-roles §5.6~5.7)', () => {
    beforeEach(() => {
      ParentTeacher.listTeachers.mockResolvedValue([teacherA, teacherB]);
      ParentTeacher.teacherIds.mockResolvedValue([7, 8]);
      ParentChild.listByParent.mockResolvedValue([linkedChild, otherTeacherChild]);
    });

    it('일정은 연결된 선생님 전부를 스코프로 조회한다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([]);

      await getEvents(req, res);

      expect(Event.listUpcomingForParent.mock.calls[0][0]).toEqual([7, 8]);
      expect(res.json.mock.calls[0][0].teachers).toHaveLength(2);
    });

    it('선생님 필터를 주면 그 선생님 일정만 조회한다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([]);
      req.query.teacherId = '8';

      await getEvents(req, res);

      expect(Event.listUpcomingForParent.mock.calls[0][0]).toEqual([8]);
    });

    it('연결되지 않은 선생님으로 필터하면 무시하고 전체를 본다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([]);
      req.query.teacherId = '999';

      await getEvents(req, res);

      expect(Event.listUpcomingForParent.mock.calls[0][0]).toEqual([7, 8]);
    });

    it('이벤트 카드에 어느 선생님 일정인지 담는다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([openEvent]);

      await getEvents(req, res);

      const event = res.json.mock.calls[0][0].events[0];
      expect(event.teacherId).toBe(7);
      expect(event.teacherName).toBe('이재림');
    });

    it('이벤트마다 그 선생님의 아이만 신청 후보로 담는다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([openEvent]);

      await getEvents(req, res);

      // 이재림 선생님 대회에 박지우 선생님 아이(김나윤)는 나오지 않는다
      const names = res.json.mock.calls[0][0].events[0].children.map((c) => c.childName);
      expect(names).toEqual(['김민서']);
    });

    it('다른 선생님의 아이로는 신청할 수 없다 (404)', async () => {
      Event.getPublishedForParent.mockResolvedValue(openEvent);
      req.params = { id: '5', childId: '3' }; // 김나윤 = 박지우 선생님 아이

      await registerChild(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(EventRegistration.upsertRegistered).not.toHaveBeenCalled();
    });

    it('연결되지 않은 선생님의 이벤트는 상세도 404 (존재를 알리지 않는다)', async () => {
      Event.getPublishedForParent.mockResolvedValue(null);
      req.params.id = '99';

      await getEvent(req, res);

      expect(Event.getPublishedForParent).toHaveBeenCalledWith('99', [7, 8]);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('알림은 학부모의 소속이 아니라 **이벤트를 만든 선생님**에게 간다', async () => {
      const eventOfB = { ...openEvent, id: 6, userId: 8, teacherName: '박지우' };
      Event.getPublishedForParent.mockResolvedValue(eventOfB);
      EventRegistration.upsertRegistered.mockResolvedValue({ status: 'registered', optionIds: [] });
      req.params = { id: '6', childId: '3' }; // 박지우 선생님 아이

      await registerChild(req, res);

      expect(sendEventRegistrationKakaoMessage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 8 })
      );
    });
  });

  describe('addChildren — 선생님 선택 (FR-355)', () => {
    beforeEach(() => {
      ParentChild.listByParent.mockResolvedValue([]);
      ParentChild.create.mockImplementation(async (data) => ({ id: 1, ...data }));
      Student.getAll.mockResolvedValue([]);
      req.body = { children: [{ name: '김나윤', birthdate: '2019-06-15' }] };
    });

    it('선생님이 1명이면 자동으로 그 선생님으로 정한다', async () => {
      await addChildren(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(7, 'user');
      expect(ParentChild.create).toHaveBeenCalledWith(expect.objectContaining({ teacherId: 7 }));
    });

    it('선생님이 여럿인데 고르지 않으면 400 으로 되묻는다', async () => {
      ParentTeacher.listTeachers.mockResolvedValue([teacherA, teacherB]);

      await addChildren(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].needsTeacher).toBe(true);
      expect(ParentChild.create).not.toHaveBeenCalled();
    });

    it('고른 선생님의 학생 명단에서만 매칭한다', async () => {
      ParentTeacher.listTeachers.mockResolvedValue([teacherA, teacherB]);
      Student.getAll.mockResolvedValue([{ id: 200, name: '김나윤', birthdate: '2019-06-15' }]);
      req.body.teacherId = 8;

      await addChildren(req, res);

      expect(Student.getAll).toHaveBeenCalledWith(8, 'user');
      expect(ParentChild.create).toHaveBeenCalledWith(
        expect.objectContaining({ teacherId: 8, studentId: 200 })
      );
    });

    it('연결되지 않은 선생님을 고르면 400', async () => {
      ParentTeacher.listTeachers.mockResolvedValue([teacherA]);
      req.body.teacherId = 999;

      await addChildren(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ParentChild.create).not.toHaveBeenCalled();
    });
  });

  describe('addTeacher — 초대 링크로 선생님 추가 (FR-353)', () => {
    it('유효한 초대면 연결을 더한다', async () => {
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 8 });
      ParentInvite.isUsable.mockReturnValue(true);
      ParentTeacher.isLinked.mockResolvedValue(false);
      ParentTeacher.listTeachers.mockResolvedValue([teacherA, teacherB]);
      req.body = { invite: 'TOK' };

      await addTeacher(req, res);

      expect(ParentAccount.create).toHaveBeenCalledWith({ userId: 20, teacherId: 8, inviteId: 3 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].teachers).toHaveLength(2);
    });

    it('초대 링크 전체를 붙여넣어도 받아준다', async () => {
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 8 });
      ParentInvite.isUsable.mockReturnValue(true);
      req.body = { invite: 'https://rg-manager.vercel.app/invite/TOK9' };

      await addTeacher(req, res);

      expect(ParentInvite.getByToken).toHaveBeenCalledWith('TOK9');
    });

    it('이미 연결된 선생님이면 200 으로 알려준다', async () => {
      ParentInvite.getByToken.mockResolvedValue({ id: 3, userId: 7 });
      ParentInvite.isUsable.mockReturnValue(true);
      ParentTeacher.isLinked.mockResolvedValue(true);
      req.body = { invite: 'TOK' };

      await addTeacher(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].alreadyLinked).toBe(true);
    });

    it('무효한 초대는 400', async () => {
      ParentInvite.getByToken.mockResolvedValue(null);
      ParentInvite.isUsable.mockReturnValue(false);
      req.body = { invite: 'GONE' };

      await addTeacher(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(ParentAccount.create).not.toHaveBeenCalled();
    });

    it('빈 입력은 400', async () => {
      req.body = {};

      await addTeacher(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
