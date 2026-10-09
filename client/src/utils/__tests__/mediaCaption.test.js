import { CAPTION_MAX, captionChanged, cleanCaption, keyboardInset } from '../mediaCaption';

describe('mediaCaption — 사진·영상 설명', () => {
  it('서버와 같은 길이 한도', () => {
    expect(CAPTION_MAX).toBe(500);
  });

  it('보낼 값: 앞뒤 공백을 지우고 줄바꿈은 \\n 으로, 비었으면 null', () => {
    expect(cleanCaption('  단체전\r\n결승  ')).toBe('단체전\n결승');
    expect(cleanCaption('   ')).toBeNull();
    expect(cleanCaption('')).toBeNull();
    expect(cleanCaption(null)).toBeNull();
    expect(cleanCaption(undefined)).toBeNull();
  });

  it('고친 게 있을 때만 저장한다 — 앞뒤 공백만 다르면 같은 글', () => {
    expect(captionChanged('', null)).toBe(false);
    expect(captionChanged('  무대 ', '무대')).toBe(false);
    expect(captionChanged('무대!', '무대')).toBe(true);
    expect(captionChanged('', '무대')).toBe(true);
    expect(captionChanged('무대', null)).toBe(true);
  });

  it('키보드가 가린 높이 = 화면 높이 - 보이는 영역(높이 + 위로 밀린 만큼)', () => {
    expect(keyboardInset({ innerHeight: 800, height: 500, offsetTop: 0 })).toBe(300);
    expect(keyboardInset({ innerHeight: 800, height: 500, offsetTop: 120 })).toBe(180);
    // 화면이 키보드만큼 줄어드는 브라우저 · 확대해 둔 화면에서 더 커 보여도 음수는 없다
    expect(keyboardInset({ innerHeight: 500, height: 500 })).toBe(0);
    expect(keyboardInset({ innerHeight: 500, height: 640, offsetTop: 0 })).toBe(0);
    expect(keyboardInset({})).toBe(0);
  });
});
