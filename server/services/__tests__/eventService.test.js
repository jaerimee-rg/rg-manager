import {
  canRegister,
  eventStartMs,
  eventEndMs,
  todayKst,
  normalizeOptions,
  parseOptions,
  isKnownType,
  competitionToEventFields
} from '../eventService.js';

// 2026-08-23 09:41 KST
const NOW = Date.parse('2026-08-23T09:41:00+09:00');
const linked = { status: 'linked', studentId: 1 };
const pending = { status: 'pending', studentId: null };

const base = {
  type: 'competition',
  date: '2026-09-12',
  startTime: '09:00',
  isPublished: true,
  registrationOpen: true,
  registrationDeadline: null
};

describe('todayKst', () => {
  it('UTC 자정 이후라도 한국 날짜를 돌려준다', () => {
    expect(todayKst(Date.parse('2026-08-22T16:00:00Z'))).toBe('2026-08-23');
    expect(todayKst(Date.parse('2026-08-23T14:59:00Z'))).toBe('2026-08-23');
  });
});

describe('eventStartMs / eventEndMs', () => {
  it('시간이 없으면 당일 00:00 KST 로 본다', () => {
    expect(eventStartMs({ date: '2026-09-12' })).toBe(Date.parse('2026-09-12T00:00:00+09:00'));
  });

  it('기간 이벤트는 종료일 끝까지 유효하다', () => {
    expect(eventEndMs({ date: '2026-08-25', endDate: '2026-08-27' }))
      .toBe(Date.parse('2026-08-27T23:59:59+09:00'));
  });
});

describe('canRegister', () => {
  it('조건이 모두 맞으면 신청할 수 있다', () => {
    expect(canRegister(base, linked, NOW)).toEqual({ ok: true, reason: null });
  });

  it('휴관일은 신청 대상이 아니다', () => {
    expect(canRegister({ ...base, type: 'closure' }, linked, NOW).reason).toBe('none');
  });

  it('비공개 이벤트는 신청할 수 없다', () => {
    expect(canRegister({ ...base, isPublished: false }, linked, NOW).reason).toBe('hidden');
  });

  it('접수를 닫아두면 신청할 수 없다', () => {
    expect(canRegister({ ...base, registrationOpen: false }, linked, NOW).reason).toBe('closed');
  });

  it('마감 일시가 지나면 신청할 수 없다', () => {
    const past = { ...base, registrationDeadline: '2026-08-20T23:59:00+09:00' };
    expect(canRegister(past, linked, NOW).reason).toBe('deadline');

    const future = { ...base, registrationDeadline: '2026-09-01T23:59:00+09:00' };
    expect(canRegister(future, linked, NOW).ok).toBe(true);
  });

  it('이미 시작한 이벤트는 신청할 수 없다', () => {
    expect(canRegister({ ...base, date: '2026-08-22' }, linked, NOW).reason).toBe('started');
  });

  it('오늘 시작하는 이벤트도 시작 시각이 지났으면 막는다', () => {
    expect(canRegister({ ...base, date: '2026-08-23', startTime: '09:00' }, linked, NOW).reason).toBe('started');
    expect(canRegister({ ...base, date: '2026-08-23', startTime: '18:00' }, linked, NOW).ok).toBe(true);
  });

  it('확인 대기 자녀는 신청할 수 없다', () => {
    expect(canRegister(base, pending, NOW).reason).toBe('child_pending');
    expect(canRegister(base, null, NOW).reason).toBe('child_pending');
  });

  it('이벤트가 없으면 not_found', () => {
    expect(canRegister(null, linked, NOW).reason).toBe('not_found');
  });
});

describe('normalizeOptions', () => {
  it('문자열 목록에 id 를 붙인다', () => {
    const out = normalizeOptions(['맨손', '볼']);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('맨손');
    expect(out[0].id).toMatch(/^opt_[0-9a-f]{8}$/);
  });

  it('기존 옵션의 id 는 라벨을 고쳐도 유지된다', () => {
    const prev = [{ id: 'opt_aaaaaaaa', label: '맨손' }];
    const out = normalizeOptions([{ id: 'opt_aaaaaaaa', label: '맨손(수정)' }], prev);
    expect(out[0].id).toBe('opt_aaaaaaaa');
    expect(out[0].label).toBe('맨손(수정)');
  });

  it('모르는 id 는 새로 발급한다', () => {
    const out = normalizeOptions([{ id: 'opt_unknown', label: 'X' }], []);
    expect(out[0].id).not.toBe('opt_unknown');
  });

  it('같은 id 가 두 번 오면 뒤엣것에 새 id 를 준다', () => {
    const prev = [{ id: 'opt_aaaaaaaa', label: 'A' }];
    const out = normalizeOptions(
      [{ id: 'opt_aaaaaaaa', label: 'A' }, { id: 'opt_aaaaaaaa', label: 'B' }],
      prev
    );
    expect(out[0].id).toBe('opt_aaaaaaaa');
    expect(out[1].id).not.toBe('opt_aaaaaaaa');
  });

  it('빈 라벨은 버리고, 최대 20개까지만 받는다', () => {
    expect(normalizeOptions(['', '   ', 'A'])).toHaveLength(1);
    expect(normalizeOptions(Array.from({ length: 30 }, (_, i) => `옵션${i}`))).toHaveLength(20);
  });

  it('라벨은 30자로 자른다', () => {
    expect(normalizeOptions(['가'.repeat(50)])[0].label).toHaveLength(30);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions('맨손')).toEqual([]);
  });
});

describe('parseOptions', () => {
  it('JSON 문자열을 배열로 만든다', () => {
    expect(parseOptions('[{"id":"opt_1","label":"볼"}]')).toEqual([{ id: 'opt_1', label: '볼' }]);
  });

  it('깨진 값은 빈 배열로 흘린다', () => {
    expect(parseOptions('{oops')).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions('{"a":1}')).toEqual([]);
  });
});

describe('isKnownType / competitionToEventFields', () => {
  it('허용된 종류만 참', () => {
    expect(isKnownType('competition')).toBe(true);
    expect(isKnownType('running')).toBe(false);
  });

  it('대회 행을 이벤트 필드로 옮긴다', () => {
    const c = { id: 7, name: '서울시 대회', date: '2026-09-12', location: '올림픽공원', userId: 3 };
    expect(competitionToEventFields(c)).toEqual({
      userId: 3, type: 'competition', title: '서울시 대회',
      date: '2026-09-12', location: '올림픽공원', competitionId: 7
    });
  });
});
