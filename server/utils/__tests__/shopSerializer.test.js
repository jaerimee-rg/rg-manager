import {
  toPublicShop,
  toPublicCategory,
  toPublicProduct,
  toTeacherShop,
  toTeacherProduct,
  toTeacherReservation,
  toPublicReservation
} from '../shopSerializer.js';

// DB 행에 있을 수 있는 모든 컬럼 — 공개 응답으로 새면 안 되는 것들이 섞여 있다
const PRODUCT_ROW = {
  id: 12,
  userId: 9,
  categoryId: 3,
  title: '리본',
  description: '6m 리본\n막대 포함',
  url: 'https://coupang.com/x',
  price: 32000,
  imagePath: 'shop/9/uuid/ribbon.jpg',
  imageUrl: 'https://cdn/x.jpg',
  isVisible: true,
  sortOrder: -2,
  clickCount: '58',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z'
};

const IMAGE_ROWS = [
  { id: 7, productId: 12, userId: 9, imagePath: 'shop/9/a/1.jpg', imageUrl: 'https://cdn/1.jpg', sortOrder: 0, createdAt: 'x' },
  { id: 8, productId: 12, userId: 9, imagePath: 'shop/9/b/2.jpg', imageUrl: 'https://cdn/2.jpg', sortOrder: 1, createdAt: 'y' }
];

const SHOP_ROW = {
  id: 1,
  userId: 9,
  publicId: 'xY3kP9qLmT2vB7nR4sWd1A',
  title: '이재림 선생님 추천 상품',
  intro: '소개',
  notice: null,
  isActive: true,
  createdAt: 'x',
  updatedAt: 'y'
};

describe('공개 응답 화이트리스트 (FR-435 · 461)', () => {
  it('상품은 화면에 필요한 8개 필드만 나간다', () => {
    expect(Object.keys(toPublicProduct(PRODUCT_ROW, IMAGE_ROWS)).sort()).toEqual(
      ['categoryId', 'description', 'id', 'images', 'isReservable', 'price', 'title', 'url']
    );
  });

  it('예약 받기는 켜 둔 상품만 true — 옛 행(칸 없음)은 false', () => {
    expect(toPublicProduct({ ...PRODUCT_ROW, isReservable: true }).isReservable).toBe(true);
    expect(toPublicProduct({ ...PRODUCT_ROW, isReservable: false }).isReservable).toBe(false);
    expect(toPublicProduct(PRODUCT_ROW).isReservable).toBe(false);
  });

  it('사진은 순서대로 주소만 — 저장소 경로·사진 id 는 나가지 않는다', () => {
    expect(toPublicProduct(PRODUCT_ROW, IMAGE_ROWS).images).toEqual(['https://cdn/1.jpg', 'https://cdn/2.jpg']);
    expect(JSON.stringify(toPublicProduct(PRODUCT_ROW, IMAGE_ROWS))).not.toMatch(/shop\/9\//);
  });

  it('선생님 id·저장소 경로·공개 여부·클릭 수는 나가지 않는다', () => {
    const out = toPublicProduct(PRODUCT_ROW);
    expect(out).not.toHaveProperty('userId');
    expect(out).not.toHaveProperty('imagePath');
    expect(out).not.toHaveProperty('isVisible');
    expect(out).not.toHaveProperty('clickCount');
  });

  it('상점은 이름·소개·안내문만 (publicId·userId 없음)', () => {
    expect(toPublicShop(SHOP_ROW)).toEqual({ title: '이재림 선생님 추천 상품', intro: '소개', notice: null });
  });

  it('카테고리는 id·이름만', () => {
    expect(toPublicCategory({ id: 3, name: '기구', userId: 9, sortOrder: 2 })).toEqual({ id: 3, name: '기구' });
  });

  it('빈 값은 null 로 맞춘다', () => {
    expect(toPublicProduct({ id: 1, title: '곤봉' })).toEqual({
      id: 1, title: '곤봉', description: null, url: null, images: [], price: null, categoryId: null, isReservable: false
    });
  });
});

describe('선생님 화면용 직렬화', () => {
  it('상점에는 공개 링크가 들어 있다', () => {
    expect(toTeacherShop(SHOP_ROW)).toEqual({
      id: 1, publicId: 'xY3kP9qLmT2vB7nR4sWd1A', title: '이재림 선생님 추천 상품', intro: '소개', notice: null, isActive: true
    });
  });

  it('상품의 저장소 경로는 선생님에게도 보내지 않고, 클릭 수는 숫자로', () => {
    const out = toTeacherProduct(PRODUCT_ROW, IMAGE_ROWS);
    expect(out).not.toHaveProperty('imagePath');
    expect(JSON.stringify(out)).not.toMatch(/shop\/9\//);
    expect(out.clickCount).toBe(58);
  });

  it('사진은 id·주소로 순서대로, 대표 사진(imageUrl)은 첫 장 — 옛 칸(imageUrl 컬럼)은 보지 않는다', () => {
    const out = toTeacherProduct(PRODUCT_ROW, IMAGE_ROWS);
    expect(out.images).toEqual([{ id: 7, url: 'https://cdn/1.jpg' }, { id: 8, url: 'https://cdn/2.jpg' }]);
    expect(out.imageUrl).toBe('https://cdn/1.jpg');
    expect(out.description).toBe('6m 리본\n막대 포함');
    expect(toTeacherProduct(PRODUCT_ROW).imageUrl).toBeNull();
  });
});

describe('예약 직렬화 (05-reservations.md)', () => {
  const ROW = {
    id: 3, userId: 9, productId: 12, productTitle: '리본', imageUrl: 'https://cdn/1.jpg',
    name: '김예림', phone: '010-1234-5678', reservedDate: '2026-10-10', status: 'requested',
    createdAt: '2026-10-04T01:00:00.000Z', updatedAt: '2026-10-04T01:00:00.000Z'
  };

  it('선생님에게는 이름·전화번호까지 — 선생님 id 는 빼고', () => {
    expect(toTeacherReservation(ROW)).toEqual({
      id: 3, productId: 12, productTitle: '리본', imageUrl: 'https://cdn/1.jpg',
      name: '김예림', phone: '010-1234-5678', reservedDate: '2026-10-10', status: 'requested',
      createdAt: '2026-10-04T01:00:00.000Z', updatedAt: '2026-10-04T01:00:00.000Z'
    });
  });

  it('상품이 지워진 예약은 productId·사진이 null', () => {
    const out = toTeacherReservation({ ...ROW, productId: null, imageUrl: undefined });
    expect(out.productId).toBeNull();
    expect(out.imageUrl).toBeNull();
    expect(out.productTitle).toBe('리본');
  });

  it('학부모에게 되돌려 주는 것은 날짜·상태뿐 — 이름·전화번호·id 는 나가지 않는다', () => {
    expect(toPublicReservation(ROW)).toEqual({ reservedDate: '2026-10-10', status: 'requested' });
  });
});

describe('선생님 상품의 예약 받기', () => {
  it('켜 둔 상품만 true', () => {
    expect(toTeacherProduct({ ...PRODUCT_ROW, isReservable: true }).isReservable).toBe(true);
    expect(toTeacherProduct(PRODUCT_ROW).isReservable).toBe(false);
  });
});
