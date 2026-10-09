import {
  DESCRIPTOR_LENGTH,
  isValidDescriptor,
  encodeDescriptor,
  decodeDescriptor,
  faceDistance,
  classifyDistance,
  bestPerStudent,
  FACE_ANALYZER_VERSION,
  parseAnalyzerVersion,
  DEFAULT_MATCH_THRESHOLD,
  DEFAULT_CANDIDATE_THRESHOLD,
  FACE_MATCH_RULES_VERSION,
  matchRulesSignature
} from '../faceVector.js';

const makeDescriptor = (fill = 0.1) => Array.from({ length: DESCRIPTOR_LENGTH }, (_, i) => fill + i * 0.001);

/** 앞 두 칸만 쓰는 단위 벡터 — 두 벡터의 코사인 유사도가 cos(각도 차) 라서 거리를 정확히 만들 수 있다. */
const atAngle = (radians) => {
  const v = new Float32Array(DESCRIPTOR_LENGTH);
  v[0] = Math.cos(radians);
  v[1] = Math.sin(radians);
  return v;
};
/** 기준(각도 0)과의 코사인 거리가 distance 인 벡터 */
const atDistance = (distance) => atAngle(Math.acos(1 - distance));

describe('isValidDescriptor', () => {
  it('512개의 유한한 수만 통과시킨다 (ArcFace)', () => {
    expect(isValidDescriptor(makeDescriptor())).toBe(true);
  });

  it('길이가 다르면 거절한다 — 예전 face-api 의 128차원도', () => {
    expect(isValidDescriptor([1, 2, 3])).toBe(false);
    expect(isValidDescriptor(new Array(128).fill(0.1))).toBe(false);
  });

  it('NaN·Infinity 가 섞이면 거절한다 (거리 계산이 오염된다)', () => {
    const bad = makeDescriptor();
    bad[7] = NaN;
    expect(isValidDescriptor(bad)).toBe(false);

    const worse = makeDescriptor();
    worse[3] = Infinity;
    expect(isValidDescriptor(worse)).toBe(false);
  });

  it('배열이 아니면 거절한다', () => {
    expect(isValidDescriptor(null)).toBe(false);
    expect(isValidDescriptor('0.1,0.2')).toBe(false);
  });

  it('Float32Array 도 받는다 (브라우저가 보낸 형태)', () => {
    expect(isValidDescriptor(Float32Array.from(makeDescriptor()))).toBe(true);
  });
});

describe('encodeDescriptor / decodeDescriptor', () => {
  it('넣은 값을 그대로 돌려준다 (float32 정밀도 안에서)', () => {
    const original = makeDescriptor(0.5);
    const decoded = decodeDescriptor(encodeDescriptor(original));

    expect(decoded).toHaveLength(DESCRIPTOR_LENGTH);
    original.forEach((value, i) => expect(decoded[i]).toBeCloseTo(value, 5));
  });

  it('실제 얼굴 벡터에서 base64 가 JSON 의 60% 보다 작다 (저장·파싱 비용을 아낀다)', () => {
    // 얼굴 분석기가 내는 값은 -0.044195 처럼 소수점이 길다(소수 6자리로 보낸다).
    const realistic = Array.from({ length: DESCRIPTOR_LENGTH }, (_, i) => Number((Math.sin(i) * 0.0441953).toFixed(6)));

    expect(encodeDescriptor(realistic)).toHaveLength(2732);   // 512 * 4 바이트 고정
    expect(2732).toBeLessThan(JSON.stringify(realistic).length * 0.6);
  });

  it('올바르지 않은 값은 저장 단계에서 막는다', () => {
    expect(() => encodeDescriptor([1, 2])).toThrow('얼굴 특징값');
  });

  it('깨진 값을 읽으면 null 이다 (한 행 때문에 매칭 전체가 죽지 않게)', () => {
    expect(decodeDescriptor('not-base64!!')).toBeNull();
    expect(decodeDescriptor('')).toBeNull();
    expect(decodeDescriptor(null)).toBeNull();
    expect(decodeDescriptor(Buffer.from('too short').toString('base64'))).toBeNull();
  });

  it('예전 face-api 의 128차원 값은 null — 매칭에서 빠진다(다시 분석·다시 등록해야 한다)', () => {
    const old = Buffer.from(new Float32Array(128).fill(0.1).buffer).toString('base64');
    expect(old).toHaveLength(684);
    expect(decodeDescriptor(old)).toBeNull();
  });
});

