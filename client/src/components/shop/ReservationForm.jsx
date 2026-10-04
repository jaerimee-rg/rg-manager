import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Calendar, Callout, Field, Icon, IconButton, Input, Stack } from '../ui';
import { formatPrice } from '../../utils/shopFormat';
import { formatIsoDate, todayIso } from '../../utils/calendar';
import {
  DATE_UNAVAILABLE, formatPhoneInput, reservationRange, validateReservationForm
} from '../../utils/shopReservation';

const readError = async (response, fallback) => {
  try {
    const data = await response.json();
    return { message: data.error || fallback, fields: data.fields || null, code: data.code || null };
  } catch {
    return { message: fallback, fields: null, code: null };
  }
};

/**
 * 공개 상점 — 상품 예약 (docs/recommended-shop/05-reservations.md).
 * 상품 상세와 같은 창 안에서 화면만 바뀐다(창 위에 창을 띄우면 Esc 한 번에 둘 다 닫힌다).
 * 이름(학부모 또는 아이) · 전화번호 · 예약 날짜(달력)를 받아 로그인 없이 보낸다.
 *
 * draft · onDraftChange — 값은 상세(부모)가 들고 있다. 상품으로 돌아갔다 와도 입력이 남는다.
 *
 * 한 상품의 한 날짜에는 예약이 하나만 선다 — 폼을 열면 이미 잡힌 날을 받아 달력에서 줄을 긋고 고를 수 없게 한다.
 * 그 사이 다른 사람이 먼저 잡으면 서버가 409(dateUnavailable)로 막고, 그 날을 비운 뒤 달력을 새로 받는다.
 */
