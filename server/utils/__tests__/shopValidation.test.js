import {
  normalizeUrl,
  parsePrice,
  parseId,
  parseDescription,
  validateProductInput,
  validateCategoryName,
  validateShopSettings,
  parseStatsRange,
  isAllowedImage,
  normalizeVisitorKey,
  isSameIdSet,
  defaultShopTitle,
  URL_ERROR,
  TITLE_MAX,
  PRICE_MAX,
  DESCRIPTION_MAX
} from '../shopValidation.js';

describe('normalizeUrl — 상품 주소는 http/https 만 받는다', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    ['https://www.coupang.com/vp/products/1', 'https://www.coupang.com/vp/products/1'],
    ['  https://smartstore.naver.com/a?b=1  ', 'https://smartstore.naver.com/a?b=1'],
    ['http://example.com', 'http://example.com/'],
    ['coupang.com/vp/products/1', 'https://coupang.com/vp/products/1'],
    ['www.musinsa.com', 'https://www.musinsa.com/'],
    ['coupang.com:8080/x', 'https://coupang.com:8080/x'],
    ['HTTPS://Example.COM/Path', 'https://example.com/Path']
  ])('%j → %j', (input, expected) => {
    expect(normalizeUrl(input)).toEqual({ value: expected });
  });

  it('한글 도메인·경로도 받는다 (브라우저가 쓰는 형태로 바뀐다)', () => {
    const { value } = normalizeUrl('한글도메인.kr/상품');
    expect(value).toMatch(/^https:\/\/xn--[a-z0-9-]+\.kr\/%EC%83%81%ED%92%88$/);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java.script:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:a@b.com',
    'ftp://example.com/file',
    'localhost:3000',
    '//example.com',
    '그냥 글자',
    'abc',
    'https://',
    `https://example.com/${'a'.repeat(2000)}`
  ])('%s 는 거절한다', (input) => {
    expect(normalizeUrl(input)).toEqual({ error: URL_ERROR });
  });
});

describe('parsePrice', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    [0, 0],
    ['0', 0],
    [32000, 32000],
    ['32,000', 32000],
    ['32000원', 32000],
    [' 1 234 ', 1234],
    [PRICE_MAX, PRICE_MAX]
  ])('%j → %j', (input, expected) => {
    expect(parsePrice(input)).toEqual({ value: expected });
  });

  it.each([-1, '-1', 1.5, '1.5', 'abc', PRICE_MAX + 1, '1e3'])('%j 는 오류', (input) => {
    expect(parsePrice(input).error).toBeTruthy();
  });
});

describe('parseId', () => {
  it('비어 있으면 null, 양의 정수면 그 값, 나머지는 undefined', () => {
    expect(parseId(null)).toBeNull();
    expect(parseId('')).toBeNull();
    expect(parseId(3)).toBe(3);
    expect(parseId('3')).toBe(3);
    expect(parseId(0)).toBeUndefined();
    expect(parseId('x')).toBeUndefined();
    expect(parseId(1.2)).toBeUndefined();
  });
});

describe('parseDescription — 상세 설명', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['  \n  ', null]
  ])('%j 는 비운 것(null)', (raw, expected) => {
    expect(parseDescription(raw)).toEqual({ value: expected });
  });

  it('앞뒤 공백은 지우고 줄바꿈은 지킨다 (\\r\\n → \\n)', () => {
    expect(parseDescription('  6m 리본\r\n\r\n막대 포함 ')).toEqual({ value: '6m 리본\n\n막대 포함' });
  });

  it('1000자는 되고 1001자는 안 된다', () => {
    expect(parseDescription('a'.repeat(DESCRIPTION_MAX))).toEqual({ value: 'a'.repeat(DESCRIPTION_MAX) });
    expect(parseDescription('a'.repeat(DESCRIPTION_MAX + 1)).error).toMatch(/1000자/);
  });
});

describe('validateProductInput — 필수는 타이틀뿐', () => {
  it('설명을 보내면 정리하고, 빈 설명은 null(지우기) — 안 보내면 undefined(수정에서 기존 값을 지킴)', () => {
    expect(validateProductInput({ title: '리본', description: ' 막대 포함 ' }).value.description).toBe('막대 포함');
    expect(validateProductInput({ title: '리본', description: '' }).value.description).toBeNull();
    expect(validateProductInput({ title: '리본' }).value.description).toBeUndefined();
    expect(validateProductInput({ title: '리본', description: 'a'.repeat(1001) }).errors).toHaveProperty('description');
  });

  it('타이틀만 있으면 통과하고 나머지는 비운다 — 공개 여부는 정하지 않는다(등록은 공개, 수정은 기존 값)', () => {
    expect(validateProductInput({ title: '  곤봉  ' })).toEqual({
      value: { title: '곤봉', description: undefined, url: null, price: null, categoryId: null, isVisible: undefined },
      errors: null
    });
  });

  it('모든 항목을 정리해서 돌려준다', () => {
    const { value, errors } = validateProductInput({
      title: '리본',
      url: 'coupang.com/x',
      price: '32,000',
      categoryId: '3',
      isVisible: false
    });
    expect(errors).toBeNull();
    expect(value).toEqual({ title: '리본', description: undefined, url: 'https://coupang.com/x', price: 32000, categoryId: 3, isVisible: false });
  });

  it.each([[''], ['   '], [undefined]])('타이틀 %j 는 거절', (title) => {
    expect(validateProductInput({ title }).errors).toEqual({ title: '타이틀을 입력해 주세요' });
  });

  it('타이틀 경계 — 80자는 되고 81자는 안 된다', () => {
    expect(validateProductInput({ title: 'a'.repeat(TITLE_MAX) }).errors).toBeNull();
    expect(validateProductInput({ title: 'a'.repeat(TITLE_MAX + 1) }).errors.title).toMatch(/80자/);
  });

  it('여러 오류를 한 번에 알려 준다', () => {
    const { errors } = validateProductInput({ title: '', url: 'javascript:x', price: '-1', categoryId: 'x', isVisible: 'yes' });
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'isVisible', 'price', 'title', 'url']);
  });
});

