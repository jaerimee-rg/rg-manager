// 학부모 일정 화면의 계산 로직. 화면과 떼어 두고 단위 테스트한다.

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const toDate = (value) => new Date(`${value}T00:00:00`);

/** 일정 화면 주소 — 지난 일정 보기는 `?view=past` 라서 상세에서 돌아와도, 새로고침해도 그대로다 */
export const SCHEDULE_PATH = '/parent/schedule';
export const PAST_SCHEDULE_PATH = `${SCHEDULE_PATH}?view=past`;

/**
 * 상세 화면의 뒤로 가기 주소. 지난 일정에서 들어왔으면 지난 일정으로 돌아간다.
 * 라우터 state 는 우리가 넣은 값이지만, 아는 두 주소 말고는 받지 않는다.
 */
export const scheduleBackPath = (state) =>
  state?.back === PAST_SCHEDULE_PATH ? PAST_SCHEDULE_PATH : SCHEDULE_PATH;

/** 두 날짜(YYYY-MM-DD) 사이의 일수 */
export const daysBetween = (from, to) =>
  Math.round((toDate(to) - toDate(from)) / 86400000);

/**
 * 오늘부터 올해 말까지 남은 이벤트만 남긴다.
 * 시작일이 지났어도 종료일이 남은 기간 이벤트(진행 중인 휴관일 등)는 포함한다.
 */
export const filterRemainingThisYear = (events, today) => {
  const year = today.slice(0, 4);
  return (events || [])
    .filter((e) => (e.endDate || e.date) >= today && e.date <= `${year}-12-31`)
    .sort((a, b) => (a.date === b.date ? (a.startTime || '').localeCompare(b.startTime || '') : a.date.localeCompare(b.date)));
};

/**
 * 끝난 이벤트(종료일이 오늘 전)만 최근 것부터. 종료일 조건이 filterRemainingThisYear 의 반대라
 * 진행 중인 기간 이벤트는 여기에 없다. 지난 일정은 연도 제한 없이 모두 보여준다.
 */
export const filterPast = (events, today) =>
  (events || [])
    .filter((e) => (e.endDate || e.date) < today)
    .sort((a, b) => (a.date === b.date ? (b.startTime || '').localeCompare(a.startTime || '') : b.date.localeCompare(a.date)));

/** 월 구분 헤더로 묶는다 — [{ key, label, events }] */
export const groupByMonth = (events) => {
  const groups = [];
  let current = null;

  for (const event of events || []) {
    const key = event.date.slice(0, 7);
    if (!current || current.key !== key) {
      current = { key, label: `${Number(key.slice(5, 7))}월`, year: key.slice(0, 4), events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
};

/** 'D-3' · '오늘' · '진행 중' · '종료' */
export const dDay = (event, today) => {
  // 끝난 일정 (지난 일정 보기, 지난 이벤트의 상세)
  if (daysBetween(today, event.endDate || event.date) < 0) return { text: '종료', urgent: false };

  const start = daysBetween(today, event.date);

  if (event.endDate && start <= 0 && daysBetween(today, event.endDate) >= 0 && start !== 0) {
    return { text: '진행 중', urgent: false };
  }
  if (start === 0) return { text: '오늘', urgent: true };
  if (start < 0) return { text: '진행 중', urgent: false };
  return { text: `D-${start}`, urgent: start <= 3 };
};

/** 카드 날짜 표시 — 기간이면 시작~종료 */
export const formatCardDate = (event) => {
  const one = (value) => {
    const d = toDate(value);
    return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  };
  const range = event.endDate && event.endDate !== event.date ? `${one(event.date)} ~ ${one(event.endDate)}` : one(event.date);
  return event.startTime ? `${range} ${event.startTime}` : `${range} · 종일`;
};

export const dayLabel = (value) => {
  const d = toDate(value);
  return { day: d.getDate(), dow: DOW[d.getDay()], weekend: d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : '' };
};

/** 신청 못 하는 이유를 학부모에게 보여줄 문구로 */
export const reasonText = (reason, childName = '') => ({
  child_pending: `${childName ? `${childName}는 ` : ''}선생님이 아이 정보를 확인한 뒤에 신청할 수 있어요.`,
  deadline: '접수가 마감되었어요. 추가 참가는 선생님께 문의해 주세요.',
  closed: '지금은 접수를 받지 않아요.',
  started: '이미 시작된 일정이에요.',
  hidden: '지금은 신청할 수 없어요.'
}[reason] || '');

/**
 * 카드에 붙일 상태 배지 (해당 자녀 기준).
 * 지난 일정(`past`)에는 신청했던 것만 남긴다 — 끝난 일정에 "접수 마감" 은 군더더기다.
 */
export const childBadge = (childState, { past = false } = {}) => {
  if (!childState) return null;
  if (childState.status === 'confirmed') return { label: '신청 완료 · 확정', tone: 'success' };
  if (childState.status === 'registered') return { label: '신청 완료', tone: 'success' };
  if (past) return null;
  if (childState.canRegister) return { label: '신청 가능', tone: 'primary' };
  if (childState.reason === 'child_pending') return { label: '선생님 확인 후 신청', tone: 'warning' };
  return { label: '접수 마감', tone: 'gray' };
};