function ReservationForm({ publicId, product, draft, onDraftChange, onBack, onDone }) {
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const today = todayIso();
  const { min, max } = reservationRange(today);
  const price = formatPrice(product.price);
  const image = product.images?.[0];
  const [unavailable, setUnavailable] = useState([]);

  // 못 읽어도 폼은 그대로 쓴다 — 보낼 때 서버가 다시 확인한다
  const loadUnavailable = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/shop/public/${encodeURIComponent(publicId)}/products/${product.id}/unavailable-dates`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const dates = Array.isArray(data.dates) ? data.dates : [];
      setUnavailable(dates);
      return dates;
    } catch (error) {
      console.error('예약할 수 없는 날짜 불러오기 실패:', error);
      return [];
    }
  }, [publicId, product.id]);

  // 상품으로 돌아갔다 오는 사이 고른 날이 잡혔으면 비우고 알린다
  const dropDateIfTaken = (dates, current) => {
    if (!current.date || !dates.includes(current.date)) return;
    onDraftChange({ ...current, date: '' });
    setErrors((e) => ({ ...e, date: DATE_UNAVAILABLE }));
  };

  useEffect(() => {
    loadUnavailable().then((dates) => dropDateIfTaken(dates, draft));
  }, [loadUnavailable]);

  const set = (field, value) => {
    onDraftChange({ ...draft, [field]: value });
    if (errors[field]) setErrors(({ [field]: _drop, ...rest }) => rest);
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (sendingRef.current) return;

    const { value, errors: found } = validateReservationForm(draft, today);
    if (found) {
      setErrors(found);
      return;
    }
    if (unavailable.includes(value.date)) {
      setErrors({ date: DATE_UNAVAILABLE });
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setFormError('');
    try {
      const response = await fetch(
        `/api/shop/public/${encodeURIComponent(publicId)}/products/${product.id}/reservations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value)
        }
      );
      if (!response.ok) {
        const fallback = response.status === 404
          ? '이 상품을 지금은 예약할 수 없어요. 페이지를 새로고침해 주세요.'
          : '예약을 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
        const { message, fields, code } = await readError(response, fallback);
        if (code === 'dateUnavailable') {
          // 그 사이 다른 사람이 그 날을 잡았다 — 고른 날을 비우고 달력을 새로 받는다
          onDraftChange({ ...draft, date: '' });
          setErrors({ date: DATE_UNAVAILABLE });
          loadUnavailable();
        } else if (fields) setErrors(fields);
        else setFormError(response.status === 404 ? fallback : message);
        return;
      }
      const data = await response.json();
      onDone({ ...value, duplicate: Boolean(data.duplicate) });
    } catch (error) {
      console.error('예약 요청 실패:', error);
      setFormError('예약을 보내지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="shop-reserve">
      <div className="shop-reserve__head">
        <IconButton icon="arrowLeft" label="상품으로 돌아가기" size="sm" variant="plain" onClick={onBack} />
        <h2 className="shop-reserve__title" id="shop-detail-title">예약하기</h2>
      </div>

      <div className="shop-reserve__product">
        <span className="shop-thumb">
          {image ? <img src={image} alt="" /> : <Icon name="image" size={18} />}
        </span>
        <div className="shop-reserve__product-text">
          <span className="shop-reserve__product-title">{product.title}</span>
          {price && <span className="shop-reserve__product-price">{price}</span>}
        </div>
      </div>

      <form className="shop-reserve__form" onSubmit={submit} noValidate>
        <Stack gap={5}>
          {formError && <Callout tone="danger">{formError}</Callout>}

          <Field
            label="이름"
            required
            htmlFor="reserve-name"
            hint="학부모 또는 아이 이름을 적어 주세요."
            error={errors.name}
          >
            {(props) => (
              <Input
                {...props}
                value={draft.name}
                autoComplete="name"
                placeholder="예: 김예림 · 예림엄마"
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>

          <Field label="전화번호" required htmlFor="reserve-phone" error={errors.phone} hint="선생님이 확인한 뒤 이 번호로 연락드려요.">
            {(props) => (
              <Input
                {...props}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.phone}
                placeholder="010-1234-5678"
                onChange={(e) => set('phone', formatPhoneInput(e.target.value))}
              />
            )}
          </Field>

          <Field
            label="예약 날짜"
            required
            error={errors.date}
            hint={draft.date
              ? `${formatIsoDate(draft.date, { withYear: true })}에 예약해요.`
              : `달력에서 날짜를 골라 주세요.${unavailable.length ? ' 줄 그은 날은 예약할 수 없어요.' : ''}`}
          >
            <Calendar
              label="예약 날짜"
              value={draft.date}
              min={min}
              max={max}
              unavailable={unavailable}
              unavailableLabel="예약 불가"
              invalid={Boolean(errors.date)}
              onChange={(date) => set('date', date)}
            />
          </Field>
        </Stack>
      </form>

      <div className="shop-detail__cta">
        <Button variant="primary" size="lg" block loading={sending} onClick={submit}>
          예약 요청 보내기
        </Button>
        <p className="shop-detail__cta-hint">남긴 이름과 전화번호는 선생님만 봐요</p>
      </div>
    </div>
  );
}

/** 보낸 뒤 — 무엇을 요청했는지 다시 보여 주고 닫는다 */
export function ReservationDone({ product, result, onClose }) {
  return (
    <div className="shop-reserve shop-reserve--done" role="status">
      <span className="shop-reserve__done-icon" aria-hidden="true"><Icon name="check" size={28} /></span>
      <h2 className="shop-reserve__title" id="shop-detail-title">
        {result.duplicate ? '이미 요청한 예약이에요' : '예약을 요청했어요'}
      </h2>
      <p className="shop-reserve__done-text">
        {result.duplicate
          ? '같은 날짜로 보낸 요청이 있어요. 선생님이 확인하고 있어요.'
          : '선생님이 확인한 뒤 남겨 주신 번호로 연락드려요.'}
      </p>
      <dl className="shop-reserve__summary">
        <div><dt>상품</dt><dd>{product.title}</dd></div>
        <div><dt>날짜</dt><dd>{formatIsoDate(result.date, { withYear: true })}</dd></div>
        <div><dt>이름</dt><dd>{result.name}</dd></div>
        <div><dt>전화번호</dt><dd>{result.phone}</dd></div>
      </dl>
      <div className="shop-detail__cta">
        <Button variant="primary" size="lg" block onClick={onClose}>확인</Button>
      </div>
    </div>
  );
}

export default ReservationForm;
