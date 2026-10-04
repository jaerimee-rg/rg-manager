import {
  countByStatus, formatPhoneInput, formatRequestedAt, normalizePhone, reservationRange, reservationStatus,
  validateReservationForm
} from '../shopReservation';

// 서버 utils/__tests__/shopReservation.test.js 와 같은 표 — 규칙을 바꾸면 두 쪽을 함께 바꾼다
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

describe('normalizePhone (서버와 같은 표)', () => {
  it.each(PHONES)('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ value: expected });
  });

  it.each(BAD_PHONES)('%s 는 받지 않는다', (raw) => {
    expect(normalizePhone(raw)).toEqual({ error: '전화번호를 정확히 입력해 주세요' });
  });

  it('비어 있으면 입력하라고 한다', () => {
    expect(normalizePhone('  ')).toEqual({ error: '전화번호를 입력해 주세요' });
  });
});

describe('formatPhoneInput — 치는 동안 하이픈', () => {
  it.each([
    ['010', '010'],
    ['0101', '010-1'],
    ['0101234', '010-1234'],
    ['01012345', '010-1234-5'],
    ['01012345678', '010-1234-5678'],
    ['010123456789', '010-1234-5678'],
    ['010-1234-5678', '010-1234-5678'],
    ['02', '02'],
    ['0212', '02-12'],
    ['021234567', '02-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['0311234567', '031-123-4567'],
    ['03112345678', '031-1234-5678']
  ])('%s → %s', (raw, expected) => {
    expect(formatPhoneInput(raw)).toBe(expected);
  });

  it('+82 처럼 다른 글자가 섞이면 손대지 않는다', () => {
    expect(formatPhoneInput('+82 10')).toBe('+82 10');
  });
});

describe('validateReservationForm', () => {
  const TODAY = '2026-10-04';

  it('통과하면 다듬은 이름·하이픈 넣은 번호·날짜', () => {
    expect(validateReservationForm({ name: ' 예림엄마 ', phone: '01012345678', date: '2026-10-10' }, TODAY)).toEqual({
      value: { name: '예림엄마', phone: '010-1234-5678', date: '2026-10-10' },
      errors: null
    });
  });

  it('세 칸 모두 필수 — 서버와 같은 메시지', () => {
    expect(validateReservationForm({ name: '', phone: '', date: '' }, TODAY).errors).toEqual({
      name: '이름을 입력해 주세요',
      phone: '전화번호를 입력해 주세요',
      date: '예약 날짜를 골라 주세요'
    });
  });

  it('오늘부터 180일 뒤까지만', () => {
    const { max } = reservationRange(TODAY);
    expect(max).toBe('2027-04-02');
    const at = (date) => validateReservationForm({ name: '김예림', phone: '01012345678', date }, TODAY).errors;
    expect(at(TODAY)).toBeNull();
    expect(at(max)).toBeNull();
    expect(at('2026-10-03')).toEqual({ date: '오늘 이후 날짜를 골라 주세요' });
    expect(at('2027-04-03')).toEqual({ date: '예약은 180일 안의 날짜만 받아요' });
  });

  it('이름은 30자까지', () => {
    expect(validateReservationForm({ name: '가'.repeat(31), phone: '01012345678', date: TODAY }, TODAY).errors)
      .toEqual({ name: '이름은 30자까지 입력할 수 있어요' });
  });
});

describe('선생님 목록 도우미', () => {
  it('상태 이름·색', () => {
    expect(reservationStatus('requested')).toMatchObject({ label: '요청', tone: 'warning' });
    expect(reservationStatus('confirmed')).toMatchObject({ label: '확정', tone: 'success' });
    expect(reservationStatus('cancelled')).toMatchObject({ label: '취소', tone: 'neutral' });
  });

  it('상태별 개수', () => {
    expect(countByStatus([{ status: 'requested' }, { status: 'requested' }, { status: 'cancelled' }])).toEqual({
      all: 3, requested: 2, confirmed: 0, cancelled: 1
    });
    expect(countByStatus()).toEqual({ all: 0, requested: 0, confirmed: 0, cancelled: 0 });
  });

  it('요청 시각은 브라우저 시간으로 M/D HH:mm', () => {
    const iso = new Date(2026, 9, 4, 9, 5).toISOString();
    expect(formatRequestedAt(iso)).toBe('10/4 09:05');
    expect(formatRequestedAt(null)).toBe('');
    expect(formatRequestedAt('nope')).toBe('');
  });
});
