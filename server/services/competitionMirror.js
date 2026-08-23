import pool from '../database.js';
import Event from '../models/Event.js';
import { competitionToEventFields } from './eventService.js';

/**
 * 대회(competitions) ↔ 이벤트(events) 1:1 동기화.
 *
 * 이벤트가 일정의 단일 출처지만, 대회는 기존 화면(참가 학생·종목·참가비)이 계속 쓰므로
 * 두 곳에 나눠 저장한다. 어느 화면에서 고쳐도 어긋나지 않도록 쓰기는 여기를 거친다.
 *
 * 기존 대회 기능이 최우선이라 **동기화 실패는 삼킨다** — 대회 등록은 성공시키고,
 * 빠진 이벤트는 다음 부팅의 백필이 메운다.
 */

const warn = (action, error) =>
  console.error(`대회-이벤트 동기화(${action}) 실패, 대회 작업은 계속합니다:`, error?.message || error);

/** 대회를 새로 만들었을 때 이벤트를 함께 만든다 (이미 있으면 갱신) */
export const mirrorFromCompetition = async (competition) => {
  if (!competition?.id) return null;

  try {
    const existing = await Event.getByCompetitionId(competition.id);
    const fields = competitionToEventFields(competition);

    if (existing) {
      return await Event.update(
        existing.id,
        { ...existing, ...fields, options: existing.options },
        competition.userId,
        'admin'
      );
    }

    // 옛 화면에서 만든 대회가 학부모에게 곧바로 접수되지 않도록 접수는 닫아 둔다.
    return await Event.create({ ...fields, isPublished: true, registrationOpen: false, options: [] });
  } catch (error) {
    warn('생성', error);
    return null;
  }
};

/** 대회를 수정했을 때 이벤트의 이름·날짜·장소를 맞춘다 */
export const syncCompetitionMirror = async (competition) => {
  if (!competition?.id) return null;

  try {
    const existing = await Event.getByCompetitionId(competition.id);
    if (!existing) return mirrorFromCompetition(competition);

    const fields = competitionToEventFields(competition);
    return await Event.update(
      existing.id,
      { ...existing, ...fields },
      competition.userId,
      'admin'
    );
  } catch (error) {
    warn('수정', error);
    return null;
  }
};

/**
 * 기존 대회를 이벤트로 옮긴다. 매 부팅마다 실행돼도 안전해야 하므로
 * 이미 연결된 대회는 건너뛴다(NOT EXISTS). 접수는 닫힌 상태로 만든다.
 */
export const backfillCompetitionEvents = async (client = pool) => {
  const now = new Date().toISOString();
  const result = await client.query(
    `INSERT INTO events
       ("userId", type, title, date, location, options, "isPublished", "registrationOpen",
        "competitionId", "createdAt", "updatedAt")
     SELECT c."userId", 'competition', c.name, c.date, c.location, '[]', TRUE, FALSE,
            c.id, $1, $1
     FROM competitions c
     WHERE c."userId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM events e WHERE e."competitionId" = c.id)
     RETURNING id`,
    [now]
  );
  return result.rowCount;
};

export default { mirrorFromCompetition, syncCompetitionMirror, backfillCompetitionEvents };
