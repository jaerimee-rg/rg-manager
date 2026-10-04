// 추천 상품 예약 규칙 (docs/recommended-shop/05-reservations.md).
// DB·요청을 모르는 순수 함수만 둔다. 클라이언트 utils/shopReservation.js 가 같은 규칙을 같은 표로 테스트한다.
import { todayKst } from '../services/eventService.js';

export const RESERVATION_STATUSES = ['requested', 'confirmed', 'cancelled'];
export const RESERVATION_NAME_MAX = 30;
// 너무 먼 날짜는 받지 않는다 — 선생님이 반년 뒤 일정까지 약속하기는 어렵다
export const RESERVATION_MAX_DAYS_AHEAD = 180;
// 선생님 예약 목록은 최근 것부터 이만큼만 (학원 규모에서는 넉넉하다)
export const RESERVATION_LIST_LIMIT = 500;

// 이 상태의 예약이 그 상품의 그 날을 차지한다 — 취소하면 그 날이 다시 열린다
export const ACTIVE_RESERVATION_STATUSES = ['requested', 'confirmed'];

export const isReservationStatus = (status) => RESERVATION_STATUSES.includes(status);
export const isActiveReservationStatus = (status) => ACTIVE_RESERVATION_STATUSES.includes(status);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' 이고 실제 있는 날짜인지 (2026-02-30 은 아니다) */
export const isIsoDate = (text) => {
  const match = ISO_DATE.exec(String(text ?? ''));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === text;
};

/** 'YYYY-MM-DD' 에 n 일을 더한다 (시간대와 무관하게 날짜만 센다) */
export const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/**
 * 전화번호 — 숫자만 남겨 하이픈을 넣는다. 휴대폰·지역번호 모두 받는다.
 * "+82 10-1234-5678" 은 010-1234-5678 로 바꾼다.
 */
export const normalizePhone = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { error: '전화번호를 입력해 주세요' };
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('82') && /^\+?\s*82/.test(text)) {
    digits = digits.slice(2);
    if (!digits.startsWith('0')) digits = `0${digits}`;
  }

  const invalid = { error: '전화번호를 정확히 입력해 주세요' };
  if (!/^0\d{8,10}$/.test(digits)) return invalid;

  if (digits.startsWith('02')) {
    if (digits.length === 9) return { value: `02-${digits.slice(2, 5)}-${digits.slice(5)}` };
    if (digits.length === 10) return { value: `02-${digits.slice(2, 6)}-${digits.slice(6)}` };
    return invalid;
  }
  if (digits.length === 10) return { value: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` };
  if (digits.length === 11) return { value: `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` };
  return invalid;
};

/**
 * 학부모가 보내는 예약 — 이름(학부모 또는 아이) · 전화번호 · 예약 날짜. 모두 필수다.
 * today 는 한국 날짜 'YYYY-MM-DD' — 오늘부터 RESERVATION_MAX_DAYS_AHEAD 일 뒤까지 받는다.
 * @returns {{ value: object, errors: object|null }}
 */
export const validateReservationInput = (body = {}, today = todayKst()) => {
  const errors = {};

  const name = String(body?.name ?? '').trim();
  if (!name) errors.name = '이름을 입력해 주세요';
  else if (name.length > RESERVATION_NAME_MAX) errors.name = `이름은 ${RESERVATION_NAME_MAX}자까지 입력할 수 있어요`;

  const phone = normalizePhone(body?.phone);
  if (phone.error) errors.phone = phone.error;

  const date = String(body?.date ?? '').trim();
  if (!date) errors.date = '예약 날짜를 골라 주세요';
  else if (!isIsoDate(date)) errors.date = '예약 날짜를 다시 골라 주세요';
  else if (date < today) errors.date = '오늘 이후 날짜를 골라 주세요';
  else if (date > addDaysIso(today, RESERVATION_MAX_DAYS_AHEAD)) {
    errors.date = `예약은 ${RESERVATION_MAX_DAYS_AHEAD}일 안의 날짜만 받아요`;
  }

  return {
    value: { name, phone: phone.value ?? null, reservedDate: date },
    errors: Object.keys(errors).length ? errors : null
  };
};
