/**
 * 한도는 환경변수로 올릴 수 있지만 **기본값은 운영 값 그대로**여야 한다.
 * (e2e 는 한 IP 에서 수백 번을 쳐서 운영 한도로는 스위트가 끝까지 못 간다)
 * server.js 의 limitFromEnv 와 같은 규칙을 고정한다.
 */
const limitFromEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

describe('레이트 리밋 한도 해석', () => {
  it('환경변수가 없으면 운영 기본값을 쓴다', () => {
    expect(limitFromEnv(undefined, 200)).toBe(200);
    expect(limitFromEnv('', 60)).toBe(60);
  });

  it('숫자를 주면 그 값을 쓴다 (e2e 에서 올리는 용도)', () => {
    expect(limitFromEnv('100000', 200)).toBe(100000);
  });

  it('쓰레기 값은 무시하고 기본값으로 떨어진다 — 실수로 한도가 사라지지 않게', () => {
    for (const bad of ['abc', '0', '-5', '1.5', 'Infinity', null, {}, []]) {
      expect(limitFromEnv(bad, 200)).toBe(200);
    }
  });
});
