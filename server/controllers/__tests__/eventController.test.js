import { jest } from '@jest/globals';

const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [{ id: 99 }], rowCount: 1 }),
  release: jest.fn()
};

jest.unstable_mockModule('../../database.js', () => ({
  default: { connect: jest.fn().mockResolvedValue(mockClient), query: jest.fn() }
}));

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: {
    getAll: jest.fn(),
    getById: jest.fn(),
    getByCompetitionId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/EventRegistration.js', () => ({
  default: {
    listByEvent: jest.fn(),
    getById: jest.fn(),
    confirm: jest.fn(),
    upsertRegistered: jest.fn(),
    cancel: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/Competition.js', () => ({
  default: { addStudent: jest.fn(), delete: jest.fn() }
}));

const Event = (await import('../../models/Event.js')).default;
const EventRegistration = (await import('../../models/EventRegistration.js')).default;
const Competition = (await import('../../models/Competition.js')).default;
const {
  getEvents, createEvent, updateEvent, deleteEvent,
  getRegistrations, confirmRegistration, confirmAllRegistrations, registerStudent
} = await import('../eventController.js');

const teacher = { id: 7, username: 't', role: 'user' };

describe('eventController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [{ id: 99 }], rowCount: 1 });
    req = { body: {}, params: {}, query: {}, user: { ...teacher } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('목록', () => {
    it('본인 이벤트만 조회한다', async () => {
      Event.getAll.mockResolvedValue([]);

      await getEvents(req, res);

      expect(Event.getAll).toHaveBeenCalledWith(7, 'user', expect.objectContaining({ includePast: false }));
    });

    it('관리자는 사용자 필터로 다른 선생님 이벤트를 본다', async () => {
      req.user.role = 'admin';
      req.query.filterUserId = '3';
      Event.getAll.mockResolvedValue([]);

      await getEvents(req, res);

      expect(Event.getAll).toHaveBeenCalledWith(3, 'admin', expect.anything());
    });

    it('선생님은 filterUserId 를 줘도 무시된다', async () => {
      req.query.filterUserId = '3';
      Event.getAll.mockResolvedValue([]);

      await getEvents(req, res);

      expect(Event.getAll).toHaveBeenCalledWith(7, 'user', expect.anything());
    });
  });

  describe('등록', () => {
    const valid = { type: 'special', title: '한강 러닝', date: '2026-08-29', location: '여의도', options: ['5km'] };

    it('모르는 종류는 400', async () => {
      req.body = { ...valid, type: 'running' };
      await createEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('이름·날짜가 없으면 400', async () => {
      req.body = { type: 'special', date: '2026-08-29', location: 'x' };
      await createEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.body = { type: 'special', title: 'x', location: 'x' };
      await createEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('휴관일이 아니면 장소가 필요하다', async () => {
      req.body = { type: 'special', title: 'x', date: '2026-08-29' };
      await createEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('휴관일은 장소 없이 등록되고 옵션·접수가 비워진다', async () => {
      req.body = { type: 'closure', title: '여름 휴관', date: '2026-08-25', endDate: '2026-08-27', options: ['x'] };
      Event.create.mockResolvedValue({ id: 1 });

      await createEvent(req, res);

      expect(Event.create).toHaveBeenCalledWith(
        expect.objectContaining({ location: null, options: [], registrationOpen: false, competitionId: null }),
        mockClient
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('종료일이 시작일보다 빠르면 400', async () => {
      req.body = { type: 'closure', title: 'x', date: '2026-08-27', endDate: '2026-08-25' };
      await createEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('스페셜 이벤트는 옵션에 id 를 붙여 저장한다', async () => {
      req.body = valid;
      Event.create.mockResolvedValue({ id: 1 });

      await createEvent(req, res);

      const saved = Event.create.mock.calls[0][0];
      expect(saved.options).toHaveLength(1);
      expect(saved.options[0]).toEqual({ id: expect.stringMatching(/^opt_/), label: '5km' });
      expect(saved.competitionId).toBeNull();
    });

    it('대회형은 competitions 행을 함께 만들어 연결한다', async () => {
      req.body = { ...valid, type: 'competition', title: '서울시 대회' };
      Event.create.mockResolvedValue({ id: 1, competitionId: 99 });

      await createEvent(req, res);

      const insert = mockClient.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO competitions'));
      expect(insert).toBeDefined();
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({ competitionId: 99 }), mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('저장 중 오류가 나면 롤백한다', async () => {
      req.body = valid;
      Event.create.mockRejectedValue(new Error('db down'));

      await createEvent(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('수정', () => {
    const existing = {
      id: 5, type: 'competition', competitionId: 99, userId: 7,
      options: [{ id: 'opt_aaaaaaaa', label: '볼' }, { id: 'opt_bbbbbbbb', label: '후프' }]
    };

    it('없는 이벤트는 404', async () => {
      Event.getById.mockResolvedValue(null);
      req.params.id = '5';
      await updateEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('종류 변경은 거부한다', async () => {
      Event.getById.mockResolvedValue(existing);
      req.params.id = '5';
      req.body = { type: 'special', title: 'x', date: '2026-09-12', location: 'y' };

      await updateEvent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Event.update).not.toHaveBeenCalled();
    });

    it('라벨을 고쳐도 옵션 id 는 유지된다', async () => {
      Event.getById.mockResolvedValue(existing);
      Event.update.mockResolvedValue({ id: 5 });
      EventRegistration.listByEvent.mockResolvedValue([]);
      req.params.id = '5';
      req.body = {
        title: '서울시 대회', date: '2026-09-12', location: '올림픽공원',
        options: [{ id: 'opt_aaaaaaaa', label: '볼(수정)' }, { id: 'opt_bbbbbbbb', label: '후프' }]
      };

      await updateEvent(req, res);

      const saved = Event.update.mock.calls[0][1];
      expect(saved.options[0]).toEqual({ id: 'opt_aaaaaaaa', label: '볼(수정)' });
    });

    it('신청이 걸린 옵션을 지우면 그 수를 알려준다', async () => {
      Event.getById.mockResolvedValue(existing);
      Event.update.mockResolvedValue({ id: 5 });
      EventRegistration.listByEvent.mockResolvedValue([
        { status: 'registered', optionIds: ['opt_bbbbbbbb'] },
        { status: 'registered', optionIds: ['opt_aaaaaaaa'] },
        { status: 'cancelled', optionIds: ['opt_bbbbbbbb'] }
      ]);
      req.params.id = '5';
      req.body = {
        title: '서울시 대회', date: '2026-09-12', location: '올림픽공원',
        options: [{ id: 'opt_aaaaaaaa', label: '볼' }]
      };

      await updateEvent(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ removedOptionRegistrations: 1 }));
    });

    it('대회형은 competitions 행도 함께 갱신한다', async () => {
      Event.getById.mockResolvedValue(existing);
      Event.update.mockResolvedValue({ id: 5 });
      EventRegistration.listByEvent.mockResolvedValue([]);
      req.params.id = '5';
      req.body = { title: '새 이름', date: '2026-09-13', location: '새 장소', options: existing.options };

      await updateEvent(req, res);

      const upd = mockClient.query.mock.calls.find((c) => String(c[0]).includes('UPDATE competitions'));
      expect(upd[1]).toEqual(['새 이름', '2026-09-13', '새 장소', 99]);
    });
  });

  describe('삭제', () => {
    it('대회형을 지우면 대회도 함께 지운다', async () => {
      Event.delete.mockResolvedValue({ id: 5, competitionId: 99 });
      req.params.id = '5';

      await deleteEvent(req, res);

      expect(Competition.delete).toHaveBeenCalledWith(99, 7, 'user');
    });

    it('휴관일 삭제는 대회를 건드리지 않는다', async () => {
      Event.delete.mockResolvedValue({ id: 6, competitionId: null });
      req.params.id = '6';

      await deleteEvent(req, res);

      expect(Competition.delete).not.toHaveBeenCalled();
    });

    it('없는 이벤트는 404', async () => {
      Event.delete.mockResolvedValue(null);
      req.params.id = '5';
      await deleteEvent(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('신청 현황', () => {
    const event = {
      id: 5, type: 'competition', competitionId: 99, title: '대회',
      options: [{ id: 'opt_a', label: '볼' }, { id: 'opt_b', label: '후프' }]
    };

    it('옵션별 집계에서 취소는 빼고 센다', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.listByEvent.mockResolvedValue([
        { id: 1, studentId: 1, status: 'registered', optionIds: ['opt_a', 'opt_b'] },
        { id: 2, studentId: 2, status: 'confirmed', optionIds: ['opt_a'] },
        { id: 3, studentId: 3, status: 'cancelled', optionIds: ['opt_a'] }
      ]);
      req.params.id = '5';

      await getRegistrations(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.summary).toEqual([
        { id: 'opt_a', label: '볼', count: 2 },
        { id: 'opt_b', label: '후프', count: 1 }
      ]);
      expect(payload.activeCount).toBe(2);
    });

    it('지워진 옵션은 "(삭제된 옵션)" 으로 보여준다', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.listByEvent.mockResolvedValue([
        { id: 1, studentId: 1, status: 'registered', optionIds: ['opt_gone'] }
      ]);
      req.params.id = '5';

      await getRegistrations(req, res);

      expect(res.json.mock.calls[0][0].registrations[0].options[0].label).toBe('(삭제된 옵션)');
    });
  });

  describe('확정', () => {
    const event = { id: 5, type: 'competition', competitionId: 99, options: [] };

    it('확정하면 기존 참가 학생에 추가한다', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.getById.mockResolvedValue({ id: 11, eventId: 5, studentId: 3, status: 'registered' });
      EventRegistration.confirm.mockResolvedValue({ id: 11, status: 'confirmed' });
      req.params = { id: '5', regId: '11' };

      await confirmRegistration(req, res);

      expect(Competition.addStudent).toHaveBeenCalledWith(99, 3);
      expect(EventRegistration.confirm).toHaveBeenCalledWith(11);
    });

    it('대회가 아니면 확정할 수 없다', async () => {
      Event.getById.mockResolvedValue({ ...event, type: 'special' });
      req.params = { id: '5', regId: '11' };

      await confirmRegistration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Competition.addStudent).not.toHaveBeenCalled();
    });

    it('취소된 신청은 확정할 수 없다', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.getById.mockResolvedValue({ id: 11, eventId: 5, studentId: 3, status: 'cancelled' });
      req.params = { id: '5', regId: '11' };

      await confirmRegistration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('다른 이벤트의 신청 번호는 404', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.getById.mockResolvedValue({ id: 11, eventId: 6, studentId: 3, status: 'registered' });
      req.params = { id: '5', regId: '11' };

      await confirmRegistration(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('일괄 확정은 신청 상태만 처리한다', async () => {
      Event.getById.mockResolvedValue(event);
      EventRegistration.listByEvent.mockResolvedValue([
        { id: 1, studentId: 1, status: 'registered' },
        { id: 2, studentId: 2, status: 'confirmed' },
        { id: 3, studentId: 3, status: 'cancelled' }
      ]);
      EventRegistration.confirm.mockResolvedValue({});
      req.params.id = '5';

      await confirmAllRegistrations(req, res);

      expect(Competition.addStudent).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ confirmed: 1 });
    });
  });

  describe('선생님 대리 신청', () => {
    it('이벤트에 없는 옵션은 걸러낸다', async () => {
      Event.getById.mockResolvedValue({ id: 5, type: 'special', options: [{ id: 'opt_a', label: '5km' }] });
      EventRegistration.upsertRegistered.mockResolvedValue({ id: 1 });
      req.params = { id: '5', studentId: '3' };
      req.body = { optionIds: ['opt_a', 'opt_zzz'] };

      await registerStudent(req, res);

      expect(EventRegistration.upsertRegistered).toHaveBeenCalledWith(
        expect.objectContaining({ optionIds: ['opt_a'], createdBy: 'teacher', parentUserId: null })
      );
    });

    it('휴관일에는 신청할 수 없다', async () => {
      Event.getById.mockResolvedValue({ id: 6, type: 'closure', options: [] });
      req.params = { id: '6', studentId: '3' };

      await registerStudent(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
