import {
  filterRemainingThisYear, groupByMonth, dDay, formatCardDate, dayLabel, childBadge, reasonText, daysBetween
} from '../parentSchedule';

const TODAY = '2026-08-23';

const events = [
  { id: 1, date: '2026-08-10', title: '지난 대회' },
  { id: 2, date: '2026-08-25', endDate: '2026-08-27', title: '여름 휴관' },
  { id: 3, date: '2026-08-29', startTime: '10:00', title: '러닝' },
  { id: 4, date: '2026-09-12', startTime: '09:00', title: '대회' },
  { id: 5, date: '2026-12-19', title: '발표회' },
  { id: 6, date: '2027-01-10', title: '내년 대회' }
];

describe('filterRemainingThisYear', () => {
  it('오늘 이전 이벤트는 빼고, 올해 것만 남긴다', () => {
    const out = filterRemainingThisYear(events, TODAY).map((e) => e.id);
    expect(out).toEqual([2, 3, 4, 5]);
  });

  it('오늘 시작하는 이벤트는 남긴다', () => {
    const out = filterRemainingThisYear([{ id: 9, date: TODAY }], TODAY);
    expect(out).toHaveLength(1);
  });

  it('시작일이 지났어도 진행 중인 기간 이벤트는 남긴다', () => {
    const out = filterRemainingThisYear([{ id: 9, date: '2026-08-20', endDate: '2026-08-25' }], TODAY);
    expect(out).toHaveLength(1);
  });

  it('날짜순으로 정렬하고, 같은 날은 시간순으로 둔다', () => {
    const out = filterRemainingThisYear([
      { id: 1, date: '2026-09-01', startTime: '14:00' },
      { id: 2, date: '2026-09-01', startTime: '09:00' }
    ], TODAY);
    expect(out.map((e) => e.id)).toEqual([2, 1]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(filterRemainingThisYear(null, TODAY)).toEqual([]);
  });
});

describe('groupByMonth', () => {
  it('월별로 묶고 라벨을 붙인다', () => {
    const groups = groupByMonth(filterRemainingThisYear(events, TODAY));
    expect(groups.map((g) => g.label)).toEqual(['8월', '9월', '12월']);
    expect(groups[0].events).toHaveLength(2);
  });

  it('빈 목록은 빈 배열', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('dDay', () => {
  it('남은 날짜를 세어 준다', () => {
    expect(dDay({ date: '2026-08-26' }, TODAY)).toEqual({ text: 'D-3', urgent: true });
    expect(dDay({ date: '2026-09-12' }, TODAY)).toEqual({ text: 'D-20', urgent: false });
  });

  it('오늘이면 오늘이라고 한다', () => {
    expect(dDay({ date: TODAY }, TODAY)).toEqual({ text: '오늘', urgent: true });
  });

  it('기간 이벤트가 이미 시작했으면 진행 중', () => {
    expect(dDay({ date: '2026-08-20', endDate: '2026-08-27' }, TODAY).text).toBe('진행 중');
  });
});

describe('표시 형식', () => {
  it('기간이면 시작~종료를 함께 보여준다', () => {
    // 기간 이벤트도 시간이 없으면 종일 표시를 그대로 붙인다
    expect(formatCardDate({ date: '2026-08-25', endDate: '2026-08-27' })).toBe('8/25(화) ~ 8/27(목) · 종일');
  });

  it('시간이 없으면 종일', () => {
    expect(formatCardDate({ date: '2026-09-12' })).toBe('9/12(토) · 종일');
    expect(formatCardDate({ date: '2026-09-12', startTime: '09:00' })).toBe('9/12(토) 09:00');
  });

  it('날짜 칸은 일·토를 구분한다', () => {
    expect(dayLabel('2026-09-12')).toEqual({ day: 12, dow: '토', weekend: 'sat' });
    expect(dayLabel('2026-09-13')).toEqual({ day: 13, dow: '일', weekend: 'sun' });
    expect(dayLabel('2026-09-14').weekend).toBe('');
  });

  it('daysBetween 은 날짜 차이를 센다', () => {
    expect(daysBetween('2026-08-23', '2026-08-26')).toBe(3);
    expect(daysBetween('2026-08-23', '2026-08-20')).toBe(-3);
  });
});

describe('childBadge', () => {
  it('신청 상태를 배지로 옮긴다', () => {
    expect(childBadge({ status: 'registered' }).label).toBe('신청 완료');
    expect(childBadge({ status: 'confirmed' }).label).toContain('확정');
    expect(childBadge({ status: null, canRegister: true }).label).toBe('신청 가능');
    expect(childBadge({ status: null, canRegister: false, reason: 'child_pending' }).label).toContain('선생님');
    expect(childBadge({ status: null, canRegister: false, reason: 'deadline' }).label).toBe('접수 마감');
  });

  it('자녀 정보가 없으면 배지도 없다', () => {
    expect(childBadge(null)).toBeNull();
  });
});

describe('reasonText', () => {
  it('사유마다 학부모용 문구를 준다', () => {
    expect(reasonText('child_pending', '준호')).toContain('준호');
    expect(reasonText('deadline')).toContain('마감');
    expect(reasonText('알 수 없음')).toBe('');
  });
});
