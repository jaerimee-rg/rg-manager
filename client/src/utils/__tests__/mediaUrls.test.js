import { thumbnailUrl, analysisImageUrl, MIN_IMAGE_SIZE } from '../mediaUrls';

describe('mediaUrls — 서버 utils/mediaSerializer.js 와 같은 주소', () => {
  it('썸네일은 정사각형 WebP 를 641 로 받는다 — 640 이하는 Drive 가 미리 만든 썸네일이라 세로 사진이 누워서 온다', () => {
    expect(MIN_IMAGE_SIZE).toBe(641);
    expect(thumbnailUrl('f1')).toBe('https://lh3.googleusercontent.com/d/f1=w641-h641-c-rw');
    // 예전처럼 크기를 넘겨도 작아지지 않는다
    expect(thumbnailUrl('f1', 200)).toBe(thumbnailUrl('f1'));
  });

  it('파일 id 를 감싸고, 없으면 null', () => {
    expect(thumbnailUrl('a b')).toBe('https://lh3.googleusercontent.com/d/a%20b=w641-h641-c-rw');
    expect(thumbnailUrl(null)).toBeNull();
  });

  it('얼굴 분석용 사진은 그대로 긴 변 1920', () => {
    expect(analysisImageUrl('f1')).toBe('https://lh3.googleusercontent.com/d/f1=s1920');
  });
});
