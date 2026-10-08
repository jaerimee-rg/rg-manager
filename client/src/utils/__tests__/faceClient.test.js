/**
 * faceClient — "분석 실패(null)" 와 "얼굴 없음([])" 을 구분하고, 큰 얼굴·작은 얼굴을 두 크기로 찾는다.
 *
 * 빈 배열을 보내면 서버는 'none' 으로 적는다. 그래서 모델을 못 받거나 계산이 깨진 사진이 [] 로 나가면
 * "얼굴 없는 사진" 으로 묻힌다 — 그 구분을 여기서 못 박는다.
 */

// 검출 입력 크기별로 돌려줄 결과. detectAllFaces(...) 를 바로 await 하면 상자만,
// .withFaceLandmarks().withFaceDescriptors() 까지 부르면 특징값이 붙은 결과를 준다(face-api 와 같은 모양).
let mockBySize = {};
let mockFailure = null;
const mockLoad = jest.fn();
const mockDescribe = jest.fn();

jest.mock('@vladmandic/face-api', () => {
  const resultsFor = (options) => mockBySize[options.inputSize] || [];
  return {
    nets: {
      tinyFaceDetector: { loadFromUri: (...args) => mockLoad(...args) },
      faceLandmark68TinyNet: { loadFromUri: (...args) => mockLoad(...args) },
      faceRecognitionNet: { loadFromUri: (...args) => mockLoad(...args) }
    },
    TinyFaceDetectorOptions: function TinyFaceDetectorOptions(options) { Object.assign(this, options); },
    detectAllFaces: (_element, options) => {
      const outcome = () => (mockFailure ? Promise.reject(mockFailure) : Promise.resolve(resultsFor(options)));
      const chain = {
        withFaceLandmarks: () => chain,
        withFaceDescriptors: () => { mockDescribe(options.inputSize); return outcome(); },
        then: (resolve, reject) => outcome().then((results) => results.map((r) => r.detection)).then(resolve, reject)
      };
      return chain;
    }
  };
});

import {
  ANALYSIS_LONG_SIDE, FACE_ANALYZER_VERSION, boxOverlap, detectFaces, detectSingleFace, mergeDetections, resetFaceApi
} from '../faceClient';

const face = (x, y, width, height, score = 0.98765) => ({
  detection: { box: { x, y, width, height }, score },
  descriptor: new Float32Array(128).fill(0.25)
});

const canvas = (width = 1000, height = 500) => {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
};

