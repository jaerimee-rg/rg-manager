import { uniqueUsername, USERNAME_MAX } from '../usernames.js';

const takenSet = (...names) => {
  const set = new Set(names);
  return async (name) => set.has(name);
};

describe('uniqueUsername', () => {
  it('비어 있으면 그대로 쓴다', async () => {
    await expect(uniqueUsername('김리듬', takenSet())).resolves.toBe('김리듬');
  });

  it('겹치면 _2 부터 붙인다', async () => {
    await expect(uniqueUsername('김리듬', takenSet('김리듬'))).resolves.toBe('김리듬_2');
    await expect(uniqueUsername('김리듬', takenSet('김리듬', '김리듬_2'))).resolves.toBe('김리듬_3');
  });

  it('이름이 비면 fallback 을 쓴다', async () => {
    await expect(uniqueUsername('', takenSet(), '학부모')).resolves.toBe('학부모');
    await expect(uniqueUsername('   ', takenSet(), '관리자')).resolves.toBe('관리자');
  });

  it('최대 길이를 넘지 않는다 (접미사를 붙일 때도)', async () => {
    const long = 'ㄱ'.repeat(50);
    const plain = await uniqueUsername(long, takenSet());
    expect(plain).toHaveLength(USERNAME_MAX);

    const suffixed = await uniqueUsername(long, takenSet(plain));
    expect(suffixed.length).toBeLessThanOrEqual(USERNAME_MAX);
    expect(suffixed.endsWith('_2')).toBe(true);
  });

  it('_2~_99 가 모두 차면 타임스탬프로 떨어진다', async () => {
    const taken = new Set(['김리듬']);
    for (let i = 2; i < 100; i += 1) taken.add(`김리듬_${i}`);

    const name = await uniqueUsername('김리듬', async (n) => taken.has(n));
    expect(name).toMatch(/^김리듬_\d{10,}$/);
  });
});