describe('validateCategoryName', () => {
  it('앞뒤 공백을 지우고 1~20자', () => {
    expect(validateCategoryName('  수구 ')).toEqual({ value: '수구' });
    expect(validateCategoryName('').error).toBeTruthy();
    expect(validateCategoryName('a'.repeat(20))).toEqual({ value: 'a'.repeat(20) });
    expect(validateCategoryName('a'.repeat(21)).error).toBeTruthy();
  });
});

describe('validateShopSettings', () => {
  it('이름 필수, 소개·안내문은 비우면 null, 줄바꿈은 남긴다', () => {
    expect(validateShopSettings({ title: ' 추천 ', intro: '첫 줄\n둘째 줄 ', notice: '  ', isActive: false })).toEqual({
      value: { title: '추천', intro: '첫 줄\n둘째 줄', notice: null, isActive: false },
      errors: null
    });
  });

  it('공개 여부를 주지 않으면 공개', () => {
    expect(validateShopSettings({ title: '추천' }).value.isActive).toBe(true);
  });

  it('길이 제한', () => {
    const { errors } = validateShopSettings({ title: 'a'.repeat(41), intro: 'a'.repeat(301), notice: 'a'.repeat(301) });
    expect(Object.keys(errors).sort()).toEqual(['intro', 'notice', 'title']);
  });
});

describe('parseStatsRange', () => {
  const NOW = Date.parse('2026-10-04T00:00:00.000Z');

  it('7·30·90 일은 그만큼 이전 시각부터', () => {
    expect(parseStatsRange('7', NOW)).toEqual({ range: '7', since: '2026-09-27T00:00:00.000Z' });
    expect(parseStatsRange(30, NOW)).toEqual({ range: '30', since: '2026-09-04T00:00:00.000Z' });
    expect(parseStatsRange('90', NOW).since).toBe('2026-07-06T00:00:00.000Z');
  });

  it('전체는 since 가 없고, 모르는 값은 30일', () => {
    expect(parseStatsRange('all', NOW)).toEqual({ range: 'all', since: null });
    expect(parseStatsRange(undefined, NOW).range).toBe('30');
    expect(parseStatsRange('365', NOW).range).toBe('30');
  });
});

describe('isAllowedImage — 확장자로 판단, svg 는 안 받는다', () => {
  it.each(['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.gif', '리본.jpg'])('%s 허용', (name) => {
    expect(isAllowedImage(name)).toBe(true);
  });
  it.each(['a.svg', 'a.pdf', 'a.html', 'a', 'a.heic'])('%s 거절', (name) => {
    expect(isAllowedImage(name)).toBe(false);
  });
});

describe('normalizeVisitorKey', () => {
  it('문자열만, 앞뒤 공백 제거, 100자 제한', () => {
    expect(normalizeVisitorKey(' abc ')).toBe('abc');
    expect(normalizeVisitorKey('')).toBeNull();
    expect(normalizeVisitorKey(123)).toBeNull();
    expect(normalizeVisitorKey('x'.repeat(150))).toHaveLength(100);
  });
});

describe('isSameIdSet — 순서 변경은 내 것 전부를 한 번씩', () => {
  it('같은 집합이면 통과', () => {
    expect(isSameIdSet([3, 1, 2], [1, 2, 3])).toBe(true);
  });
  it('남의 id·빠진 id·중복·숫자 아님은 거절', () => {
    expect(isSameIdSet([1, 2, 99], [1, 2, 3])).toBe(false);
    expect(isSameIdSet([1, 2], [1, 2, 3])).toBe(false);
    expect(isSameIdSet([1, 1, 2], [1, 2, 3])).toBe(false);
    expect(isSameIdSet(['1', 2, 3], [1, 2, 3])).toBe(false);
    expect(isSameIdSet('1,2,3', [1, 2, 3])).toBe(false);
  });
});

describe('defaultShopTitle', () => {
  it('선생님 이름을 넣고, 없거나 너무 길면 기본 문구', () => {
    expect(defaultShopTitle('이재림')).toBe('이재림 선생님 추천 상품');
    expect(defaultShopTitle('')).toBe('선생님 추천 상품');
    expect(defaultShopTitle(null)).toBe('선생님 추천 상품');
    expect(defaultShopTitle('가'.repeat(40))).toBe('선생님 추천 상품');
  });
});
