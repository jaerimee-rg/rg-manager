import {
  addDays, addMonths, clampIso, compareMonth, formatIsoDate, isWithin, monthOf, monthWeeks, parseIso, toIso, todayIso, weekdayOf
} from '../calendar';

describe('calendar — 날짜는 YYYY-MM-DD 문자열로만', () => {
  it('toIso 는 넘치는 날을 다음 달로 넘긴다', () => {
    expect(toIso(2026, 9, 4)).toBe('2026-10-04');
    expect(toIso(2026, 11, 32)).toBe('2027-01-01');
    expect(toIso(2026, 2, 0)).toBe('2026-02-28');
  });

  it('parseIso · monthOf — 달은 0부터', () => {
    expect(parseIso('2026-10-04')).toEqual({ year: 2026, month: 9, day: 4 });
    expect(monthOf('2026-01-31')).toEqual({ year: 2026, month: 0 });
  });

  it('todayIso 는 브라우저의 로컬 날짜', () => {
    expect(todayIso(new Date(2026, 9, 4, 23, 59))).toBe('2026-10-04');
    expect(todayIso(new Date(2026, 9, 5, 0, 1))).toBe('2026-10-05');
  });

  it('addDays · addMonths — 달·해를 넘는다', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('weekdayOf — 0 이 일요일', () => {
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(weekdayOf('2026-10-10')).toBe(6);
  });

  it('compareMonth', () => {
    expect(compareMonth({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toBe(-1);
    expect(compareMonth({ year: 2027, month: 0 }, { year: 2026, month: 11 })).toBe(1);
    expect(compareMonth({ year: 2026, month: 9 }, { year: 2026, month: 9 })).toBe(0);
  });

  it('monthWeeks — 일요일부터, 늘 6주, 달 밖은 null', () => {
    const weeks = monthWeeks({ year: 2026, month: 9 }); // 2026년 10월 1일은 목요일
    expect(weeks).toHaveLength(6);
    weeks.forEach((week) => expect(week).toHaveLength(7));
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks[4][6]).toBe('2026-10-31');
    expect(weeks[5].every((cell) => cell === null)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('2월(28일, 일요일 시작)도 6주를 채운다', () => {
    const weeks = monthWeeks({ year: 2026, month: 1 }); // 2026-02-01 은 일요일
    expect(weeks[0][0]).toBe('2026-02-01');
    expect(weeks.flat().filter(Boolean)).toHaveLength(28);
    expect(weeks).toHaveLength(6);
  });

  it('isWithin · clampIso — 비운 쪽은 끝이 없다', () => {
    expect(isWithin('2026-10-04', '2026-10-04', '2026-10-10')).toBe(true);
    expect(isWithin('2026-10-03', '2026-10-04', null)).toBe(false);
    expect(isWithin('2099-01-01', null, null)).toBe(true);
    expect(clampIso('2026-10-01', '2026-10-04', '2026-10-10')).toBe('2026-10-04');
    expect(clampIso('2026-11-01', '2026-10-04', '2026-10-10')).toBe('2026-10-10');
  });

  it('formatIsoDate', () => {
    expect(formatIsoDate('2026-10-10')).toBe('10월 10일 (토)');
    expect(formatIsoDate('2026-10-10', { withYear: true })).toBe('2026년 10월 10일 (토)');
    expect(formatIsoDate('')).toBe('');
  });
});
