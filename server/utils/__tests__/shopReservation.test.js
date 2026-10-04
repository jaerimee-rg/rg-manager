import {
  RESERVATION_MAX_DAYS_AHEAD,
  addDaysIso,
  isIsoDate,
  isReservationStatus,
  normalizePhone,
  validateReservationInput
} from '../shopReservation.js';

// 클라이언트 utils/__tests__/shopReservation.test.js 와 같은 표 — 규칙을 바꾸면 두 쪽을 함께 바꾼다
const PHONES = [
  ['01012345678', '010-1234-5678'],
  ['010-1234-5678', '010-1234-5678'],
  [' 010 1234 5678 ', '010-1234-5678'],
  ['0111234567', '011-123-4567'],
  ['+82 10-1234-5678', '010-1234-5678'],
  ['+82 010-1234-5678', '010-1234-5678'],
  ['021234567', '02-123-4567'],
  ['0212345678', '02-1234-5678'],
  ['031-123-4567', '031-123-4567'],
  ['0311234567', '031-123-4567']
];
const BAD_PHONES = ['123', '1012345678', '010123', '010123456789', '02123456', 'abc', '0212345678901'];

describe('normalizePhone', () => {
  it.each(PHONES)('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ value: expected });
  });

  it.each(BAD_PHONES)('%s 는 받지 않는다', (raw) => {
    expect(normalizePhone(raw)).toEqual({ error: '전화번호를 정확히 입력해 주세요' });
  });

  it('비어 있으면 입력하라고 한다', () => {
    expect(normalizePhone('')).toEqual({ error: '전화번호를 입력해 주세요' });
    expect(normalizePhone(null)).toEqual({ error: '전화번호를 입력해 주세요' });
  });
});

describe('날짜 도우미', () => {
  it('실제 있는 날짜만 YYYY-MM-DD 로 받는다', () => {
    expect(isIsoDate('2026-10-04')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-4')).toBe(false);
    expect(isIsoDate('2026-10-04T00:00')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('날짜에 일수를 더한다 — 달·해를 넘어도', () => {
    expect(addDaysIso('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-10-04', 180)).toBe('2027-04-02');
  });

  it('상태는 요청·확정·취소 셋', () => {
    expect(['requested', 'confirmed', 'cancelled'].every(isReservationStatus)).toBe(true);
    expect(isReservationStatus('done')).toBe(false);
    expect(isReservationStatus(undefined)).toBe(false);
  });
});

describe('validateReservationInput', () => {
  const TODAY = '2026-10-04';

  it('이름은 다듬고 전화번호는 하이픈을 넣는다', () => {
    expect(validateReservationInput({ name: '  김예림 ', phone: '01012345678', date: '2026-10-10' }, TODAY)).toEqual({
      value: { name: '김예림', phone: '010-1234-5678', reservedDate: '2026-10-10' },
      errors: null
    });
  });

  it('세 칸 모두 필수다', () => {
    expect(validateReservationInput({}, TODAY).errors).toEqual({
      name: '이름을 입력해 주세요',
      phone: '전화번호를 입력해 주세요',
      date: '예약 날짜를 골라 주세요'
    });
    expect(validateReservationInput(undefined, TODAY).errors).not.toBeNull();
  });

  it('이름은 30자까지', () => {
    const ok = validateReservationInput({ name: '가'.repeat(30), phone: '01012345678', date: TODAY }, TODAY);
    expect(ok.errors).toBeNull();
    const long = validateReservationInput({ name: '가'.repeat(31), phone: '01012345678', date: TODAY }, TODAY);
    expect(long.errors).toEqual({ name: '이름은 30자까지 입력할 수 있어요' });
  });

  it('오늘부터 180일 뒤까지만 — 어제·181일 뒤·없는 날짜는 거절', () => {
    const at = (date) => validateReservationInput({ name: '김예림', phone: '01012345678', date }, TODAY).errors;
    expect(at(TODAY)).toBeNull();
    expect(at(addDaysIso(TODAY, RESERVATION_MAX_DAYS_AHEAD))).toBeNull();
    expect(at('2026-10-03')).toEqual({ date: '오늘 이후 날짜를 골라 주세요' });
    expect(at(addDaysIso(TODAY, RESERVATION_MAX_DAYS_AHEAD + 1))).toEqual({ date: '예약은 180일 안의 날짜만 받아요' });
    expect(at('2026-02-30')).toEqual({ date: '예약 날짜를 다시 골라 주세요' });
  });
});
