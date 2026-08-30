import { suggestStudents, buildStudentView, filterParents, sortParents, hasPending, parentLabel } from '../parentLinking';

const students = [
  { id: 1, name: '김민서', birthdate: '2018-03-05' },
  { id: 2, name: '이하은', birthdate: '2017-07-22' },
  { id: 5, name: '김준호', birthdate: '2020-11-12' }
];

const parents = [
  {
    userId: 101, username: '민서엄마',
    children: [
      { id: 1, childName: '김민서', childBirthdate: '2018-03-05', studentId: 1, status: 'linked' },
      { id: 2, childName: '김 준호', childBirthdate: '2020-11-12', studentId: null, status: 'pending' }
    ]
  },
  {
    userId: 102, username: '하은아빠',
    children: [{ id: 3, childName: '이하은', childBirthdate: '2017-07-22', studentId: 2, status: 'linked' }]
  }
];

describe('suggestStudents', () => {
  it('띄어쓰기가 달라도 같은 이름을 추천한다', () => {
    const child = { childName: '김 준호', childBirthdate: '2020-11-12' };
    expect(suggestStudents(child, students).map((s) => s.id)).toEqual([5]);
  });

  it('이름이 달라도 생일이 같으면 추천한다', () => {
    const child = { childName: '김민준', childBirthdate: '2018-03-05' };
    expect(suggestStudents(child, students).map((s) => s.id)).toEqual([1]);
  });

  it('겹치는 게 없으면 빈 배열', () => {
    expect(suggestStudents({ childName: '홍길동', childBirthdate: '2000-01-01' }, students)).toEqual([]);
  });

  it('자녀가 없으면 빈 배열', () => {
    expect(suggestStudents(null, students)).toEqual([]);
  });
});

describe('buildStudentView', () => {
  it('학생 기준으로 학부모를 모아 준다', () => {
    const rows = buildStudentView(students, parents);
    expect(rows[0].student.name).toBe('김민서');
    expect(rows[0].links.map((l) => l.parent.username)).toEqual(['민서엄마']);
  });

  it('한 학생에 학부모 여러 명을 붙일 수 있다', () => {
    const twoParents = [
      ...parents,
      { userId: 103, username: '민서아빠', children: [{ id: 4, childName: '김민서', childBirthdate: '2018-03-05', studentId: 1, status: 'linked' }] }
    ];
    const rows = buildStudentView(students, twoParents);
    expect(rows[0].links).toHaveLength(2);
  });

  it('확인 대기 자녀를 해당 학생에 추천으로 붙인다', () => {
    const rows = buildStudentView(students, parents);
    const junho = rows.find((r) => r.student.id === 5);
    expect(junho.suggestions.map((s) => s.child.childName)).toEqual(['김 준호']);
    expect(junho.links).toEqual([]);
  });

  it('연결도 추천도 없는 학생은 비어 있다', () => {
    const rows = buildStudentView([{ id: 9, name: '한소율', birthdate: '2019-09-02' }], parents);
    expect(rows[0].links).toEqual([]);
    expect(rows[0].suggestions).toEqual([]);
  });
});

describe('filterParents / sortParents', () => {
  it('학부모 이름으로 찾는다', () => {
    expect(filterParents(parents, '민서엄마').map((p) => p.userId)).toEqual([101]);
  });

  it('아이 이름으로도 찾는다 (공백 무시)', () => {
    expect(filterParents(parents, '김준호').map((p) => p.userId)).toEqual([101]);
  });

  it('검색어가 없으면 전부 돌려준다', () => {
    expect(filterParents(parents, '')).toHaveLength(2);
  });

  it('확인 대기가 있는 학부모를 위로 올린다', () => {
    const sorted = sortParents([parents[1], parents[0]]);
    expect(sorted[0].userId).toBe(101);
  });

  it('hasPending 은 연결 안 된 자녀가 있으면 참', () => {
    expect(hasPending(parents[0])).toBe(true);
    expect(hasPending(parents[1])).toBe(false);
  });
});

describe('parentLabel', () => {
  it('학부모가 정한 이름을 쓴다', () => {
    expect(parentLabel({ displayName: '칸쵸엄마', username: '카카오닉네임' })).toBe('칸쵸엄마');
  });

  it('이름을 정하지 않은 옛 계정은 카카오 닉네임으로 되돌린다', () => {
    expect(parentLabel({ displayName: null, username: '민서엄마' })).toBe('민서엄마');
  });

  it('아무것도 없으면 빈 문자열 (화면이 터지지 않게)', () => {
    expect(parentLabel(undefined)).toBe('');
  });
});

describe('filterParents — 학부모명', () => {
  it('가입 때 정한 이름으로도 찾는다', () => {
    const list = [{ userId: 103, username: '카카오닉네임', displayName: '칸쵸엄마', children: [] }];
    expect(filterParents(list, '칸쵸')).toHaveLength(1);
  });

  it('이름이 없는 옛 계정도 걸러내지 않는다', () => {
    expect(filterParents(parents, '민서엄마')).toHaveLength(1);
  });
});
