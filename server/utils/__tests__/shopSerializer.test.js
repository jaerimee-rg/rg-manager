import {
  toPublicShop,
  toPublicCategory,
  toPublicProduct,
  toTeacherShop,
  toTeacherProduct
} from '../shopSerializer.js';

// DB 행에 있을 수 있는 모든 컬럼 — 공개 응답으로 새면 안 되는 것들이 섞여 있다
const PRODUCT_ROW = {
  id: 12,
  userId: 9,
  categoryId: 3,
  title: '리본',
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
  it('상품은 화면에 필요한 6개 필드만 나간다', () => {
    expect(Object.keys(toPublicProduct(PRODUCT_ROW)).sort()).toEqual(
      ['categoryId', 'id', 'imageUrl', 'price', 'title', 'url']
    );
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
      id: 1, title: '곤봉', url: null, imageUrl: null, price: null, categoryId: null
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
    const out = toTeacherProduct(PRODUCT_ROW);
    expect(out).not.toHaveProperty('imagePath');
    expect(out.clickCount).toBe(58);
  });
});
