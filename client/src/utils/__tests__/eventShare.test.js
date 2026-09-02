import { parentEventPath, eventShareUrl, canShareEvent } from '../eventShare';

describe('eventShare', () => {
  it('공유 링크는 학부모 앱의 이벤트 주소 그대로다', () => {
    expect(parentEventPath(12)).toBe('/parent/events/12');
    expect(eventShareUrl(12, 'https://rg-manager.vercel.app')).toBe('https://rg-manager.vercel.app/parent/events/12');
  });

  it('origin 을 주지 않으면 지금 열려 있는 주소를 쓴다', () => {
    expect(eventShareUrl(7)).toBe(`${window.location.origin}/parent/events/7`);
  });

  it('비공개 이벤트는 공유할 수 없다 (학부모에게는 404 라서)', () => {
    expect(canShareEvent({ id: 1, isPublished: true })).toBe(true);
    expect(canShareEvent({ id: 1 })).toBe(true);
    expect(canShareEvent({ id: 1, isPublished: false })).toBe(false);
    expect(canShareEvent(null)).toBe(false);
  });
});
