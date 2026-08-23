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

/** 접수 중인지 — 서버 판정과 같은 기준을 화면에서도 쓴다 */
export const isAcceptingRegistration = (event, now = new Date()) => {
  if (event.type === 'closure') return false;
  if (event.registrationOpen === false) return false;
  if (event.registrationDeadline && new Date(event.registrationDeadline) <= now) return false;
  return !isPast(event, todayString(now));
};
