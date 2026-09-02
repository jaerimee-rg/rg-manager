import { jest } from '@jest/globals';

// 학생 명단을 만드는 모델은 전부 pool.query 한 줄로 끝나므로, DB 를 띄우지 않고
// "어떤 SQL 을 보냈는가" 만 확인하면 정렬 규칙을 회귀 없이 고정할 수 있다.
const query = jest.fn().mockResolvedValue({ rows: [] });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const Student = (await import('../Student.js')).default;
const Competition = (await import('../Competition.js')).default;
const EventRegistration = (await import('../EventRegistration.js')).default;
const ParentChild = (await import('../ParentChild.js')).default;
const ParentAccount = (await import('../ParentAccount.js')).default;

/** 마지막으로 실행된 SQL 을 공백 하나로 눌러서 돌려준다 */
const lastSql = () => query.mock.calls.at(-1)[0].replace(/\s+/g, ' ').trim();

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [] });
});

describe('학생 명단은 어디서든 이름 가나다순(오름차순)이 기본이다', () => {
  it('Student.getAll — 선생님 화면의 학생 목록', async () => {
    await Student.getAll(7, 'user');
    expect(lastSql()).toBe('SELECT * FROM students WHERE "userId" = $1 ORDER BY name ASC, id ASC');
  });

  it('Student.getAll — 관리자는 필터가 없어도 정렬은 같다', async () => {
    await Student.getAll(1, 'admin');
    expect(lastSql()).toBe('SELECT * FROM students ORDER BY name ASC, id ASC');
  });

  it('Student.getByClassId — 수업별 학생', async () => {
    await Student.getByClassId(3, 7, 'user');
    expect(lastSql()).toContain('ORDER BY name ASC, id ASC');
  });

  it('Student.getByIds — 사진 태그처럼 id 로 모아 올 때도 이름순', async () => {
    await Student.getByIds([9, 2, 5], 7, 'user');
    expect(lastSql()).toContain('ORDER BY name ASC, id ASC');
  });

  it('Competition.getStudents / getStudentsWithEvents — 대회 참가 학생', async () => {
    await Competition.getStudents(1, 7, 'user');
    expect(lastSql()).toContain('ORDER BY s.name ASC, s.id ASC');

    await Competition.getStudentsWithEvents(1, 7, 'user');
    expect(lastSql()).toContain('ORDER BY s.name ASC, s.id ASC');
  });

  it('EventRegistration.listByEvent — 신청 현황은 신청 순서가 아니라 이름순으로 본다', async () => {
    await EventRegistration.listByEvent(4);
    const sql = lastSql();
    expect(sql).toContain('ORDER BY s.name ASC, r.id ASC');
    expect(sql).not.toContain('ORDER BY r."createdAt"');
  });

  it('ParentChild.listByParent — 학부모 화면의 자녀 목록', async () => {
    await ParentChild.listByParent(11);
    // 아직 연결 전인 아이는 students 행이 없으므로 직접 적은 이름으로 정렬한다.
    expect(lastSql()).toContain('ORDER BY COALESCE(s.name, c."childName") ASC, c.id ASC');
  });

  it('ParentAccount.listByTeacher — 학부모별 목록 안의 자녀', async () => {
    await ParentAccount.listByTeacher(7);
    const sql = lastSql();
    expect(sql).toContain('COALESCE(s.name, c."childName") ASC');
    // 학부모 자체는 최근 가입순 유지 — 바뀐 건 한 학부모 안의 자녀 순서다.
    expect(sql).toContain('ORDER BY a."createdAt" DESC');
  });

  it('Student.getByIds — id 가 비면 쿼리를 아예 보내지 않는다 (회귀 방지)', async () => {
    expect(await Student.getByIds([], 7, 'user')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('정렬을 바꿔도 소유권 필터는 그대로다', () => {
  it('Student.getAll 은 admin 이 아니면 userId 를 파라미터로 넘긴다', async () => {
    await Student.getAll(7, 'user');
    expect(query.mock.calls.at(-1)[1]).toEqual([7]);
  });

  it('Student.getByIds 는 admin 이 아니면 ids 와 userId 를 함께 넘긴다', async () => {
    await Student.getByIds([1, 2], 7, 'user');
    expect(query.mock.calls.at(-1)[1]).toEqual([[1, 2], 7]);
  });
});