beforeEach(() => {
  resetFaceApi();
  mockBySize = {};
  mockFailure = null;
  mockLoad.mockReset().mockResolvedValue(undefined);
  mockDescribe.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('설정', () => {
  it('찾는 방식 버전 2 · 축소본 긴 변 1920 (server/utils/faceVector.js 와 같은 버전)', () => {
    expect(FACE_ANALYZER_VERSION).toBe(2);
    expect(ANALYSIS_LONG_SIDE).toBe(1920);
  });
});

describe('detectFaces', () => {
  it('찾은 얼굴을 0~1 상대 좌표·128 차원 특징값으로 돌려준다', async () => {
    mockBySize = { 512: [face(100, 50, 200, 100)] };

    const faces = await detectFaces(canvas());

    expect(faces).toHaveLength(1);
    expect(faces[0].box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(faces[0].score).toBe(0.988);
    expect(faces[0].descriptor).toHaveLength(128);
    expect(Array.isArray(faces[0].descriptor)).toBe(true);
    expect(mockLoad).toHaveBeenCalledWith('/models');
  });

  it('512 가 다 찾았으면 1024 는 상자만 보고 특징값은 다시 계산하지 않는다', async () => {
    mockBySize = { 512: [face(100, 50, 200, 100)], 1024: [face(104, 52, 196, 98)] };

    const faces = await detectFaces(canvas());

    expect(faces).toHaveLength(1);
    expect(mockDescribe.mock.calls).toEqual([[512]]);
  });

  it('512 가 놓친 작은 얼굴은 1024 로 찾아 합친다 (운영 단체 사진: 512 로 0명)', async () => {
    mockBySize = {
      512: [face(600, 300, 300, 150, 0.9)],                                   // 크게 나온 한 명
      1024: [face(610, 305, 290, 145, 0.7), face(100, 50, 60, 60, 0.8), face(300, 50, 60, 60, 0.6)]
    };

    const faces = await detectFaces(canvas());

    expect(mockDescribe.mock.calls).toEqual([[512], [1024]]);
    // 겹치는 큰 얼굴은 점수가 높은 512 결과 하나만 남는다
    expect(faces.map((f) => f.score)).toEqual([0.9, 0.8, 0.6]);
  });

  it('너무 작은 얼굴(짧은 변이 긴 변의 2% 미만)은 뺀다 — 세로 사진에서도 같은 기준', async () => {
    // 세로 1000×2000: 높이로 재면 4% 아래(70/2000)지만 긴 변 2000 의 2% 이상이라 남는다
    mockBySize = { 512: [face(100, 100, 70, 70), face(500, 500, 30, 30)] };

    const faces = await detectFaces(canvas(1000, 2000));

    expect(faces).toHaveLength(1);
    expect(faces[0].box.w).toBeCloseTo(0.07);
  });

  it('얼굴이 없으면 빈 배열 — 분석은 됐다', async () => {
    await expect(detectFaces(canvas())).resolves.toEqual([]);
  });

  it('모델을 못 받으면 빈 배열이 아니라 null 이고, 다음 호출에서 다시 받는다', async () => {
    mockLoad.mockRejectedValueOnce(new Error('404 /models/face_recognition_model.bin'));

    await expect(detectFaces(canvas())).resolves.toBeNull();

    // 실패한 로딩은 캐시하지 않는다
    await expect(detectFaces(canvas())).resolves.toEqual([]);
  });

  it('계산 중에 깨지면 null', async () => {
    mockFailure = new Error('WebGL context lost');

    await expect(detectFaces(canvas())).resolves.toBeNull();
  });

  it('이미지를 읽지 못하면 null (Drive 주소 재분석)', async () => {
    const RealImage = global.Image;
    global.Image = class {
      constructor() { this.dataset = {}; }
      set src(_value) { setTimeout(() => this.onerror?.()); }
    };
    try {
      await expect(detectFaces('https://lh3.googleusercontent.com/d/x=s1920')).resolves.toBeNull();
      expect(mockDescribe).not.toHaveBeenCalled();
    } finally {
      global.Image = RealImage;
    }
  });
});

describe('boxOverlap · mergeDetections', () => {
  it('IoU — 같은 상자 1, 안 겹치면 0, 반쯤 겹치면 그 사이', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxOverlap(a, a)).toBe(1);
    expect(boxOverlap(a, { x: 20, y: 0, width: 10, height: 10 })).toBe(0);
    expect(boxOverlap(a, { x: 5, y: 0, width: 10, height: 10 })).toBeCloseTo(50 / 150);
  });

  it('점수 높은 것부터 남기고 겹치는 것은 버린다', () => {
    const merged = mergeDetections([
      face(0, 0, 10, 10, 0.6), face(1, 1, 10, 10, 0.9), face(50, 50, 10, 10, 0.7)
    ]);
    expect(merged.map((r) => r.detection.score)).toEqual([0.9, 0.7]);
  });
});

describe('detectSingleFace (자녀 얼굴 등록)', () => {
  it('분석이 실패하면 "얼굴 없음" 이 아니라 failed', async () => {
    mockLoad.mockRejectedValueOnce(new Error('network'));

    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('얼굴이 없으면 none, 둘 이상이면 multiple', async () => {
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'none' });

    mockBySize = { 512: [face(100, 50, 200, 100), face(600, 50, 200, 100)] };
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'multiple' });
  });

  it('정확히 하나면 특징값을 돌려준다', async () => {
    mockBySize = { 512: [face(100, 50, 200, 100)] };

    const result = await detectSingleFace(canvas());
    expect(result.ok).toBe(true);
    expect(result.descriptor).toHaveLength(128);
  });
});
