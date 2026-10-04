import { toJpegName, isAllowedImageName } from '../imageResize';

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
