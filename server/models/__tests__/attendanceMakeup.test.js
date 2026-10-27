import { jest } from '@jest/globals';

// DB 없이 "어떤 SQL 을 어떤 값으로 보냈는가" 만 본다.
const query = jest.fn();
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const Attendance = (await import('../Attendance.js')).default;

const sqlOf = (call) => call[0].replace(/\s+/g, ' ').trim();

beforeEach(() => {
  query.mockReset();
});

describe('Attendance.createMany — 보강 출석 여러 명', () => {
  it('학생 여러 명을 INSERT 한 번으로 넣고 넣은 줄을 돌려준다', async () => {
    query.mockResolvedValue({ rows: [{ studentId: 1 }, { studentId: 2 }] });

    const rows = await Attendance.createMany({ studentIds: [1, 2], classId: 3, date: '2026-10-27' }, 7);

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params.slice(0, 4)).toEqual([[1, 2], 3, '2026-10-27', 7]);
    expect(typeof params[4]).toBe('string'); // checkedAt
    expect(rows).toEqual([{ studentId: 1 }, { studentId: 2 }]);
  });

  it('같은 날 같은 수업에 이미 있는 학생은 건너뛴다 (제약이 없어도, 동시에 와도)', async () => {
    query.mockResolvedValue({ rows: [] });
    await Attendance.createMany({ studentIds: [1], classId: 3, date: '2026-10-27' }, 7);

    const sql = sqlOf(query.mock.calls[0]);
    expect(sql).toContain('FROM unnest($1::int[]) AS s(id)');
    expect(sql).toContain('WHERE NOT EXISTS ( SELECT 1 FROM attendance a WHERE a."studentId" = s.id AND a."classId" = $2 AND a.date = $3 )');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('RETURNING *');
  });

  it('학생이 없으면 DB 에 가지 않는다', async () => {
    expect(await Attendance.createMany({ studentIds: [], classId: 3, date: '2026-10-27' }, 7)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
