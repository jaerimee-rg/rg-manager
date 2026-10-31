import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const { default: Competition, pickPaymentChanges } = await import('../Competition.js');

const OPTIONS = JSON.stringify([{ id: 'o1', label: '볼' }, { id: 'o2', label: '의상 대여' }]);
const ROW = { id: 1, name: '김하늘', events: null, paid: true, coachFeePaid: false };

const lastCall = () => {
  const [sql, params] = query.mock.calls.at(-1);
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
};

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('Competition.getStudentsWithEvents — 납부 칸과 신청 항목', () => {
  const load = async (row) => {
    query.mockResolvedValue({ rows: [row] });
    const [student] = await Competition.getStudentsWithEvents(1, 7, 'user');
    return student;
  };

  it('학부모가 고른 옵션을 지금 이벤트의 라벨로 돌려준다', async () => {
    const student = await load({ ...ROW, eventOptions: OPTIONS, registrationOptionIds: '["o2","o1"]', registrationStatus: 'confirmed' });

    expect(student.registrationOptions).toEqual([{ id: 'o2', label: '의상 대여' }, { id: 'o1', label: '볼' }]);
    expect(student.registrationCancelled).toBe(false);
  });

  it('신청 뒤에 지운 옵션은 "(삭제된 옵션)" 으로 남는다', async () => {
    const student = await load({ ...ROW, eventOptions: OPTIONS, registrationOptionIds: '["gone"]', registrationStatus: 'confirmed' });

    expect(student.registrationOptions).toEqual([{ id: 'gone', label: '(삭제된 옵션)' }]);
  });

  it('신청 없이 직접 등록한 학생은 항목이 비어 있다', async () => {
    const student = await load({ ...ROW, eventOptions: OPTIONS, registrationOptionIds: null, registrationStatus: null });

    expect(student.registrationOptions).toEqual([]);
    expect(student.registrationCancelled).toBe(false);
  });

  it('연결된 이벤트가 없는 대회도 깨지지 않는다', async () => {
    const student = await load({ ...ROW, eventOptions: null, registrationOptionIds: null, registrationStatus: null });

    expect(student.registrationOptions).toEqual([]);
  });

  it('확정 후 취소한 학생은 고른 항목과 함께 취소 표시가 나간다', async () => {
    const student = await load({ ...ROW, eventOptions: OPTIONS, registrationOptionIds: '["o1"]', registrationStatus: 'cancelled' });

    expect(student.registrationOptions).toEqual([{ id: 'o1', label: '볼' }]);
    expect(student.registrationCancelled).toBe(true);
  });

  it('납부 칸은 값이 비어 있어도 false 로 나가고, 조인에 쓴 칸은 응답에 남기지 않는다', async () => {
    const student = await load({ ...ROW, photoFeePaid: null, videoFeePaid: true, eventOptions: OPTIONS, registrationOptionIds: '[]', registrationStatus: null });

    expect(student).toMatchObject({
      paid: true, coachFeePaid: false, photoFeePaid: false, videoFeePaid: true, costumeFeePaid: false
    });
    expect(student).not.toHaveProperty('eventOptions');
    expect(student).not.toHaveProperty('registrationOptionIds');
    expect(student).not.toHaveProperty('registrationStatus');
  });

  it('신청은 이 대회의 이벤트에서 찾고, 신청이 없어도 참가 학생을 빠뜨리지 않는다(LEFT JOIN)', async () => {
    await Competition.getStudentsWithEvents(1, 7, 'user');

    const { sql } = lastCall();
    expect(sql).toContain('LEFT JOIN events e ON e."competitionId" = cs."competitionId"');
    expect(sql).toContain('LEFT JOIN event_registrations r ON r."eventId" = e.id AND r."studentId" = cs."studentId"');
  });
});

describe('Competition.updateStudentPaid — 넘어온 칸만 바꾼다', () => {
  it('누른 칸 하나만 SET 한다', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });

    await Competition.updateStudentPaid(3, 9, { photoFeePaid: true });

    const { sql, params } = lastCall();
    expect(sql).toBe('UPDATE competition_students SET "photoFeePaid" = $1 WHERE "competitionId" = $2 AND "studentId" = $3 RETURNING *');
    expect(params).toEqual([true, 3, 9]);
  });

  it('옛 화면이 두 칸을 보내면 새 칸은 건드리지 않는다', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });

    await Competition.updateStudentPaid(3, 9, { paid: true, coachFeePaid: false });

    const { sql, params } = lastCall();
    expect(sql).toContain('SET "paid" = $1, "coachFeePaid" = $2 WHERE "competitionId" = $3 AND "studentId" = $4');
    expect(params).toEqual([true, false, 3, 9]);
  });

  it('목록에 없는 칸 이름은 SQL 에 들어가지 않는다', async () => {
    await Competition.updateStudentPaid(3, 9, { 'paid" = TRUE; --': true, events: true });

    expect(query).not.toHaveBeenCalled();
  });

  it('없는 등록이면 null 을 돌려준다', async () => {
    await expect(Competition.updateStudentPaid(3, 9, { paid: true })).resolves.toBeNull();
  });
});

describe('pickPaymentChanges', () => {
  it('납부 칸의 참/거짓 값만 고른다', () => {
    expect(pickPaymentChanges({ paid: false, costumeFeePaid: true, videoFeePaid: 'true', photoFeePaid: null, name: 'x' }))
      .toEqual({ paid: false, costumeFeePaid: true });
  });

  it('본문이 없어도 빈 객체다', () => {
    expect(pickPaymentChanges(undefined)).toEqual({});
  });
});
