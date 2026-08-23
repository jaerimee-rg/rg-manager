import crypto from 'crypto';

/**
 * 이벤트 공통 규칙. DB 를 모르는 순수 함수와, 대회 ↔ 이벤트 동기화를 함께 둔다.
 * (동기화 쿼리는 models/Event.js 를 통해 실행한다)
 */

export const EVENT_TYPES = ['competition', 'special', 'closure'];
export const isKnownType = (type) => EVENT_TYPES.includes(type);

export const OPTION_LABEL_MAX = 30;
export const OPTION_MAX = 20;

// 대회 종목 프리셋 (client APPARATUS_LIST 와 같은 순서)
export const APPARATUS_PRESET = ['맨손', '볼', '후프', '곤봉', '리본', '줄'];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD) */
export const todayKst = (now = Date.now()) =>
  new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 이벤트 시작 시각(ms). 시간이 없으면 당일 00:00 KST */
export const eventStartMs = (event) => {
  const time = event.startTime || '00:00';
  return Date.parse(`${event.date}T${time}:00+09:00`);
};

/** 이벤트가 끝난 시각(ms). 기간 이벤트는 종료일 끝까지 */
export const eventEndMs = (event) =>
  Date.parse(`${event.endDate || event.date}T23:59:59+09:00`);

/**
 * 옵션 배열을 정규화한다. 라벨을 고쳐도 기존 신청이 깨지지 않도록 id 는 유지한다.
 * @param {Array<{id?:string,label:string}|string>} input
 * @param {Array<{id:string,label:string}>} previous 기존 옵션 (id 유지용)
 */
export const normalizeOptions = (input, previous = []) => {
  if (!Array.isArray(input)) return [];

  const prevById = new Map(previous.map((o) => [o.id, o]));
  const used = new Set();
  const out = [];

  for (const raw of input.slice(0, OPTION_MAX)) {
    const label = String((typeof raw === 'string' ? raw : raw?.label) ?? '').trim().slice(0, OPTION_LABEL_MAX);
    if (!label) continue;

    const wanted = typeof raw === 'object' && raw?.id ? String(raw.id) : null;
    const id = wanted && prevById.has(wanted) && !used.has(wanted)
      ? wanted
      : `opt_${crypto.randomBytes(4).toString('hex')}`;

    used.add(id);
    out.push({ id, label });
  }

  return out;
};

/** 옵션 JSON 문자열 → 배열 (깨진 값은 빈 배열) */
export const parseOptions = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * 학부모가 지금 이 이벤트에 신청할 수 있는지.
 * 사유는 화면 문구를 고르는 데 쓴다.
 */
export const canRegister = (event, child, now = Date.now()) => {
  if (!event) return { ok: false, reason: 'not_found' };
  if (event.type === 'closure') return { ok: false, reason: 'none' };
  if (event.isPublished === false) return { ok: false, reason: 'hidden' };
  if (event.registrationOpen === false) return { ok: false, reason: 'closed' };

  if (event.registrationDeadline && now >= Date.parse(event.registrationDeadline)) {
    return { ok: false, reason: 'deadline' };
  }

  if (now >= eventStartMs(event)) return { ok: false, reason: 'started' };
  if (!child || child.status !== 'linked' || !child.studentId) {
    return { ok: false, reason: 'child_pending' };
  }

  return { ok: true, reason: null };
};

/** 대회 행 → 이벤트 필드 (미러 생성·갱신에 함께 쓴다) */
export const competitionToEventFields = (competition) => ({
  userId: competition.userId,
  type: 'competition',
  title: competition.name,
  date: competition.date,
  location: competition.location,
  competitionId: competition.id
});

export default {
  EVENT_TYPES,
  isKnownType,
  APPARATUS_PRESET,
  todayKst,
  eventStartMs,
  eventEndMs,
  normalizeOptions,
  parseOptions,
  canRegister,
  competitionToEventFields
};