describe('faceDistance — 코사인 거리', () => {
  it('같은 방향은 0, 직각은 1, 반대는 2', () => {
    expect(faceDistance(atAngle(0), atAngle(0))).toBeCloseTo(0, 6);
    expect(faceDistance(atAngle(0), atAngle(Math.PI / 2))).toBeCloseTo(1, 6);
    expect(faceDistance(atAngle(0), atAngle(Math.PI))).toBeCloseTo(2, 6);
  });

  it('길이(크기)는 상관없다 — 방향만 본다', () => {
    const a = Float32Array.from(makeDescriptor());
    const doubled = a.map((v) => v * 2);
    expect(faceDistance(a, doubled)).toBeCloseTo(0, 6);
  });

  it('유사도 0.65 는 거리 0.35', () => {
    expect(faceDistance(atAngle(0), atDistance(0.35))).toBeCloseTo(0.35, 5);
  });

  it('한쪽이 없거나 길이가 다르거나 0 벡터면 Infinity (매칭 안 됨으로 취급)', () => {
    expect(faceDistance(null, Float32Array.from(makeDescriptor()))).toBe(Infinity);
    expect(faceDistance(Float32Array.from([1, 2]), Float32Array.from([1, 2, 3]))).toBe(Infinity);
    expect(faceDistance(new Float32Array(DESCRIPTOR_LENGTH), atAngle(0))).toBe(Infinity);
  });
});

describe('classifyDistance', () => {
  it('기본값은 코사인 거리 0.35 / 0.50 — 유사도 0.65 이상 자동 태그, 0.50 이상 후보', () => {
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.35);
    expect(DEFAULT_CANDIDATE_THRESHOLD).toBe(0.50);
  });

  it('같은 아이의 정면 사진(운영 실측 유사도 0.71~0.88)은 자동 태그다', () => {
    expect(classifyDistance(1 - 0.88)).toBe('face');
    expect(classifyDistance(1 - 0.71)).toBe('face');
    expect(classifyDistance(0.35)).toBe('face');
  });

  it('옆얼굴·눈 감은 기준 사진처럼 애매한 구간(유사도 0.50~0.65)은 학부모가 고르는 후보다', () => {
    expect(classifyDistance(1 - 0.61)).toBe('candidate');
    expect(classifyDistance(1 - 0.51)).toBe('candidate');
    expect(classifyDistance(0.50)).toBe('candidate');
  });

  it('다른 아이(운영 실측 유사도 0.40 이하)는 태그하지 않는다', () => {
    expect(classifyDistance(1 - 0.46)).toBeNull();
    expect(classifyDistance(1 - 0.40)).toBeNull();
    expect(classifyDistance(Infinity)).toBeNull();
  });

  it('관리자가 임계값을 조정하면 그대로 따른다', () => {
    expect(classifyDistance(0.45, { match: 0.4, candidate: 0.6 })).toBe('candidate');
    expect(classifyDistance(0.35, { match: 0.4, candidate: 0.6 })).toBe('face');
  });
});

