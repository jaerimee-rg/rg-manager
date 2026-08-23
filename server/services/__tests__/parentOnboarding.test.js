import { normalizeDate, normalizeName, matchChild } from '../parentOnboarding.js';

const students = [
  { id: 1, name: '김민서', birthdate: '2018-03-05' },
  { id: 2, name: '이하은', birthdate: '2017-07-22' },
  { id: 3, name: '박서연', birthdate: '2016-01-30' },
  { id: 4, name: '김민서', birthdate: '2019-09-09' } // 동명이인 (생일 다름)
];

describe('normalizeDate', () => {
  it('자리수가 다른 날짜를 맞춰준다', () => {
    expect(normalizeDate('2018-3-5')).toBe('2018-03-05');
    expect(normalizeDate('2018-03-05')).toBe('2018-03-05');
    expect(normalizeDate('2018/3/5')).toBe('2018-03-05');
    expect(normalizeDate('2018.03.05')).toBe('2018-03-05');
    expect(normalizeDate('20180305')).toBe('2018-03-05');
  });

  it('시각이 붙어 있어도 날짜만 본다', () => {
    expect(normalizeDate('2018-03-05T00:00:00.000Z')).toBe('2018-03-05');
  });

  it('빈 값은 빈 문자열', () => {
    expect(normalizeDate(null)).toBe('');
    expect(normalizeDate('')).toBe('');
  });
});

describe('normalizeName', () => {
  it('공백을 모두 지운다', () => {
    expect(normalizeName(' 김 민서 ')).toBe('김민서');
  });
});

describe('matchChild', () => {
  it('이름·생년월일이 정확히 하나 맞으면 연결한다', () => {
    expect(matchChild(students, { name: '김민서', birthdate: '2018-03-05' }))
      .toEqual({ status: 'linked', studentId: 1, candidates: 1 });
  });

  it('공백·날짜 표기가 달라도 연결한다', () => {
    expect(matchChild(students, { name: '김 민서', birthdate: '2018-3-5' }).studentId).toBe(1);
  });

  it('맞는 학생이 없으면 확인 대기', () => {
    expect(matchChild(students, { name: '홍길동', birthdate: '2015-01-01' }))
      .toEqual({ status: 'pending', studentId: null, candidates: 0 });
  });

  it('이름만 같고 생일이 다르면 확인 대기', () => {
    expect(matchChild(students, { name: '김민서', birthdate: '2020-01-01' }).status).toBe('pending');
  });

  it('완전히 같은 학생이 둘이면 확인 대기 (사람이 고르게 한다)', () => {
    const dup = [...students, { id: 5, name: '김민서', birthdate: '2018-03-05' }];
    expect(matchChild(dup, { name: '김민서', birthdate: '2018-03-05' }))
      .toEqual({ status: 'pending', studentId: null, candidates: 2 });
  });

  it('이름이나 생일이 비면 확인 대기', () => {
    expect(matchChild(students, { name: '', birthdate: '2018-03-05' }).status).toBe('pending');
    expect(matchChild(students, { name: '김민서', birthdate: '' }).status).toBe('pending');
  });

  it('학생 목록이 비어도 터지지 않는다', () => {
    expect(matchChild([], { name: '김민서', birthdate: '2018-03-05' }).status).toBe('pending');
    expect(matchChild(null, { name: '김민서', birthdate: '2018-03-05' }).status).toBe('pending');
  });
});
