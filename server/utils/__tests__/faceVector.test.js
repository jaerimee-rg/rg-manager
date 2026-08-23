import {
  DESCRIPTOR_LENGTH,
  isValidDescriptor,
  encodeDescriptor,
  decodeDescriptor,
  euclideanDistance,
  classifyDistance,
  bestPerStudent
} from '../faceVector.js';

const makeDescriptor = (fill = 0.1) => Array.from({ length: DESCRIPTOR_LENGTH }, (_, i) => fill + i * 0.001);

describe('isValidDescriptor', () => {
  it('128개의 유한한 수만 통과시킨다', () => {
    expect(isValidDescriptor(makeDescriptor())).toBe(true);
  });

  it('길이가 다르면 거절한다', () => {
    expect(isValidDescriptor([1, 2, 3])).toBe(false);
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

  it('실제 얼굴 벡터에서 base64 가 JSON 보다 훨씬 작다 (저장·파싱 비용을 아낀다)', () => {
    // face-api 가 내는 값은 -0.13421569764614105 처럼 소수점이 길다.
    const realistic = Array.from({ length: DESCRIPTOR_LENGTH }, (_, i) => Math.sin(i) * 0.13421569764614105);

    expect(encodeDescriptor(realistic)).toHaveLength(684);   // 128 * 4 바이트 고정
    expect(684).toBeLessThan(JSON.stringify(realistic).length / 2);
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
});

describe('euclideanDistance', () => {
  it('같은 벡터는 0 이다', () => {
    const a = Float32Array.from(makeDescriptor());
    expect(euclideanDistance(a, a)).toBe(0);
  });

  it('차이가 커질수록 거리가 커진다', () => {
    const a = Float32Array.from(new Array(DESCRIPTOR_LENGTH).fill(0));
    const near = Float32Array.from(new Array(DESCRIPTOR_LENGTH).fill(0.01));
    const far = Float32Array.from(new Array(DESCRIPTOR_LENGTH).fill(0.5));

    expect(euclideanDistance(a, near)).toBeLessThan(euclideanDistance(a, far));
  });

  it('한쪽이 없으면 Infinity (매칭 안 됨으로 취급)', () => {
    expect(euclideanDistance(null, Float32Array.from(makeDescriptor()))).toBe(Infinity);
    expect(euclideanDistance(Float32Array.from([1, 2]), Float32Array.from([1, 2, 3]))).toBe(Infinity);
  });
});

describe('classifyDistance', () => {
  it('임계값 이하는 자동 태그다', () => {
    expect(classifyDistance(0.3)).toBe('face');
    expect(classifyDistance(0.5)).toBe('face');
  });

  it('그 사이는 후보다', () => {
    expect(classifyDistance(0.55)).toBe('candidate');
    expect(classifyDistance(0.6)).toBe('candidate');
  });

  it('멀면 태그하지 않는다', () => {
    expect(classifyDistance(0.61)).toBeNull();
    expect(classifyDistance(Infinity)).toBeNull();
  });

  it('관리자가 임계값을 조정하면 그대로 따른다', () => {
    expect(classifyDistance(0.45, { match: 0.4, candidate: 0.5 })).toBe('candidate');
    expect(classifyDistance(0.35, { match: 0.4, candidate: 0.5 })).toBe('face');
  });
});

describe('bestPerStudent', () => {
  const zeros = () => new Array(DESCRIPTOR_LENGTH).fill(0);
  const filled = (v) => new Array(DESCRIPTOR_LENGTH).fill(v);

  it('학생마다 가장 가까운 얼굴 하나만 남긴다', () => {
    const faces = [
      { id: 1, descriptor: Float32Array.from(zeros()) },
      { id: 2, descriptor: Float32Array.from(filled(0.01)) }
    ];
    const profiles = [{ studentId: 10, descriptor: Float32Array.from(zeros()) }];

    const result = bestPerStudent(faces, profiles);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ studentId: 10, faceId: 1, distance: 0 });
  });

  it('기준 얼굴이 여러 장이면 그 중 가장 가까운 값을 쓴다', () => {
    const faces = [{ id: 5, descriptor: Float32Array.from(filled(0.02)) }];
    const profiles = [
      { studentId: 3, descriptor: Float32Array.from(filled(0.5)) },
      { studentId: 3, descriptor: Float32Array.from(filled(0.02)) }
    ];

    expect(bestPerStudent(faces, profiles)[0].distance).toBe(0);
  });

  it('거리 오름차순으로 돌려준다', () => {
    const faces = [{ id: 1, descriptor: Float32Array.from(zeros()) }];
    const profiles = [
      { studentId: 1, descriptor: Float32Array.from(filled(0.05)) },
      { studentId: 2, descriptor: Float32Array.from(filled(0.01)) }
    ];

    expect(bestPerStudent(faces, profiles).map((r) => r.studentId)).toEqual([2, 1]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(bestPerStudent([], [])).toEqual([]);
    expect(bestPerStudent(null, null)).toEqual([]);
  });

  it('벡터가 없는 행은 건너뛴다', () => {
    const faces = [{ id: 1, descriptor: null }];
    const profiles = [{ studentId: 1, descriptor: Float32Array.from(zeros()) }];
    expect(bestPerStudent(faces, profiles)).toEqual([]);
  });
});
