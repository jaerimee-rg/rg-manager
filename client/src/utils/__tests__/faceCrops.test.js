/**
 * faceCrops — 앨범 [얼굴 찾기] 가 찾은 얼굴을 보여 줄 작은 그림. 상자(0~1)만으로 자르고, 실패해도 던지지 않는다.
 */
import { FACE_CROP_SIZE, cropFaces, faceCropRect } from '../faceCrops';

/** jsdom 은 그림을 받지 않는다 — 주소마다 크기를 정해 두고 src 를 넣으면 바로 onload/onerror 를 부르는 가짜 Image */
let mockSizes = {};
const RealImage = global.Image;
class FakeImage {
  set src(url) {
    this._src = url;
    const size = mockSizes[url];
    setTimeout(() => {
      if (!size) { this.onerror?.(); return; }
      this.naturalWidth = size[0];
      this.naturalHeight = size[1];
      this.onload?.();
    }, 0);
  }

  get src() { return this._src; }
}

let drawImage;
let getContext;
let toDataURL;

beforeEach(() => {
  mockSizes = {};
  global.Image = FakeImage;
  drawImage = jest.fn();
  getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage }));
  let n = 0;
  toDataURL = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/jpeg;base64,crop${(n += 1)}`);
});

afterEach(() => {
  global.Image = RealImage;
  jest.restoreAllMocks();
});

describe('faceCropRect', () => {
  it('얼굴 상자 가운데를 중심으로 긴 변의 1.6배 정사각을 자른다', () => {
    // 1000×500 사진, 얼굴 상자 100×100px (x 400~500, y 200~300) → 160px, 가운데 (450, 250)
    expect(faceCropRect({ x: 0.4, y: 0.4, w: 0.1, h: 0.2 }, 1000, 500)).toEqual({ x: 370, y: 170, size: 160 });
  });

  it('상자가 길쭉하면 긴 쪽에 맞춘다(그림이 찌그러지지 않게 정사각)', () => {
    // 상자 50×100px → 긴 변 100 × 1.6 = 160
    const rect = faceCropRect({ x: 0.5, y: 0.2, w: 0.05, h: 0.2 }, 1000, 500);
    expect(rect.size).toBe(160);
    expect(rect.x + rect.size / 2).toBeCloseTo(525);
    expect(rect.y + rect.size / 2).toBeCloseTo(150);
  });

  it('사진 가장자리 얼굴은 사진 안으로 밀어 넣는다', () => {
    expect(faceCropRect({ x: 0, y: 0, w: 0.1, h: 0.2 }, 1000, 500)).toEqual({ x: 0, y: 0, size: 160 });
    expect(faceCropRect({ x: 0.9, y: 0.8, w: 0.1, h: 0.2 }, 1000, 500)).toEqual({ x: 840, y: 340, size: 160 });
  });

  it('사진을 꽉 채운 얼굴은 사진의 짧은 변까지만 자른다', () => {
    expect(faceCropRect({ x: 0.2, y: 0, w: 0.6, h: 1 }, 1000, 500)).toEqual({ x: 250, y: 0, size: 500 });
  });
});

describe('cropFaces', () => {
  const url = 'https://lh3.googleusercontent.com/d/f1=s1920';
  const faces = [
    { box: { x: 0.4, y: 0.4, w: 0.1, h: 0.2 }, score: 0.9, descriptor: [] },
    { box: { x: 0, y: 0, w: 0.1, h: 0.2 }, score: 0.8, descriptor: [] }
  ];

  it('얼굴마다 같은 순서로 96px JPEG 를 잘라 준다', async () => {
    mockSizes[url] = [1000, 500];

    const crops = await cropFaces(url, faces);

    expect(crops).toEqual(['data:image/jpeg;base64,crop1', 'data:image/jpeg;base64,crop2']);
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.any(FakeImage), 370, 170, 160, 160, 0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.any(FakeImage), 0, 0, 160, 160, 0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', expect.any(Number));
  });

  it('Drive 사진은 CORS 로 읽어야 캔버스에서 꺼낼 수 있다', async () => {
    mockSizes[url] = [1000, 500];
    const created = [];
    global.Image = class extends FakeImage { constructor() { super(); created.push(this); } };

    await cropFaces(url, faces.slice(0, 1));

    expect(created).toHaveLength(1);
    expect(created[0].crossOrigin).toBe('anonymous');
    expect(created[0].src).toBe(url);
  });

  it('사진을 못 읽으면 전부 null 이고 던지지 않는다', async () => {
    await expect(cropFaces(url, faces)).resolves.toEqual([null, null]);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('캔버스에서 꺼내지 못하면(CORS 없는 주소) 그 얼굴만 null', async () => {
    mockSizes[url] = [1000, 500];
    toDataURL.mockImplementationOnce(() => { throw new Error('SecurityError: tainted canvas'); });

    await expect(cropFaces(url, faces)).resolves.toEqual([null, 'data:image/jpeg;base64,crop1']);
  });

  it('캔버스를 쓸 수 없는 브라우저면 null', async () => {
    mockSizes[url] = [1000, 500];
    getContext.mockReturnValue(null);

    await expect(cropFaces(url, faces)).resolves.toEqual([null, null]);
  });

  it('크기가 0 인 상자는 자르지 않는다', async () => {
    mockSizes[url] = [1000, 500];

    await expect(cropFaces(url, [{ box: { x: 0.5, y: 0.5, w: 0, h: 0 } }])).resolves.toEqual([null]);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('얼굴이 없으면 사진을 읽지도 않는다', async () => {
    const created = [];
    global.Image = class extends FakeImage { constructor() { super(); created.push(this); } };

    await expect(cropFaces(url, [])).resolves.toEqual([]);
    expect(created).toHaveLength(0);
  });
});
