import {
  addButtonLabel,
  attendedStudentIds,
  makeupResultMessage,
  pendingStudentIds,
  searchStudents,
  toggleId
} from '../makeupAttendance';

const records = [
  { studentId: 1, classId: 10 },
  { studentId: 2, classId: 10 },
  { studentId: 3, classId: 20 },
];

describe('attendedStudentIds — 그 수업에 이미 출석한 학생', () => {
  it('고른 수업의 기록만 본다 (select 값은 문자열로 온다)', () => {
    expect([...attendedStudentIds(records, '10')]).toEqual([1, 2]);
    expect([...attendedStudentIds(records, 20)]).toEqual([3]);
  });

  it('수업을 안 골랐거나 기록이 없으면 비어 있다', () => {
    expect(attendedStudentIds(records, '').size).toBe(0);
    expect(attendedStudentIds(undefined, '10').size).toBe(0);
  });
});

describe('toggleId — 고른 학생 넣고 빼기', () => {
  it('없으면 뒤에 붙이고, 있으면 뺀다 (고른 순서 유지)', () => {
    expect(toggleId([3, 1], 2)).toEqual([3, 1, 2]);
    expect(toggleId([3, 1, 2], 1)).toEqual([3, 2]);
  });
});

describe('pendingStudentIds — 실제로 추가할 학생', () => {
  it('이미 출석한 학생은 빼고 고른 순서를 지킨다', () => {
    expect(pendingStudentIds([5, 2, 7], new Set([2]))).toEqual([5, 7]);
  });
});

describe('searchStudents — 이름 검색', () => {
  const students = [{ id: 1, name: '김하늘' }, { id: 2, name: '이바다' }];

  it('검색어가 없거나 공백뿐이면 전부', () => {
    expect(searchStudents(students, '')).toBe(students);
    expect(searchStudents(students, '  ')).toBe(students);
  });

  it('이름 일부와 초성으로 찾는다', () => {
    expect(searchStudents(students, '하늘').map((s) => s.id)).toEqual([1]);
    expect(searchStudents(students, 'ㅇㅂ').map((s) => s.id)).toEqual([2]);
  });
});

describe('addButtonLabel', () => {
  it('고른 인원을 보여 준다', () => {
    expect(addButtonLabel(0)).toBe('추가');
    expect(addButtonLabel(3)).toBe('3명 추가');
  });
});

describe('makeupResultMessage — 결과 안내', () => {
  it('모두 넣었으면 인원만', () => {
    expect(makeupResultMessage({ added: [1, 2], skipped: [] })).toBe('보강 출석 2명을 추가했어요.');
  });

  it('일부를 건너뛰었으면 함께 알린다', () => {
    expect(makeupResultMessage({ added: [1], skipped: [2, 3] })).toBe(
      '보강 출석 1명을 추가했어요. 이미 출석한 2명은 건너뛰었어요.'
    );
  });

  it('하나도 못 넣었으면 그렇다고 알린다', () => {
    expect(makeupResultMessage({ added: [], skipped: [4] })).toBe('고른 학생은 모두 이미 출석해 있어요.');
    expect(makeupResultMessage()).toBe('고른 학생은 모두 이미 출석해 있어요.');
  });
});
