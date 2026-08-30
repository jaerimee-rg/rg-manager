import { uniqueUsername, USERNAME_MAX, isPlaceholderName, placeholderUsername, displayNameOf, displayNameSql } from '../usernames.js';

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

describe('isPlaceholderName — 자동 식별자 판별', () => {
  it('초대·역할 추가로 만든 자동 이름을 알아본다', () => {
    expect(isPlaceholderName('카카오_1788076610466')).toBe(true);
    expect(isPlaceholderName('카카오_1788076610466_2')).toBe(true);
    // 닉네임이 없을 때 콜백이 만드는 `카카오<끝 4자리>`
    expect(isPlaceholderName('카카오5094')).toBe(true);
    expect(isPlaceholderName(placeholderUsername())).toBe(true);
  });

  it('진짜 이름은 자동 이름이 아니다', () => {
    expect(isPlaceholderName('이재림')).toBe(false);
    expect(isPlaceholderName('카카오선생님')).toBe(false);
    expect(isPlaceholderName('')).toBe(false);
    expect(isPlaceholderName(null)).toBe(false);
  });
});

describe('displayNameOf — 사람에게 보여줄 이름', () => {
  it('표시 이름이 있으면 그것을 쓴다', () => {
    expect(displayNameOf({ username: '카카오_1788076610466', displayName: '최재웅' })).toBe('최재웅');
  });

  it('표시 이름이 없으면 username 을 쓴다', () => {
    expect(displayNameOf({ username: '이재림', displayName: null })).toBe('이재림');
    expect(displayNameOf({ username: '이재림', displayName: '   ' })).toBe('이재림');
  });

  it('username 이 자동 이름이면 null — 학부모에게 식별자를 보여주지 않는다', () => {
    expect(displayNameOf({ username: '카카오_1788076610466' })).toBeNull();
    expect(displayNameOf(null)).toBeNull();
  });
});

describe('displayNameSql', () => {
  it('SQL 에서도 같은 우선순위(표시 이름 → username)로 고른다', () => {
    expect(displayNameSql('u')).toBe(`COALESCE(NULLIF(u."displayName", ''), u.username)`);
  });
});
