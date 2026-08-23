import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/ParentAccount.js', () => ({
  default: { getByUserId: jest.fn() }
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
const ParentChild = (await import('../../models/ParentChild.js')).default;
const Student = (await import('../../models/Student.js')).default;
const Event = (await import('../../models/Event.js')).default;
const EventRegistration = (await import('../../models/EventRegistration.js')).default;
const { sendEventRegistrationKakaoMessage } = await import('../../utils/kakaoMessage.js');
const { getMe, addChildren, getEvents, getEvent, registerChild, cancelChild } =
  await import('../parentController.js');

const account = { userId: 20, teacherId: 7, teacherName: '이재림' };
const linkedChild = { id: 1, childName: '김민서', childBirthdate: '2018-03-05', status: 'linked', studentId: 100, studentName: '김민서' };
const pendingChild = { id: 2, childName: '김준호', childBirthdate: '2020-11-12', status: 'pending', studentId: null };

// 신청할 수 있는 미래 이벤트를 만든다 (오늘 기준 상대 날짜)
const futureDate = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
};

const openEvent = {
  id: 5, type: 'competition', title: '대회', date: futureDate(20), startTime: '09:00',
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
    ParentAccount.getByUserId.mockResolvedValue(account);
    ParentChild.listByParent.mockResolvedValue([linkedChild, pendingChild]);
    ParentChild.hasStudent.mockResolvedValue(false);
    EventRegistration.listForStudents.mockResolvedValue([]);
    EventRegistration.getByEventAndStudent.mockResolvedValue(null);
  });

  describe('getMe', () => {
    it('선생님 이름과 자녀 목록을 돌려준다', async () => {
      await getMe(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.teacher).toEqual({ name: '이재림' });
      expect(payload.children).toHaveLength(2);
      // 내부 식별자는 노출하지 않는다
      expect(payload.teacher).not.toHaveProperty('id');
    });

    it('학부모 계정이 없으면 404', async () => {
      ParentAccount.getByUserId.mockResolvedValue(null);
      await getMe(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
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
  });

  describe('getEvents (일정)', () => {
    it('오늘~연말 범위로 조회한다', async () => {
      Event.listUpcomingForParent.mockResolvedValue([]);

      await getEvents(req, res);

      const [teacherId, from, to] = Event.listUpcomingForParent.mock.calls[0];
      expect(teacherId).toBe(7);
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

      expect(Event.getPublishedForParent).toHaveBeenCalledWith('5', 7);
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
});
