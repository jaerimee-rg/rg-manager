import { nextTagSource, isHumanSource, mergeMatches } from '../faceMatch.js';

describe('nextTagSource — 02 문서 §1.6 전이표', () => {
  const cases = [
    // [현재, 들어옴, 기대]
    [undefined, 'face', 'face'],
    [undefined, 'candidate', 'candidate'],
    [undefined, 'manual', 'manual'],
    [undefined, 'parent_confirmed', 'parent_confirmed'],
    [undefined, 'excluded', 'excluded'],

    ['candidate', 'face', 'face'],
    ['candidate', 'candidate', 'candidate'],
    ['candidate', 'manual', 'manual'],
    ['candidate', 'parent_confirmed', 'parent_confirmed'],
    ['candidate', 'excluded', 'excluded'],

    ['face', 'face', 'face'],
    ['face', 'candidate', 'keep'],
    ['face', 'manual', 'manual'],
    ['face', 'parent_confirmed', 'parent_confirmed'],
    ['face', 'excluded', 'excluded'],

    ['parent_confirmed', 'face', 'keep'],
    ['parent_confirmed', 'candidate', 'keep'],
    ['parent_confirmed', 'manual', 'manual'],
    ['parent_confirmed', 'excluded', 'excluded'],

    ['manual', 'face', 'keep'],
    ['manual', 'candidate', 'keep'],
    ['manual', 'excluded', 'excluded'],

    ['excluded', 'face', 'keep'],
    ['excluded', 'candidate', 'keep'],
    ['excluded', 'manual', 'manual'],
    ['excluded', 'parent_confirmed', 'parent_confirmed']
  ];

  it.each(cases)('현재 %s + 들어옴 %s → %s', (current, incoming, expected) => {
    expect(nextTagSource(current, incoming)).toBe(expected);
  });

  it('모르는 출처는 무시한다', () => {
    expect(nextTagSource('face', 'nonsense')).toBe('keep');
  });
});

describe('isHumanSource', () => {
  it('사람이 정한 태그를 가려낸다', () => {
    expect(isHumanSource('manual')).toBe(true);
    expect(isHumanSource('parent_confirmed')).toBe(true);
    expect(isHumanSource('excluded')).toBe(true);
    expect(isHumanSource('face')).toBe(false);
    expect(isHumanSource('candidate')).toBe(false);
  });
});

describe('mergeMatches', () => {
  it('새 자동 태그를 추가한다', () => {
    const { upsert, remove } = mergeMatches([], [{ studentId: 1, source: 'face', distance: 0.3, faceId: 9 }]);

    expect(upsert).toEqual([{ studentId: 1, source: 'face', distance: 0.3, faceId: 9 }]);
    expect(remove).toEqual([]);
  });

  it('선생님이 붙인 태그는 재매칭이 덮어쓰지 않는다', () => {
    const existing = [{ studentId: 1, source: 'manual', distance: null, faceId: null }];
    const { upsert, remove } = mergeMatches(existing, [{ studentId: 1, source: 'face', distance: 0.2, faceId: 3 }]);

    expect(upsert).toEqual([]);
    expect(remove).toEqual([]);
  });

  it('아니라고 확인한 사진은 다시 후보로 올라오지 않는다', () => {
    const existing = [{ studentId: 2, source: 'excluded' }];
    const { upsert } = mergeMatches(existing, [{ studentId: 2, source: 'candidate', distance: 0.55, faceId: 1 }]);

    expect(upsert).toEqual([]);
  });

  it('이번 계산에서 빠진 자동 태그는 지운다 (기준 얼굴이 삭제된 경우)', () => {
    const existing = [
      { studentId: 1, source: 'face' },
      { studentId: 2, source: 'candidate' },
      { studentId: 3, source: 'manual' }
    ];

    const { remove } = mergeMatches(existing, []);

    expect(remove.sort()).toEqual([1, 2]);   // manual 은 남는다
  });

  it('값이 그대로면 다시 쓰지 않는다', () => {
    const existing = [{ studentId: 1, source: 'face', distance: 0.3, faceId: 9 }];
    const { upsert } = mergeMatches(existing, [{ studentId: 1, source: 'face', distance: 0.3, faceId: 9 }]);

    expect(upsert).toEqual([]);
  });

  it('거리가 바뀌면 갱신한다', () => {
    const existing = [{ studentId: 1, source: 'face', distance: 0.45, faceId: 9 }];
    const { upsert } = mergeMatches(existing, [{ studentId: 1, source: 'face', distance: 0.31, faceId: 9 }]);

    expect(upsert).toEqual([{ studentId: 1, source: 'face', distance: 0.31, faceId: 9 }]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(mergeMatches()).toEqual({ upsert: [], remove: [] });
  });
});
