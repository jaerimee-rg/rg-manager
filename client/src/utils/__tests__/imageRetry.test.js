import { RETRY_DELAYS, retryDelay, retryUrl } from '../imageRetry';

describe('retryDelay — 실패한 썸네일을 언제 다시 부를지', () => {
  it('점점 길게 기다리고, 다 쓰면 그만둔다', () => {
    expect(RETRY_DELAYS.map((_, attempt) => retryDelay(attempt))).toEqual([1000, 3000, 8000]);
    expect(retryDelay(RETRY_DELAYS.length)).toBeNull();
  });
});

describe('retryUrl — 다시 부를 주소', () => {
  it('처음에는 주소 그대로', () => {
    expect(retryUrl('https://lh3.googleusercontent.com/d/f1=w400-h400-c-rw', 0))
      .toBe('https://lh3.googleusercontent.com/d/f1=w400-h400-c-rw');
  });

  it('다시 부를 때는 retry=n 을 붙인다 — 같은 주소면 브라우저가 새로 받지 않는다', () => {
    expect(retryUrl('https://lh3.googleusercontent.com/d/f1=w400-h400-c-rw', 2))
      .toBe('https://lh3.googleusercontent.com/d/f1=w400-h400-c-rw?retry=2');
    expect(retryUrl('https://drive.google.com/thumbnail?id=f1&sz=w400', 1))
      .toBe('https://drive.google.com/thumbnail?id=f1&sz=w400&retry=1');
  });

  it('주소가 없으면 없는 그대로', () => {
    expect(retryUrl(null, 1)).toBeNull();
    expect(retryUrl('', 1)).toBe('');
  });
});
