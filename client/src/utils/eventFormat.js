// 이벤트 표시에 쓰는 순수 함수들. 화면 여러 곳에서 같은 규칙을 쓰도록 모아 둔다.

export const EVENT_TYPES = {
  competition: { label: '대회', short: '대회', emoji: '🏆', className: 'badge-danger' },
  special: { label: '스페셜 이벤트', short: '스페셜', emoji: '⭐', className: 'badge-purple' },
  closure: { label: '휴관일', short: '휴관일', emoji: '🚫', className: 'badge-gray' }
};

export const APPARATUS_PRESET = ['맨손', '볼', '후프', '곤봉', '리본', '줄'];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → Date (시간대 밀림 없이 그 날짜로) */
export const toDate = (value) => new Date(`${value}T00:00:00`);

/** '9/12(토)' */
export const formatDate = (value) => {
  if (!value) return '';
  const d = toDate(value);
  if (isNaN(d)) return value;
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};

/** 기간이면 '8/25(화) ~ 8/27(목)' */
export const formatRange = (date, endDate) =>
  endDate && endDate !== date ? `${formatDate(date)} ~ ${formatDate(endDate)}` : formatDate(date);

/** 시간까지 붙인 표시. 시간이 없으면 '종일' */
export const formatWhen = (event) => {
  const range = formatRange(event.date, event.endDate);
  return event.startTime ? `${range} ${event.startTime}` : `${range} · 종일`;
};

export const typeOf = (type) => EVENT_TYPES[type] || EVENT_TYPES.special;

/** 오늘(로컬) 기준 YYYY-MM-DD */
export const todayString = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** 이벤트가 지났는지 (기간이면 종료일 기준) */
export const isPast = (event, today = todayString()) => (event.endDate || event.date) < today;

// 마감 시간을 비웠을 때 쓰는 "그날 끝". 서버 eventEndMs 의 23:59:59 와 같은 뜻이다.
export const DEADLINE_END_OF_DAY = '23:59';

/**
 * 저장된 마감 일시 → { date, time } 입력칸 값.
 * Date 로 파싱하지 않고 문자열만 자른다 — 브라우저 시간대에 따라 날짜가 밀리면 안 되기 때문.
 * 'YYYY-MM-DDTHH:mm' (구형) 과 'YYYY-MM-DDTHH:mm:ss+09:00' 을 모두 받는다.
 */
export const splitDeadline = (value) => {
  if (!value) return { date: '', time: '' };
  const [date = '', rest = ''] = String(value).split('T');
  return { date, time: rest.slice(0, 5) };
};

/**
 * 마감 날짜 + 시간 → 저장할 문자열. 날짜가 없으면 마감 없음(null).
 * 시간을 비우면 그날 끝(23:59)으로 본다.
 * 서버의 eventStartMs/eventEndMs 와 같이 KST(+09:00)를 명시해, UTC 로 도는
 * 서버에서 파싱해도 한국 시간 그대로 해석되게 한다.
 */
export const joinDeadline = (date, time) =>
  (date ? `${date}T${time || DEADLINE_END_OF_DAY}:00+09:00` : null);

/** 접수 중인지 — 서버 판정과 같은 기준을 화면에서도 쓴다 */
export const isAcceptingRegistration = (event, now = new Date()) => {
  if (event.type === 'closure') return false;
  if (event.registrationOpen === false) return false;
  if (event.registrationDeadline && new Date(event.registrationDeadline) <= now) return false;
  return !isPast(event, todayString(now));
};
