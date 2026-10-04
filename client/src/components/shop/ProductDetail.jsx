import React from 'react';
import { Button, IconButton, Modal } from '../ui';
import { formatPrice, hostnameOf, safeHref } from '../../utils/shopFormat';
import ProductGallery from './ProductGallery';

/**
 * 공개 상점의 상품 상세 — 모바일은 바텀시트, 데스크톱은 가운데 넓은 모달.
 * 사진(캐러셀) · 카테고리 · 타이틀 · 상세 설명 · 가격 · [쇼핑몰에서 보기].
 * 클릭 통계는 쇼핑몰 버튼을 누른 것만 센다(상세를 연 것은 세지 않는다). onOpenLink 는 이동을 막지 않는다.
 */
function ProductDetail({ product, categoryName, onClose, onOpenLink }) {
  const href = safeHref(product.url);
  const price = formatPrice(product.price);

  return (
    <Modal
      header={false}
      size="lg"
      className="shop-detail-overlay"
      labelledBy="shop-detail-title"
      onClose={onClose}
    >
      <IconButton className="shop-detail__close" icon="x" label="닫기" size="sm" onClick={onClose} />
      <div className="shop-detail">
        <ProductGallery images={product.images || []} title={product.title} />
        <div className="shop-detail__info">
          {categoryName && <span className="shop-detail__cat">{categoryName}</span>}
          <h2 className="shop-detail__title" id="shop-detail-title">{product.title}</h2>
          {product.description && <p className="shop-detail__desc">{product.description}</p>}
          {price && <span className="shop-detail__price">{price}</span>}
          {!href && (
            <p className="shop-detail__none">쇼핑몰 링크가 없는 상품이에요. 궁금한 점은 수업 때 선생님께 물어봐 주세요.</p>
          )}
        </div>
        {href && (
          <div className="shop-detail__cta">
            <Button
              as="a"
              variant="primary"
              size="lg"
              block
              iconEnd="external"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenLink?.(product)}
              // 가운데 버튼으로 새 탭에 여는 것은 click 이 아니라 auxclick 이다
              onAuxClick={(e) => { if (e.button === 1) onOpenLink?.(product); }}
            >
              {hostnameOf(href)}에서 보기
            </Button>
            <p className="shop-detail__cta-hint">쇼핑몰이 새 창으로 열려요</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ProductDetail;
