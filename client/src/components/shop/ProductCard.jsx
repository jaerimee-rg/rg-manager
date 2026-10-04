import React from 'react';
import { Card, Icon } from '../ui';
import { formatPrice, hostnameOf, safeHref } from '../../utils/shopFormat';

/**
 * 공개 상점의 상품 카드 (FR-432~433).
 * 링크가 있으면 카드 전체가 새 창 링크(<a>)이고, 없으면 누를 수 없는 카드다.
 * onOpen 은 이동을 막지 않는다 — 클릭 기록만 남긴다.
 */
function ProductCard({ product, categoryName, onOpen }) {
  const href = safeHref(product.url);
  const price = formatPrice(product.price);

  const body = (
    <>
      <div className="shop-product__img">
        {product.imageUrl
          ? <img src={product.imageUrl} alt="" loading="lazy" />
          : <Icon name="image" size={32} />}
      </div>
      <div className="shop-product__body">
        {categoryName && <span className="shop-product__cat">{categoryName}</span>}
        <span className="shop-product__title">{product.title}</span>
        {price && <span className="shop-product__price">{price}</span>}
        {href && (
          <span className="shop-product__host">
            {hostnameOf(href)}
            <Icon name="external" size={12} />
          </span>
        )}
      </div>
    </>
  );

  if (!href) {
    return (
      <Card padding="none" className="shop-product" data-testid="shop-product">
        {body}
      </Card>
    );
  }

  return (
    <Card
      as="a"
      padding="none"
      className="shop-product"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${product.title} (새 창에서 열림)`}
      onClick={() => onOpen?.(product)}
      // 가운데 버튼으로 새 탭에 여는 것은 click 이 아니라 auxclick 이다
      onAuxClick={(e) => { if (e.button === 1) onOpen?.(product); }}
      data-testid="shop-product"
    >
      {body}
    </Card>
  );
}

export default ProductCard;
