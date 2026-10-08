/**
 * faceClient — "분석 실패(null)" 와 "얼굴 없음([])" 을 구분한다.
 *
 * 빈 배열을 보내면 서버는 'none' 으로 적고 다시 분석할 목록에서 뺀다. 그래서 모델을 못 받거나
 * 계산이 깨진 사진이 [] 로 나가면 "얼굴 없는 사진" 으로 영영 묻힌다 — 그 구분을 여기서 못 박는다.
 */

const mockLoad = jest.fn();
const mockDetectAllFaces = jest.fn();

jest.mock('@vladmandic/face-api', () => ({
  nets: {
    tinyFaceDetector: { loadFromUri: (...args) => mockLoad(...args) },
    faceLandmark68TinyNet: { loadFromUri: (...args) => mockLoad(...args) },
    faceRecognitionNet: { loadFromUri: (...args) => mockLoad(...args) }
  },
  TinyFaceDetectorOptions: function TinyFaceDetectorOptions(options) { Object.assign(this, options); },
  detectAllFaces: (...args) => mockDetectAllFaces(...args)
}));

import { detectFaces, detectSingleFace, resetFaceApi } from '../faceClient';

/** detectAllFaces(...).withFaceLandmarks(true).withFaceDescriptors() 사슬 */
const chain = (outcome) => {
  const link = { withFaceLandmarks: () => link, withFaceDescriptors: () => outcome };
  return link;
};

const face = (x, y, width, height, score = 0.98765) => ({
  detection: { box: { x, y, width, height }, score },
  descriptor: new Float32Array(128).fill(0.25)
});

const canvas = () => {
  const element = document.createElement('canvas');
  element.width = 1000;
  element.height = 500;
  return element;
};

beforeEach(() => {
  resetFaceApi();
  mockLoad.mockReset().mockResolvedValue(undefined);
  mockDetectAllFaces.mockReset().mockImplementation(() => chain(Promise.resolve([])));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('detectFaces', () => {
  it('찾은 얼굴을 0~1 상대 좌표·128 차원 특징값으로 돌려주고, 너무 작은 얼굴은 뺀다', async () => {
    mockDetectAllFaces.mockImplementation(() => chain(Promise.resolve([
      face(100, 50, 200, 100),
      face(0, 0, 10, 10)          // 가로 1% — 특징값이 흔들려 버린다
    ])));

    const faces = await detectFaces(canvas());

    expect(faces).toHaveLength(1);
    expect(faces[0].box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
    expect(faces[0].score).toBe(0.988);
    expect(faces[0].descriptor).toHaveLength(128);
    expect(Array.isArray(faces[0].descriptor)).toBe(true);
    expect(mockLoad).toHaveBeenCalledWith('/models');
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
    mockDetectAllFaces.mockImplementation(() => chain(Promise.reject(new Error('WebGL context lost'))));

    await expect(detectFaces(canvas())).resolves.toBeNull();
  });

  it('이미지를 읽지 못하면 null', async () => {
    const RealImage = global.Image;
    global.Image = class {
      constructor() { this.dataset = {}; }
      set src(_value) { setTimeout(() => this.onerror?.()); }
    };
    try {
      await expect(detectFaces('https://drive.google.com/thumbnail?id=x')).resolves.toBeNull();
      expect(mockDetectAllFaces).not.toHaveBeenCalled();
    } finally {
      global.Image = RealImage;
    }
  });
});

describe('detectSingleFace (자녀 얼굴 등록)', () => {
  it('분석이 실패하면 "얼굴 없음" 이 아니라 failed', async () => {
    mockLoad.mockRejectedValueOnce(new Error('network'));

    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('얼굴이 없으면 none, 둘 이상이면 multiple', async () => {
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'none' });

    mockDetectAllFaces.mockImplementation(() => chain(Promise.resolve([
      face(100, 50, 200, 100), face(600, 50, 200, 100)
    ])));
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'multiple' });
  });

  it('정확히 하나면 특징값을 돌려준다', async () => {
    mockDetectAllFaces.mockImplementation(() => chain(Promise.resolve([face(100, 50, 200, 100)])));

    const result = await detectSingleFace(canvas());
    expect(result.ok).toBe(true);
    expect(result.descriptor).toHaveLength(128);
  });
});
