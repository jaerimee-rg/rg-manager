import { generatePublicId } from '../publicId.js';

describe('generatePublicId', () => {
  it('URL-safe 문자만 사용하는 22자 토큰을 만든다', () => {
    const id = generatePublicId();
    expect(id).toHaveLength(22);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('1000번 생성해도 중복되지 않는다', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(generatePublicId());
    expect(ids.size).toBe(1000);
  });
});
