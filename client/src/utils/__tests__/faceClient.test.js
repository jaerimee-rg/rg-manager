/**
 * faceClient — 사진을 얼굴 분석 함수(/api/face-engine/detect)로 보내고, "분석 실패(null)" 와 "얼굴 없음([])" 을 구분한다.
 *
 * 빈 배열을 보내면 서버는 'none' 으로 적는다. 그래서 분석 서버가 꺼졌거나 시간이 넘은 사진이 [] 로 나가면
 * "얼굴 없는 사진" 으로 묻힌다 — 그 구분을 여기서 못 박는다.
 */
jest.mock('../tokenStorage', () => ({ getToken: jest.fn(() => 'tok') }));

import {
  ANALYSIS_LONG_SIDE, DESCRIPTOR_LENGTH, FACE_ANALYZER_VERSION, detectFaces, detectSingleFace, pickMainFace
} from '../faceClient';
import { getToken } from '../tokenStorage';

const vector = (value = 0.01) => new Array(512).fill(value);
const face = (x, y, w, h, score = 0.98765) => ({ box: { x, y, w, h }, score, descriptor: vector() });

const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const canvas = () => {
  const element = document.createElement('canvas');
  // jsdom 은 toBlob 을 그리지 않는다 — 브라우저처럼 JPEG Blob 을 넘겨준다.
  element.toBlob = (callback, type) => callback(new Blob(['jpeg-bytes'], { type }));
  return element;
};

beforeEach(() => {
  global.fetch = jest.fn();
  getToken.mockReturnValue('tok');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  delete global.fetch;
});

describe('설정', () => {
  it('찾는 방식 버전 3 · 축소본 긴 변 1920 · 512차원 (server/utils/faceVector.js · face_engine 과 같은 값)', () => {
    expect(FACE_ANALYZER_VERSION).toBe(3);
    expect(ANALYSIS_LONG_SIDE).toBe(1920);
    expect(DESCRIPTOR_LENGTH).toBe(512);
  });
});

describe('detectFaces', () => {
  it('축소본을 JPEG 로 로그인 토큰과 함께 보내고, 찾은 얼굴을 돌려준다', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ faces: [face(0.1, 0.1, 0.2, 0.2)], analyzerVersion: 3 }));

    const faces = await detectFaces(canvas());

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/face-engine/detect');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'image/jpeg', Authorization: 'Bearer tok' });
    expect(options.body).toBeInstanceOf(Blob);

    expect(faces).toEqual([{ box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, score: 0.988, descriptor: vector() }]);
  });

  it('Drive 주소(재분석)는 그 사진을 받아 그대로 보낸다', async () => {
    const photo = new Blob(['drive-jpeg'], { type: 'image/jpeg' });
    fetch
      .mockResolvedValueOnce({ ok: true, blob: async () => photo })
      .mockResolvedValueOnce(jsonResponse({ faces: [] }));

    await expect(detectFaces('https://lh3.googleusercontent.com/d/x=s1920')).resolves.toEqual([]);

    expect(fetch.mock.calls[0][0]).toBe('https://lh3.googleusercontent.com/d/x=s1920');
    expect(fetch.mock.calls[1][1].body).toBe(photo);
  });

  it('얼굴이 없으면 빈 배열 — 분석은 됐다', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ faces: [] }));
    await expect(detectFaces(canvas())).resolves.toEqual([]);
  });

  it('분석 서버가 실패하면(503·401·500) 빈 배열이 아니라 null', async () => {
    for (const status of [503, 401, 500]) {
      fetch.mockResolvedValueOnce(jsonResponse({ error: 'x' }, status));
      // eslint-disable-next-line no-await-in-loop
      await expect(detectFaces(canvas())).resolves.toBeNull();
    }
  });

  it('연결이 끊기거나 시간이 넘으면 null', async () => {
    fetch.mockRejectedValueOnce(new Error('aborted'));
    await expect(detectFaces(canvas())).resolves.toBeNull();
  });

  it('Drive 사진을 못 받으면 분석을 부르지 않고 null', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(detectFaces('https://lh3.googleusercontent.com/d/x=s1920')).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('캔버스를 JPEG 로 못 만들면 null', async () => {
    const broken = document.createElement('canvas');
    broken.toBlob = (callback) => callback(null);
    await expect(detectFaces(broken)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('응답 모양이 틀리면 null, 특징값 길이가 틀린 얼굴(예전 128차원 등)은 뺀다', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ nope: true }));
    await expect(detectFaces(canvas())).resolves.toBeNull();

    fetch.mockResolvedValueOnce(jsonResponse({ faces: [face(0, 0, 0.1, 0.1), { ...face(0.5, 0.5, 0.1, 0.1), descriptor: new Array(128).fill(0) }] }));
    const faces = await detectFaces(canvas());
    expect(faces).toHaveLength(1);
    expect(faces[0].box.x).toBe(0);
  });

  it('토큰이 없으면 Authorization 없이 보낸다(서버가 401 → null)', async () => {
    getToken.mockReturnValue(null);
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'login' }, 401));

    await expect(detectFaces(canvas())).resolves.toBeNull();
    expect(fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'image/jpeg' });
  });
});

describe('pickMainFace — 자녀 사진의 주인공 얼굴', () => {
  it('하나면 그것, 하나가 다른 얼굴보다 3배 이상 크면 그것', () => {
    const big = face(0.3, 0.2, 0.4, 0.4);
    expect(pickMainFace([big])).toBe(big);
    expect(pickMainFace([face(0.9, 0.9, 0.05, 0.05), big])).toBe(big);
  });

  it('비슷한 크기의 얼굴이 둘이면 누가 아이인지 모른다', () => {
    expect(pickMainFace([face(0, 0, 0.3, 0.3), face(0.5, 0, 0.25, 0.25)])).toBeNull();
    expect(pickMainFace([])).toBeNull();
  });
});

describe('detectSingleFace (자녀 얼굴 등록)', () => {
  it('분석이 실패하면 "얼굴 없음" 이 아니라 failed', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('얼굴이 없으면 none, 비슷한 크기로 둘 이상이면 multiple', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ faces: [] }));
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'none' });

    fetch.mockResolvedValueOnce(jsonResponse({ faces: [face(0.1, 0.1, 0.2, 0.2), face(0.6, 0.1, 0.2, 0.2)] }));
    await expect(detectSingleFace(canvas())).resolves.toEqual({ ok: false, reason: 'multiple' });
  });

  it('뒤에 작게 찍힌 사람이 있어도 아이 얼굴이 확실히 크면 그 특징값을 돌려준다', async () => {
    const child = { ...face(0.3, 0.2, 0.4, 0.4), descriptor: vector(0.02) };
    fetch.mockResolvedValueOnce(jsonResponse({ faces: [face(0.9, 0.05, 0.04, 0.04), child] }));

    const result = await detectSingleFace(canvas());
    expect(result).toEqual({ ok: true, descriptor: vector(0.02), box: child.box });
  });
});
