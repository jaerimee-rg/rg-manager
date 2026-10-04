import { addDays, todayIso } from './calendar';

// 추천 상품 예약 화면 규칙 (docs/recommended-shop/05-reservations.md).
// 이름·전화번호·날짜 규칙은 서버 utils/shopReservation.js 와 같고, 두 쪽 테스트가 같은 표로 확인한다.

export const RESERVATION_NAME_MAX = 30;
// 다른 사람이 잡은 날 — 서버(publicShopController DATE_UNAVAILABLE)와 같은 문구
export const DATE_UNAVAILABLE = '이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.';
export const RESERVATION_MAX_DAYS_AHEAD = 180;

export const RESERVATION_STATUSES = [
  { id: 'requested', label: '요청', tone: 'warning' },
  { id: 'confirmed', label: '확정', tone: 'success' },
  { id: 'cancelled', label: '취소', tone: 'neutral' }
];

const STATUS_BY_ID = new Map(RESERVATION_STATUSES.map((s) => [s.id, s]));
export const reservationStatus = (id) => STATUS_BY_ID.get(id) || { id, label: id, tone: 'neutral' };

/** 서버와 같은 규칙 — 숫자만 남겨 하이픈을 넣는다. "+82 10-…" 은 010-… 으로 */
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
 * 입력하는 동안 하이픈을 넣는다 — 010 은 3-4-4, 02 는 2-3-4 / 2-4-4, 그 밖은 3-3-4 / 3-4-4.
 * 숫자·하이픈·공백 외의 글자(+82 의 + 등)가 있으면 손대지 않는다(저장할 때 정리한다).
 */
export const formatPhoneInput = (text) => {
  const raw = String(text ?? '');
  if (/[^\d\s-]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, '').slice(0, 11);

  if (d.startsWith('02')) {
    const s = d.slice(0, 10);
    if (s.length < 3) return s;
    if (s.length < 6) return `${s.slice(0, 2)}-${s.slice(2)}`;
    if (s.length < 10) return `${s.slice(0, 2)}-${s.slice(2, 5)}-${s.slice(5)}`;
    return `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`;
  }
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  // 010 은 늘 11자리라 처음부터 가운데 4칸으로 — 치는 도중에 하이픈이 옮겨 다니지 않게
  if (d.startsWith('010') || d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

/** 고를 수 있는 날짜 범위 — 오늘부터 180일 뒤까지 */
export const reservationRange = (today = todayIso()) => ({
  min: today,
  max: addDays(today, RESERVATION_MAX_DAYS_AHEAD)
});

/** 학부모 예약 폼 — 서버와 같은 메시지 */
export const validateReservationForm = ({ name, phone, date }, today = todayIso()) => {
  const errors = {};

  const trimmed = String(name ?? '').trim();
  if (!trimmed) errors.name = '이름을 입력해 주세요';
  else if (trimmed.length > RESERVATION_NAME_MAX) errors.name = `이름은 ${RESERVATION_NAME_MAX}자까지 입력할 수 있어요`;

  const normalized = normalizePhone(phone);
  if (normalized.error) errors.phone = normalized.error;

  const { min, max } = reservationRange(today);
  if (!date) errors.date = '예약 날짜를 골라 주세요';
  else if (date < min) errors.date = '오늘 이후 날짜를 골라 주세요';
  else if (date > max) errors.date = `예약은 ${RESERVATION_MAX_DAYS_AHEAD}일 안의 날짜만 받아요`;

  return {
    value: { name: trimmed, phone: normalized.value ?? '', date },
    errors: Object.keys(errors).length ? errors : null
  };
};

/** 선생님 목록의 요청 시각 — '10/4 14:05' (브라우저 시간) */
export const formatRequestedAt = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
};

/** 상태별 개수 — 칩 옆 숫자 */
export const countByStatus = (reservations = []) => {
  const counts = { all: reservations.length, requested: 0, confirmed: 0, cancelled: 0 };
  reservations.forEach((r) => {
    if (r.status in counts) counts[r.status] += 1;
  });
  return counts;
};
