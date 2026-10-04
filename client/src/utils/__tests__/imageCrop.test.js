import {
  DEFAULT_CROP, MAX_ZOOM, clampCrop, isDefaultCrop, coverSize, cropRect, panCrop, cropStyle, cropToSquare
} from '../imageCrop';

const LANDSCAPE = { width: 2000, height: 1000 };
const PORTRAIT = { width: 900, height: 1800 };
const SQUARE = { width: 1000, height: 1000 };

describe('cropRect — 원본에서 잘라 낼 정사각형', () => {
  it('기본값은 가운데 정사각형 (짧은 변 그대로)', () => {
    expect(cropRect(LANDSCAPE, DEFAULT_CROP)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
    expect(cropRect(PORTRAIT, DEFAULT_CROP)).toEqual({ sx: 0, sy: 450, sw: 900, sh: 900 });
  });

  it('x 0 은 왼쪽 끝, 1 은 오른쪽 끝', () => {
    expect(cropRect(LANDSCAPE, { x: 0, y: 0.5, zoom: 1 }).sx).toBe(0);
    expect(cropRect(LANDSCAPE, { x: 1, y: 0.5, zoom: 1 }).sx).toBe(1000);
  });

  it('확대하면 고른 점을 중심으로 더 작은 부분을 자른다', () => {
    expect(cropRect(SQUARE, { x: 0.5, y: 0.5, zoom: 2 })).toEqual({ sx: 250, sy: 250, sw: 500, sh: 500 });
    expect(cropRect(SQUARE, { x: 0, y: 1, zoom: 2 })).toEqual({ sx: 0, sy: 500, sw: 500, sh: 500 });
  });

  it('어떤 값이어도 원본 밖으로 나가지 않는다', () => {
    [LANDSCAPE, PORTRAIT, SQUARE].forEach((size) => {
      [0, 0.3, 1].forEach((x) => [0, 0.7, 1].forEach((y) => [1, 1.7, MAX_ZOOM].forEach((zoom) => {
        const r = cropRect(size, { x, y, zoom });
        expect(r.sx).toBeGreaterThanOrEqual(-1e-9);
        expect(r.sy).toBeGreaterThanOrEqual(-1e-9);
        expect(r.sx + r.sw).toBeLessThanOrEqual(size.width + 1e-9);
        expect(r.sy + r.sh).toBeLessThanOrEqual(size.height + 1e-9);
      })));
    });
  });
});

describe('panCrop — 끌어서 옮기기', () => {
  it('오른쪽으로 끌면 사진의 왼쪽이 더 보인다 (x 가 줄어든다)', () => {
    const next = panCrop(DEFAULT_CROP, LANDSCAPE, 0.25, 0);
    expect(next.x).toBeCloseTo(0.25);
    expect(next.y).toBe(0.5);
  });

  it('넘치는 부분이 없는 방향으로는 움직이지 않는다 (가로 사진의 세로)', () => {
    expect(panCrop(DEFAULT_CROP, LANDSCAPE, 0, 0.4).y).toBe(0.5);
    expect(panCrop(DEFAULT_CROP, SQUARE, 0.4, 0.4)).toEqual(DEFAULT_CROP);
  });

  it('확대하면 정사각형 사진도 움직일 수 있고, 끝을 넘지 않는다', () => {
    expect(panCrop({ x: 0.5, y: 0.5, zoom: 2 }, SQUARE, -0.25, 0).x).toBeCloseTo(0.75);
    expect(panCrop({ x: 0.5, y: 0.5, zoom: 2 }, SQUARE, -5, 5)).toEqual({ x: 1, y: 0, zoom: 2 });
  });
});

describe('clampCrop · isDefaultCrop · coverSize', () => {
  it('범위를 넘는 값은 끝으로, 이상한 값은 기본값으로', () => {
    expect(clampCrop({ x: -1, y: 2, zoom: 9 })).toEqual({ x: 0, y: 1, zoom: MAX_ZOOM });
    expect(clampCrop({ x: NaN, y: undefined, zoom: 0 })).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  });

  it('기본 자르기인지', () => {
    expect(isDefaultCrop(DEFAULT_CROP)).toBe(true);
    expect(isDefaultCrop({ x: 0.5, y: 0.5, zoom: 1.2 })).toBe(false);
  });

  it('짧은 변을 1 로 맞춘 크기', () => {
    expect(coverSize(LANDSCAPE)).toEqual({ w: 2, h: 1 });
    expect(coverSize(PORTRAIT)).toEqual({ w: 1, h: 2 });
  });
});

describe('cropStyle — 미리보기는 cropRect 와 같은 부분을 보인다', () => {
  it('기본값은 가운데, 확대 없음', () => {
    expect(cropStyle(DEFAULT_CROP)).toEqual({
      objectFit: 'cover', objectPosition: '50.00% 50.00%', transformOrigin: '50.00% 50.00%', transform: undefined
    });
  });

  it('확대는 고른 점을 기준으로', () => {
    expect(cropStyle({ x: 0.2, y: 1, zoom: 1.5 })).toMatchObject({
      objectPosition: '20.00% 100.00%', transformOrigin: '20.00% 100.00%', transform: 'scale(1.5)'
    });
  });
});

describe('cropToSquare', () => {
  const realBitmap = global.createImageBitmap;
  afterEach(() => { global.createImageBitmap = realBitmap; });

  it('자르기를 안 바꾼 GIF 는 움직임이 남도록 원본 그대로', async () => {
    const gif = new File(['g'], '리본.gif', { type: 'image/gif' });
    global.createImageBitmap = jest.fn();
    await expect(cropToSquare(gif, DEFAULT_CROP)).resolves.toEqual({ blob: gif, filename: '리본.gif' });
    expect(global.createImageBitmap).not.toHaveBeenCalled();
  });

  it('브라우저가 사진을 못 읽으면 원본을 보낸다', async () => {
    const png = new File(['p'], 'a.png', { type: 'image/png' });
    global.createImageBitmap = jest.fn().mockRejectedValue(new Error('decode'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(cropToSquare(png, DEFAULT_CROP)).resolves.toEqual({ blob: png, filename: 'a.png' });
  });

  it('고른 범위를 정사각형으로 그린다 (한 변 최대 1,200px)', async () => {
    const draw = jest.fn();
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    global.createImageBitmap = jest.fn().mockResolvedValue({ width: 3000, height: 2000, close: jest.fn() });
    const canvas = {
      getContext: () => ({ fillRect: jest.fn(), drawImage: draw, set fillStyle(v) {} }),
      toBlob: (cb) => cb(blob)
    };
    jest.spyOn(document, 'createElement').mockImplementation(() => canvas);

    const out = await cropToSquare(new File(['p'], '리본.png'), { x: 0, y: 0.5, zoom: 1 });

    expect(out).toEqual({ blob, filename: '리본.jpg' });
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1200);
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 2000, 0, 0, 1200, 1200);
    document.createElement.mockRestore();
  });
});