describe('bestPerStudent', () => {
  it('학생마다 가장 가까운 얼굴 하나만 남긴다', () => {
    const faces = [
      { id: 1, descriptor: atAngle(0) },
      { id: 2, descriptor: atDistance(0.1) }
    ];
    const profiles = [{ studentId: 10, descriptor: atAngle(0) }];

    const result = bestPerStudent(faces, profiles);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ studentId: 10, faceId: 1 });
    expect(result[0].distance).toBeCloseTo(0, 6);
  });

  it('기준 얼굴이 여러 장이면 그 중 가장 가까운 값을 쓴다', () => {
    const faces = [{ id: 5, descriptor: atDistance(0.2) }];
    const profiles = [
      { studentId: 3, descriptor: atAngle(Math.PI) },
      { studentId: 3, descriptor: atDistance(0.2) }
    ];

    expect(bestPerStudent(faces, profiles)[0].distance).toBeCloseTo(0, 6);
  });

  it('거리 오름차순으로 돌려준다', () => {
    const faces = [
      { id: 1, descriptor: atAngle(0) },
      { id: 2, descriptor: atAngle(Math.PI / 2) }
    ];
    const profiles = [
      { studentId: 1, descriptor: atAngle(0.3) },
      { studentId: 2, descriptor: atAngle(Math.PI / 2 + 0.05) }
    ];

    expect(bestPerStudent(faces, profiles).map((r) => r.studentId)).toEqual([2, 1]);
  });

  it('한 얼굴은 가장 가까운 아이 한 명에게만 붙는다 — 같은 얼굴이 두 아이로 태그되지 않는다', () => {
    const faces = [{ id: 1, descriptor: atAngle(0) }];
    const profiles = [
      { studentId: 41, descriptor: atDistance(0.1) },
      { studentId: 15, descriptor: atDistance(0.2) }
    ];

    expect(bestPerStudent(faces, profiles)).toEqual([{ studentId: 41, distance: expect.any(Number), faceId: 1 }]);
  });

  it('두 얼굴이면 각자 가장 가까운 아이에게 간다', () => {
    const faces = [
      { id: 1, descriptor: atAngle(0) },
      { id: 2, descriptor: atAngle(Math.PI / 2) }
    ];
    const profiles = [
      { studentId: 41, descriptor: atAngle(0.05) },
      { studentId: 15, descriptor: atAngle(Math.PI / 2 - 0.05) }
    ];

    const result = bestPerStudent(faces, profiles);
    expect(result.map((r) => [r.studentId, r.faceId]).sort()).toEqual([[15, 2], [41, 1]]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(bestPerStudent([], [])).toEqual([]);
    expect(bestPerStudent(null, null)).toEqual([]);
  });

  it('벡터가 없는 행은 건너뛴다', () => {
    const faces = [{ id: 1, descriptor: null }];
    const profiles = [{ studentId: 1, descriptor: atAngle(0) }];
    expect(bestPerStudent(faces, profiles)).toEqual([]);
  });
});

describe('얼굴 찾기 방식 버전', () => {
  it('지금 방식은 3 — InsightFace buffalo_l (client/src/utils/faceClient.js · face_engine/service.py 와 같은 값)', () => {
    expect(FACE_ANALYZER_VERSION).toBe(3);
  });

  it('브라우저가 보낸 값은 양의 정수만 받고, 나머지는 기록 없음(null) — 예전 방식으로 취급된다', () => {
    expect(parseAnalyzerVersion(2)).toBe(2);
    expect(parseAnalyzerVersion('2')).toBe(2);
    expect(parseAnalyzerVersion(undefined)).toBeNull();
    expect(parseAnalyzerVersion(null)).toBeNull();
    expect(parseAnalyzerVersion(0)).toBeNull();
    expect(parseAnalyzerVersion(-1)).toBeNull();
    expect(parseAnalyzerVersion(1.5)).toBeNull();
    expect(parseAnalyzerVersion('abc')).toBeNull();
    expect(parseAnalyzerVersion(1e6)).toBeNull();
  });
});

describe('matchRulesSignature — 앨범 태그를 어떤 규칙으로 계산했는지', () => {
  it('방식 버전 + 두 임계값. 하나라도 바뀌면 서명이 달라진다', () => {
    expect(FACE_MATCH_RULES_VERSION).toBe(3);
    expect(matchRulesSignature({ match: 0.35, candidate: 0.5 })).toBe('r3:0.35:0.5');
    expect(matchRulesSignature({ match: 0.35, candidate: 0.4 })).not.toBe(matchRulesSignature({ match: 0.35, candidate: 0.5 }));
  });

  it('임계값이 없으면 기본값으로', () => {
    expect(matchRulesSignature()).toBe('r3:0.35:0.5');
    expect(matchRulesSignature({ match: NaN })).toBe('r3:0.35:0.5');
  });
});
