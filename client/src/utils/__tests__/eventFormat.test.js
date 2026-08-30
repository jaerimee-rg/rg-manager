import {
  formatDate, formatRange, formatWhen, typeOf, todayString, isPast, isAcceptingRegistration,
  splitDeadline, joinDeadline
} from '../eventFormat';

describe('날짜 표시', () => {
  it('요일까지 붙여 보여준다', () => {
    expect(formatDate('2026-09-12')).toBe('9/12(토)');
    expect(formatDate('2026-08-25')).toBe('8/25(화)');
  });

  it('기간이면 시작~종료로 보여준다', () => {
    expect(formatRange('2026-08-25', '2026-08-27')).toBe('8/25(화) ~ 8/27(목)');
  });

  it('종료일이 같으면 하루로 본다', () => {
    expect(formatRange('2026-08-25', '2026-08-25')).toBe('8/25(화)');
  });

  it('시간이 없으면 종일로 표시한다', () => {
    expect(formatWhen({ date: '2026-09-12' })).toBe('9/12(토) · 종일');
    expect(formatWhen({ date: '2026-09-12', startTime: '09:00' })).toBe('9/12(토) 09:00');
  });
});

describe('typeOf', () => {
  it('모르는 종류는 스페셜로 흘린다', () => {
    expect(typeOf('competition').short).toBe('대회');
    expect(typeOf('nope').short).toBe('스페셜');
  });
});

describe('지난 일정 판정', () => {
  it('종료일이 있으면 종료일 기준으로 본다', () => {
    expect(isPast({ date: '2026-08-20', endDate: '2026-08-27' }, '2026-08-23')).toBe(false);
    expect(isPast({ date: '2026-08-20' }, '2026-08-23')).toBe(true);
    expect(isPast({ date: '2026-08-23' }, '2026-08-23')).toBe(false);
  });

  it('todayString 은 로컬 날짜를 YYYY-MM-DD 로 만든다', () => {
    expect(todayString(new Date(2026, 7, 3))).toBe('2026-08-03');
  });
});

describe('접수 중 판정', () => {
  const now = new Date('2026-08-23T09:41:00');
  const base = { type: 'competition', date: '2026-09-12', registrationOpen: true };

  it('휴관일은 접수 대상이 아니다', () => {
    expect(isAcceptingRegistration({ ...base, type: 'closure' }, now)).toBe(false);
  });

  it('접수를 닫으면 false', () => {
    expect(isAcceptingRegistration({ ...base, registrationOpen: false }, now)).toBe(false);
  });

  it('마감이 지나면 false', () => {
    expect(isAcceptingRegistration({ ...base, registrationDeadline: '2026-08-20T23:59' }, now)).toBe(false);
    expect(isAcceptingRegistration({ ...base, registrationDeadline: '2026-09-01T23:59' }, now)).toBe(true);
  });

  it('지난 이벤트는 false', () => {
    expect(isAcceptingRegistration({ ...base, date: '2026-08-01' }, now)).toBe(false);
  });
});

describe('접수 마감 일시 나누기/합치기', () => {
  it('저장된 값을 날짜·시간 칸으로 나눈다', () => {
    expect(splitDeadline('2026-09-10T18:00:00+09:00')).toEqual({ date: '2026-09-10', time: '18:00' });
  });

  it('시간대가 없던 예전 값도 그대로 읽는다', () => {
    expect(splitDeadline('2026-09-10T18:00')).toEqual({ date: '2026-09-10', time: '18:00' });
  });

  it('마감이 없으면 두 칸 모두 빈 값', () => {
    expect(splitDeadline(null)).toEqual({ date: '', time: '' });
    expect(splitDeadline('')).toEqual({ date: '', time: '' });
  });

  it('날짜와 시간을 합쳐 한국 시간으로 저장한다', () => {
    expect(joinDeadline('2026-09-10', '18:00')).toBe('2026-09-10T18:00:00+09:00');
  });

  it('시간을 비우면 그날 끝(23:59)으로 본다', () => {
    expect(joinDeadline('2026-09-10', '')).toBe('2026-09-10T23:59:00+09:00');
  });

  it('날짜가 없으면 마감 없음', () => {
    expect(joinDeadline('', '18:00')).toBeNull();
    expect(joinDeadline('', '')).toBeNull();
  });

  it('나눴다 합치면 원래 값으로 돌아온다', () => {
    const stored = '2026-09-10T18:00:00+09:00';
    const { date, time } = splitDeadline(stored);
    expect(joinDeadline(date, time)).toBe(stored);
  });

  it('합친 값은 브라우저 시간대와 무관하게 한국 시간으로 읽힌다', () => {
    // +09:00 을 붙이지 않으면 UTC 로 도는 서버에서 9시간 밀린다.
    expect(Date.parse(joinDeadline('2026-09-10', '18:00'))).toBe(Date.parse('2026-09-10T09:00:00Z'));
  });
});
