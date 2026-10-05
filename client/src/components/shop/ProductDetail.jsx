import React, { useState } from 'react';
import { Button, IconButton, Modal } from '../ui';
import { formatPrice, hostnameOf, safeHref } from '../../utils/shopFormat';
import ProductGallery from './ProductGallery';
import ReservationForm, { ReservationDone } from './ReservationForm';

const EMPTY_DRAFT = { name: '', phone: '', date: '' };

/**
 * 공개 상점의 상품 상세 — 모바일은 바텀시트(끌어내려 닫는다), 데스크톱은 가운데 넓은 모달.
 * 사진(캐러셀) · 카테고리 · 타이틀 · 상세 설명 · 가격 · [예약하기] · [쇼핑몰에서 보기].
 * 쇼핑몰 버튼을 누르면 onOpenLink 를 부른다 — 클릭으로 셀지는 부르는 쪽이 정한다(목록에서 눌러 연 상세면 이미 셌다).
 * onOpenLink 는 이동을 막지 않는다.
 *
 * 선생님이 예약을 받는 상품이면 아래에 [예약하기]가 생기고, 누르면 같은 창 안에서 예약 폼으로 바뀐다.
 * 예약 폼에서 Esc·바깥 누르기는 창을 닫지 않고 상품으로 돌아간다(쓰던 입력을 잃지 않게).
 * 같은 이유로 끌어내려 닫기도 예약 폼에서는 끈다 — 상품 상세와 보낸 뒤 확인 화면에서만 된다.
 */
function ProductDetail({ product, categoryName, publicId, onClose, onOpenLink }) {
  const [step, setStep] = useState('detail'); // detail | reserve | done
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [result, setResult] = useState(null);
  const href = safeHref(product.url);
  const price = formatPrice(product.price);
  const reservable = product.isReservable === true;

  const handleClose = () => {
    if (step === 'reserve') setStep('detail');
    else onClose();
  };

  let body;
  if (step === 'reserve') {
    body = (
      <ReservationForm
        publicId={publicId}
        product={product}
        draft={draft}
        onDraftChange={setDraft}
        onBack={() => setStep('detail')}
        onDone={(sent) => {
          setResult(sent);
          setDraft(EMPTY_DRAFT);
          setStep('done');
        }}
      />
    );
  } else if (step === 'done') {
    body = <ReservationDone product={product} result={result} onClose={onClose} />;
  } else {
    body = (
      <div className="shop-detail">
        <ProductGallery images={product.images || []} title={product.title} />
        <div className="shop-detail__info">
          {categoryName && <span className="shop-detail__cat">{categoryName}</span>}
          <h2 className="shop-detail__title" id="shop-detail-title">{product.title}</h2>
          {product.description && <p className="shop-detail__desc">{product.description}</p>}
          {price && <span className="shop-detail__price">{price}</span>}
          {!href && !reservable && (
            <p className="shop-detail__none">쇼핑몰 링크가 없는 상품이에요. 궁금한 점은 수업 때 선생님께 물어봐 주세요.</p>
          )}
        </div>
        {(href || reservable) && (
          <div className="shop-detail__cta">
            {reservable && (
              <Button variant="primary" size="lg" block icon="calendar" onClick={() => setStep('reserve')}>
                예약하기
              </Button>
            )}
            {href && (
              <Button
                as="a"
                // 예약 버튼이 있으면 그쪽이 주인공 — 쇼핑몰은 테두리 버튼으로 내려간다
                variant={reservable ? 'secondary' : 'primary'}
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
            )}
            <p className="shop-detail__cta-hint">
              {href ? '쇼핑몰이 새 창으로 열려요' : '이름·전화번호·날짜를 남기면 선생님이 연락드려요'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal
      header={false}
      size="lg"
      className="shop-detail-overlay"
      data-step={step}
      labelledBy="shop-detail-title"
      swipeToClose={step !== 'reserve'}
      onClose={handleClose}
    >
      <IconButton className="shop-detail__close" icon="x" label="닫기" size="sm" onClick={onClose} />
      {body}
    </Modal>
  );
}

export default ProductDetail;
