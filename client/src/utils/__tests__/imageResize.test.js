import { fitSize, toJpegName, isAllowedImageName, resizeForUpload } from '../imageResize';

describe('fitSize — 긴 변 1,200px, 비율 유지, 키우지 않는다', () => {
  it.each([
    [[4000, 3000], { width: 1200, height: 900 }],
    [[3000, 4000], { width: 900, height: 1200 }],
    [[800, 600], { width: 800, height: 600 }],
    [[1200, 1200], { width: 1200, height: 1200 }]
  ])('%j → %j', ([w, h], expected) => {
    expect(fitSize(w, h)).toEqual(expected);
  });
});

describe('파일 이름', () => {
  it('줄인 결과는 .jpg', () => {
    expect(toJpegName('리본.PNG')).toBe('리본.jpg');
    expect(toJpegName('photo.heic.webp')).toBe('photo.heic.jpg');
    expect(toJpegName('')).toBe('image.jpg');
  });

  it('jpg · png · webp · gif 만 받는다 (svg 없음)', () => {
    expect(isAllowedImageName('a.JPG')).toBe(true);
    expect(isAllowedImageName('a.gif')).toBe(true);
    expect(isAllowedImageName('a.svg')).toBe(false);
    expect(isAllowedImageName('a.heic')).toBe(false);
    expect(isAllowedImageName('a')).toBe(false);
  });
});

describe('resizeForUpload', () => {
  const file = (name) => new File(['x'], name, { type: 'image/gif' });

  it('GIF 는 움직임을 지키려고 그대로 보낸다', async () => {
    const f = file('a.gif');
    await expect(resizeForUpload(f)).resolves.toEqual({ blob: f, filename: 'a.gif' });
  });

  it('브라우저가 이미지를 못 읽으면 원본을 그대로 보낸다', async () => {
    const f = file('a.jpg');
    global.createImageBitmap = jest.fn(() => Promise.reject(new Error('decode')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(resizeForUpload(f)).resolves.toEqual({ blob: f, filename: 'a.jpg' });
    delete global.createImageBitmap;
  });
});
