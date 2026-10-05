import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Icon } from '../ui';
import { formatPrice, hostnameOf, isClickableProduct, safeHref } from '../../utils/shopFormat';

/**
 * 공개 상점의 상품 카드. 누르면 상품 상세(?p=)가 열린다 — 쇼핑몰·예약은 상세의 버튼으로 간다.
 * 누르는 순간 onOpen 을 부른다(클릭 통계 FR-440). 이동은 막지 않는다.
 * 사진도 링크도 없고 예약도 받지 않으면 상세에서 더 볼 것이 없어 누를 수 없는 카드다.
 * 사진은 정사각형 칸에 잘려 보이고, 가격·도메인은 카드 맨 아래에 붙어 줄이 맞는다.
 */
function ProductCard({ product, categoryName, to, state, onOpen }) {
  const href = safeHref(product.url);
  const price = formatPrice(product.price);
  const images = product.images || [];
  const reservable = product.isReservable === true;

  const body = (
    <>
      <div className="shop-product__img">
        {images.length
          ? <img src={images[0]} alt="" loading="lazy" />
          : <Icon name="image" size={32} />}
        {reservable && <span className="shop-product__reserve">예약 가능</span>}
        {images.length > 1 && (
          <span className="shop-product__count" aria-label={`사진 ${images.length}장`}>
            <Icon name="image" size={12} />
            {images.length}
          </span>
        )}
      </div>
      <div className="shop-product__body">
        {categoryName && <span className="shop-product__cat">{categoryName}</span>}
        <span className="shop-product__title">{product.title}</span>
        {product.description && <span className="shop-product__desc">{product.description}</span>}
        <div className="shop-product__foot">
          {price && <span className="shop-product__price">{price}</span>}
          {/* 링크가 없어도 줄은 비워 둔다 — 옆 카드와 가격 높이가 맞도록 */}
          <span className="shop-product__host" aria-hidden={href ? undefined : 'true'}>
            {href ? hostnameOf(href) : ' '}
          </span>
        </div>
      </div>
    </>
  );

  if (!isClickableProduct(product)) {
    return (
      <Card padding="none" className="shop-product" data-testid="shop-product">
        {body}
      </Card>
    );
  }

  return (
    <Card
      as={Link}
      to={to}
      state={state}
      onClick={() => onOpen?.(product)}
      padding="none"
      className="shop-product"
      data-interactive="true"
      aria-label={`${product.title} 자세히 보기`}
      data-testid="shop-product"
    >
      {body}
    </Card>
  );
}

export default ProductCard;
