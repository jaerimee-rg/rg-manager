import { PERSON_JOIN_DISTANCE, groupFaces } from '../facePeople.js';

// 8차원으로 충분하다 — 묶는 규칙은 길이를 가리지 않는다. angle(θ) 는 e1 과 코사인 유사도가 cos θ 인 단위 벡터.
const DIM = 8;
const axis = (i) => Float32Array.from({ length: DIM }, (_, k) => (k === i ? 1 : 0));
const angle = (degrees, from = 0, toward = 1) => {
  const v = new Float32Array(DIM);
  v[from] = Math.cos((degrees * Math.PI) / 180);
  v[toward] = Math.sin((degrees * Math.PI) / 180);
  return v;
};
const face = (id, mediaId, descriptor, { w = 0.1, score = 0.9 } = {}) => ({
  id, mediaId, box: { x: 0.1, y: 0.1, w, h: w }, score, descriptor
});
const keys = (people) => people.map((person) => person.key);

describe('groupFaces — 앨범 얼굴을 사람별로', () => {
  it('같은 사람은 사진이 달라도 하나로, 사진 많은 사람부터, key 는 가장 작은 얼굴 id', () => {
    const people = groupFaces([
      face(11, 1, axis(0)), face(12, 2, angle(10)), face(13, 3, angle(20)),
      face(21, 2, axis(2)), face(22, 4, angle(15, 2, 3))
    ]);

    expect(people.map(({ key, faceIds, mediaIds, photoCount }) => ({ key, faceIds, mediaIds, photoCount }))).toEqual([
      { key: 'p11', faceIds: [11, 12, 13], mediaIds: [1, 2, 3], photoCount: 3 },
      { key: 'p21', faceIds: [21, 22], mediaIds: [2, 4], photoCount: 2 }
    ]);
  });

  it(`유사도 ${1 - PERSON_JOIN_DISTANCE} 이상이면 같은 사람, 그보다 낮으면 다른 사람`, () => {
    expect(groupFaces([face(1, 1, axis(0)), face(2, 2, angle(59))])).toHaveLength(1);   // cos 59° = 0.515
    expect(groupFaces([face(1, 1, axis(0)), face(2, 2, angle(61))])).toHaveLength(2);   // cos 61° = 0.485
  });

  it('한 사진의 두 얼굴은 아무리 닮아도 다른 사람이다', () => {
    const people = groupFaces([face(1, 7, axis(0)), face(2, 7, axis(0)), face(3, 8, axis(0))]);

    expect(people).toHaveLength(2);
    expect(people.every((person) => person.mediaIds.length === person.faceIds.length)).toBe(true);
  });

  it('표지는 가장 크고 또렷한 얼굴', () => {
    const [person] = groupFaces([
      face(1, 1, axis(0), { w: 0.05 }), face(2, 2, axis(0), { w: 0.2, score: 0.8 }), face(3, 3, axis(0), { w: 0.2, score: 0.6 })
    ]);
    expect(person.cover).toEqual({ faceId: 2, mediaId: 2, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } });
  });

  describe('학생 태그', () => {
    it('태그가 붙은 얼굴이 그 학생 무리가 되고, 닮은 얼굴이 따라 들어오며, 얼굴 없이 손으로 붙인 사진도 센다', () => {
      const people = groupFaces(
        [face(1, 1, axis(0)), face(2, 2, angle(20)), face(3, 3, axis(4))],
        [
          { mediaId: 1, studentId: 41, source: 'face', faceId: 1 },
          { mediaId: 9, studentId: 41, source: 'manual', faceId: null }
        ]
      );

      expect(people[0]).toMatchObject({ key: 'p1', studentId: 41, faceIds: [1, 2], mediaIds: [1, 2, 9], photoCount: 3 });
      expect(people[1]).toMatchObject({ key: 'p3', studentId: null, faceIds: [3] });
    });

    it('후보(candidate)는 같은 아이라는 근거로 쓰지 않는다', () => {
      const people = groupFaces([face(1, 1, axis(0))], [{ mediaId: 1, studentId: 41, source: 'candidate', faceId: 1 }]);
      expect(people[0].studentId).toBeNull();
    });

    it('서로 다른 학생 무리는 아무리 닮아도 합치지 않는다', () => {
      const people = groupFaces(
        [face(1, 1, axis(0)), face(2, 2, angle(5))],
        [
          { mediaId: 1, studentId: 41, source: 'face', faceId: 1 },
          { mediaId: 2, studentId: 42, source: 'manual', faceId: 2 }
        ]
      );
      expect(people.map((person) => person.studentId).sort()).toEqual([41, 42]);
    });

    it('학부모가 [아니에요] 로 뺀 사진의 얼굴은 그 학생 무리에 넣지 않는다', () => {
      const people = groupFaces(
        [face(1, 1, axis(0)), face(2, 2, angle(10))],
        [
          { mediaId: 1, studentId: 41, source: 'face', faceId: 1 },
          { mediaId: 2, studentId: 41, source: 'excluded', faceId: 2 }
        ]
      );
      expect(people).toHaveLength(2);
      expect(people.find((person) => person.studentId === 41).mediaIds).toEqual([1]);
    });

    it('한 얼굴에 태그가 둘이면 손 태그가 이긴다', () => {
      const people = groupFaces(
        [face(1, 1, axis(0))],
        [
          { mediaId: 1, studentId: 41, source: 'face', faceId: 1 },
          { mediaId: 1, studentId: 42, source: 'manual', faceId: 1 }
        ]
      );
      expect(people[0].studentId).toBe(42);
    });
  });

  it('먼저 온 얼굴 탓에 둘로 갈린 무리는 평균이 가까워지면 합친다', () => {
    // 70° 떨어진 두 얼굴은 따로 시작하지만(유사도 0.34), 사이의 35° 얼굴이 들어오면 두 무리 평균이 52.5° 로 가까워진다
    const people = groupFaces([
      face(1, 1, axis(0), { w: 0.3 }), face(2, 2, angle(70), { w: 0.2 }), face(3, 3, angle(35), { w: 0.1 })
    ]);
    expect(keys(people)).toEqual(['p1']);
    expect(people[0].faceIds).toEqual([1, 2, 3]);
  });

  it('입력 순서가 달라도 같은 결과(같은 key) — 목록과 거르기가 따로 묶어도 같은 사람을 가리킨다', () => {
    const faces = [
      face(5, 1, axis(0)), face(6, 2, angle(30)), face(7, 2, axis(3)), face(8, 3, angle(25, 3, 4)), face(9, 4, axis(6))
    ];
    const tags = [{ mediaId: 3, studentId: 41, source: 'face', faceId: 8 }];
    const forward = groupFaces(faces, tags);
    expect(groupFaces([...faces].reverse(), [...tags])).toEqual(forward);
  });

  it('특징값이 없거나 길이가 다른 얼굴은 뺀다', () => {
    expect(groupFaces([])).toEqual([]);
    expect(groupFaces([face(1, 1, null)])).toEqual([]);
    // 길이가 다른 값이 맨 앞에 와도 많은 쪽 길이로 묶는다
    const people = groupFaces([
      face(2, 2, new Float32Array(4).fill(1), { w: 0.5 }), face(1, 1, axis(0)), face(4, 4, axis(0)), face(3, 3, new Float32Array(DIM))
    ]);
    expect(people.map((person) => person.faceIds)).toEqual([[1, 4]]);
  });
});
