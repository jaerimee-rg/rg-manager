import {
  normalizeUrl,
  safeHref,
  isClickableProduct,
  hostnameOf,
  formatPrice,
  formatPriceInput,
  parsePriceInput,
  validateProductForm,
  parseDescriptionInput,
  DESCRIPTION_MAX,
  usedCategories,
  filterByCategory,
  shopPublicUrl,
  matchProductTitle,
  formatClickTime,
  formatPeriod,
  clickRateText,
  URL_ERROR,
  TITLE_ERROR
} from '../shopFormat';

// server/utils/__tests__/shopValidation.test.js 와 같은 표 — 두 쪽 규칙이 어긋나면 여기서 깨진다
describe('normalizeUrl — 서버와 같은 규칙', () => {
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

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
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

describe('safeHref · hostnameOf — 그릴 때 한 번 더 거른다 (FR-462)', () => {
  it('http/https 만 링크로 쓴다', () => {
    expect(safeHref('https://a.com/x')).toBe('https://a.com/x');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  it('도메인만 보여 주고 www. 는 뗀다', () => {
    expect(hostnameOf('https://www.coupang.com/vp/1')).toBe('coupang.com');
    expect(hostnameOf('https://smartstore.naver.com/a')).toBe('smartstore.naver.com');
    expect(hostnameOf('')).toBe('');
    expect(hostnameOf('javascript:x')).toBe('');
  });
});

describe('가격', () => {
  it('formatPrice — 원 단위, 0 은 "0원", 없으면 빈 문자열', () => {
    expect(formatPrice(32000)).toBe('32,000원');
    expect(formatPrice(1234000)).toBe('1,234,000원');
    expect(formatPrice(0)).toBe('0원');
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
  });

  it('formatPriceInput — 숫자만 남기고 콤마를 붙인다', () => {
    expect(formatPriceInput('32000')).toBe('32,000');
    expect(formatPriceInput('32,0000')).toBe('320,000');
    expect(formatPriceInput('abc')).toBe('');
    expect(formatPriceInput('0')).toBe('0');
    expect(formatPriceInput('007')).toBe('7');
  });

  it('parsePriceInput — 비면 null, 1억 초과는 오류', () => {
    expect(parsePriceInput('')).toEqual({ value: null });
    expect(parsePriceInput('32,000')).toEqual({ value: 32000 });
    expect(parsePriceInput('0')).toEqual({ value: 0 });
    expect(parsePriceInput('100,000,001').error).toBeTruthy();
  });
});

// server parseDescription 과 같은 표
describe('parseDescriptionInput — 서버와 같은 규칙', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['  \n  ', null],
    ['  6m 리본\r\n\r\n막대 포함 ', '6m 리본\n\n막대 포함']
  ])('%j → %j', (raw, expected) => {
    expect(parseDescriptionInput(raw)).toEqual({ value: expected });
  });

  it('1000자는 되고 1001자는 안 된다', () => {
    expect(parseDescriptionInput('a'.repeat(1000)).error).toBeUndefined();
    expect(parseDescriptionInput('a'.repeat(1001)).error).toMatch(/1000자/);
  });
});

describe('validateProductForm — 필수는 타이틀뿐', () => {
  it('타이틀만 있으면 통과', () => {
    expect(validateProductForm({ title: ' 곤봉 ', url: '', price: '' })).toEqual({
      value: { title: '곤봉', description: null, url: null, price: null },
      errors: null
    });
  });

  it('주소와 가격을 서버가 받을 모양으로 정리한다', () => {
    expect(validateProductForm({ title: '리본', url: 'coupang.com/x', price: '32,000' }).value).toEqual({
      title: '리본', description: null, url: 'https://coupang.com/x', price: 32000
    });
  });

  it('상세 설명은 줄바꿈을 지켜 보내고, 1000자를 넘으면 그 칸에 안내', () => {
    expect(validateProductForm({ title: '리본', description: ' 6m\r\n막대 포함 ' }).value.description).toBe('6m\n막대 포함');
    expect(validateProductForm({ title: '리본', description: 'a'.repeat(DESCRIPTION_MAX + 1) }).errors).toEqual({
      description: '상세 설명은 1000자까지 입력할 수 있어요'
    });
  });

  it('빈 타이틀·잘못된 주소를 한 번에 알려 준다', () => {
    expect(validateProductForm({ title: '  ', url: 'javascript:1', price: '' }).errors).toEqual({
      title: TITLE_ERROR,
      url: URL_ERROR
    });
  });

  it('81자 타이틀은 거절', () => {
    expect(validateProductForm({ title: 'a'.repeat(81) }).errors.title).toMatch(/80자/);
  });
});

describe('카테고리 칩 · 필터', () => {
  const categories = [{ id: 1, name: '발레복' }, { id: 3, name: '기구' }, { id: 5, name: '용품' }];
  const products = [{ id: 1, categoryId: 3 }, { id: 2, categoryId: null }, { id: 3, categoryId: 1 }];

  it('상품이 있는 카테고리만, 카테고리 순서대로', () => {
    expect(usedCategories(categories, products).map((c) => c.name)).toEqual(['발레복', '기구']);
  });

  it('null 은 전체, "none" 은 카테고리 없는 상품', () => {
    expect(filterByCategory(products, null)).toHaveLength(3);
    expect(filterByCategory(products, 3).map((p) => p.id)).toEqual([1]);
    expect(filterByCategory(products, 'none').map((p) => p.id)).toEqual([2]);
  });
});

describe('matchProductTitle — 상품 이름 검색', () => {
  it('글자 포함 (대소문자 무시)', () => {
    expect(matchProductTitle('리본', '사사키 리본 6m')).toBe(true);
    expect(matchProductTitle('SASAKI', 'Sasaki 리본')).toBe(true);
    expect(matchProductTitle('', '아무거나')).toBe(true);
  });

  it('초성만 치면 초성으로 찾는다', () => {
    expect(matchProductTitle('ㄹㅂ', '사사키 리본')).toBe(true);
    expect(matchProductTitle('ㅎㅍ', '주니어 후프')).toBe(true);
  });

  it('완성형 검색어를 초성으로 넓히지 않는다 ("리본" 이 "발레복" 에 걸리지 않게)', () => {
    expect(matchProductTitle('리본', '연습용 발레복')).toBe(false);
  });
});

describe('isClickableProduct — 공개 목록에서 누를 수 있는(클릭을 세는) 상품', () => {
  it('링크·사진·예약 중 하나라도 있으면 누를 수 있다 — 서버 ShopProduct.getClickable 과 같은 규칙', () => {
    expect(isClickableProduct({ url: 'https://a.com/x', images: [] })).toBe(true);
    expect(isClickableProduct({ url: null, images: ['https://cdn/1.jpg'] })).toBe(true);
    expect(isClickableProduct({ url: null, images: [{ id: 1, url: 'https://cdn/1.jpg' }] })).toBe(true);
    expect(isClickableProduct({ url: null, images: [], isReservable: true })).toBe(true);
  });

  it('셋 다 없으면 누를 수 없는 카드 — http(s) 가 아닌 주소는 링크로 치지 않는다', () => {
    expect(isClickableProduct({ url: null, images: [], isReservable: false })).toBe(false);
    expect(isClickableProduct({ url: 'javascript:alert(1)' })).toBe(false);
    expect(isClickableProduct({})).toBe(false);
    expect(isClickableProduct(null)).toBe(false);
  });
});

describe('공개 링크 · 통계 표시', () => {
  it('공개 상점 주소', () => {
    expect(shopPublicUrl('abc', 'https://rg-manager.vercel.app')).toBe('https://rg-manager.vercel.app/shop/abc');
    expect(shopPublicUrl(null, 'https://x')).toBe('');
  });

  it('마지막 클릭은 한국 시간 "월/일 시:분"', () => {
    expect(formatClickTime('2026-10-03T11:20:00.000Z')).toBe('10/3 20:20');
    expect(formatClickTime('2026-10-03T15:05:00.000Z')).toBe('10/4 00:05');
    expect(formatClickTime(null)).toBe('');
  });

  it('기간 안내', () => {
    expect(formatPeriod('2026-09-04T03:00:00.000Z')).toBe('9월 4일부터');
    expect(formatPeriod(null)).toBe('전체 기간');
  });

  it('클릭한 방문자 비율 — 방문자가 없으면 빈 문자열, 100% 를 넘지 않는다', () => {
    expect(clickRateText(29, 41)).toBe('방문자의 71%');
    expect(clickRateText(3, 0)).toBe('');
    expect(clickRateText(5, 3)).toBe('방문자의 100%');
  });
});
