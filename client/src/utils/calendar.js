// 달력(components/ui/Calendar.jsx)의 날짜 계산. 날짜는 늘 'YYYY-MM-DD' 문자열로 주고받는다 —
// Date 를 오래 들고 다니면 시간대 때문에 하루씩 어긋난다. 계산은 UTC 자정으로만 한다.

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');

/** month 는 0부터(1월 = 0) — Date 와 같다 */
export const toIso = (year, month, day) => {
  const date = new Date(Date.UTC(year, month, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export const parseIso = (iso) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  return { year, month: month - 1, day };
};

/** 브라우저(학부모 휴대폰)의 오늘 날짜 */
export const todayIso = (now = new Date()) => toIso(now.getFullYear(), now.getMonth(), now.getDate());

export const addDays = (iso, days) => {
  const { year, month, day } = parseIso(iso);
  return toIso(year, month, day + days);
};

/** 0 = 일요일 */
export const weekdayOf = (iso) => {
  const { year, month, day } = parseIso(iso);
  return new Date(Date.UTC(year, month, day)).getUTCDay();
};

/** { year, month } 에서 n 달 뒤(앞) */
export const addMonths = ({ year, month }, n) => {
  const date = new Date(Date.UTC(year, month + n, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
};

export const monthOf = (iso) => {
  const { year, month } = parseIso(iso);
  return { year, month };
};

/** 두 달을 비교 — a 가 앞이면 음수 */
export const compareMonth = (a, b) => (a.year - b.year) * 12 + (a.month - b.month);

/**
 * 보이는 달에서 n 달 넘긴 달 — min·max('YYYY-MM-DD' 또는 비움)가 있는 달 밖으로는 나가지 않는다.
 * 한 해(12달)씩 넘길 때 범위 끝을 넘으면 그 끝 달에 멈춘다.
 */
export const shiftMonth = (view, n, min, max) => {
  const next = addMonths(view, n);
  if (min && compareMonth(next, monthOf(min)) < 0) return monthOf(min);
  if (max && compareMonth(next, monthOf(max)) > 0) return monthOf(max);
  return next;
};

/**
 * 한 달을 일요일부터 시작하는 주 단위로. 달 밖의 칸은 null.
 * 줄 수가 달마다 달라 넘길 때 화면이 들썩이지 않도록 늘 6주를 채운다.
 */
export const monthWeeks = ({ year, month }) => {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => toIso(year, month, i + 1))
  ];
  while (cells.length < 42) cells.push(null);
  return Array.from({ length: 6 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
};

/** min·max 는 'YYYY-MM-DD' 또는 비움 */
export const isWithin = (iso, min, max) => (!min || iso >= min) && (!max || iso <= max);

export const clampIso = (iso, min, max) => {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
};

/** '2026-10-10' → '10월 10일 (토)'. withYear 면 앞에 'YYYY년 ' */
export const formatIsoDate = (iso, { withYear = false } = {}) => {
  if (!iso) return '';
  const { year, month, day } = parseIso(iso);
  const text = `${month + 1}월 ${day}일 (${WEEKDAYS[weekdayOf(iso)]})`;
  return withYear ? `${year}년 ${text}` : text;
};
