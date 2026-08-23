import pool from '../database.js';
import Event from '../models/Event.js';
import EventRegistration from '../models/EventRegistration.js';
import Competition from '../models/Competition.js';
import {
  isKnownType,
  normalizeOptions,
  todayKst,
  parseOptions
} from '../services/eventService.js';

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;

const notFound = (res) => res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * 폼 입력을 검증해 저장할 값으로 다듬는다.
 * 종류에 따라 쓰지 않는 필드는 비워서 화면과 데이터가 어긋나지 않게 한다.
 */
const parseBody = (body, { type, previousOptions = [] }) => {
  const title = String(body.title ?? '').trim();
  if (!title) return { error: '이벤트 이름을 입력해주세요.' };
  if (title.length > TITLE_MAX) return { error: `이벤트 이름은 ${TITLE_MAX}자 이내로 입력해주세요.` };

  const date = String(body.date ?? '').trim();
  if (!DATE_RE.test(date)) return { error: '날짜를 선택해주세요.' };

  const endDate = String(body.endDate ?? '').trim() || null;
  if (endDate && !DATE_RE.test(endDate)) return { error: '종료일 형식이 올바르지 않습니다.' };
  if (endDate && endDate < date) return { error: '종료일은 시작일보다 빠를 수 없습니다.' };

  const startTime = String(body.startTime ?? '').trim() || null;
  if (startTime && !TIME_RE.test(startTime)) return { error: '시간 형식이 올바르지 않습니다.' };

  const isClosure = type === 'closure';
  const location = isClosure ? null : String(body.location ?? '').trim();
  if (!isClosure && !location) return { error: '장소를 입력해주세요.' };

  const description = String(body.description ?? '').trim().slice(0, DESCRIPTION_MAX) || null;
  const options = isClosure ? [] : normalizeOptions(body.options, previousOptions);

  return {
    value: {
      type,
      title,
      date,
      endDate,
      startTime,
      location,
      description,
      options,
      requireOption: !isClosure && body.requireOption === true && options.length > 0,
      isPublished: body.isPublished !== false,
      registrationOpen: isClosure ? false : body.registrationOpen !== false,
      registrationDeadline: isClosure ? null : (String(body.registrationDeadline ?? '').trim() || null)
    }
  };
};

/* ─────────── 이벤트 CRUD ─────────── */

export const getEvents = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { type, includePast, filterUserId } = req.query;

    let targetUserId = userId;
    if (role === 'admin' && filterUserId) {
      if (filterUserId === 'all') {
        targetUserId = null;
      } else {
        const parsed = parseInt(filterUserId, 10);
        if (isNaN(parsed)) return res.status(400).json({ error: '잘못된 사용자 ID입니다.' });
        targetUserId = parsed;
      }
    }

    const events = await Event.getAll(targetUserId, role, {
      type: type && isKnownType(type) ? type : undefined,
      includePast: includePast === 'true',
      today: todayKst()
    });

    res.json(events);
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getEvent = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);
    res.json(event);
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 이벤트를 만든다. 대회형은 기존 competitions 행을 함께 만들어 1:1 로 묶는다
 * (참가 학생·종목·참가비 화면이 그대로 동작하도록).
 */
export const createEvent = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: userId } = req.user;
    const type = String(req.body.type ?? '').trim();

    if (!isKnownType(type)) return res.status(400).json({ error: '이벤트 종류를 선택해주세요.' });

    const parsed = parseBody(req.body, { type });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    await client.query('BEGIN');

    let competitionId = null;
    if (type === 'competition') {
      const comp = await client.query(
        `INSERT INTO competitions (name, date, location, "userId", "createdAt")
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [parsed.value.title, parsed.value.date, parsed.value.location, userId, new Date().toISOString()]
      );
      competitionId = comp.rows[0].id;
    }

    const event = await Event.create({ ...parsed.value, userId, competitionId }, client);
    await client.query('COMMIT');

    res.status(201).json(event);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
};

export const updateEvent = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: userId, role } = req.user;
    const existing = await Event.getById(req.params.id, userId, role);
    if (!existing) return notFound(res);

    // 종류는 바꿀 수 없다 — 대회형만 competitions 행을 갖기 때문에
    // 종류를 바꾸면 참가 학생·참가비 데이터가 갈 곳을 잃는다.
    if (req.body.type && req.body.type !== existing.type) {
      return res.status(400).json({ error: '이벤트 종류는 변경할 수 없습니다. 새로 등록해 주세요.' });
    }

    const parsed = parseBody(req.body, { type: existing.type, previousOptions: existing.options });
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // 신청이 걸린 옵션이 사라지면 화면에서 알려줄 수 있도록 수를 세어 함께 돌려준다.
    const keptIds = new Set(parsed.value.options.map((o) => o.id));
    const removedIds = existing.options.filter((o) => !keptIds.has(o.id)).map((o) => o.id);
    let removedOptionRegistrations = 0;

    if (removedIds.length > 0) {
      const regs = await EventRegistration.listByEvent(existing.id);
      removedOptionRegistrations = regs.filter(
        (r) => r.status !== 'cancelled' && r.optionIds.some((id) => removedIds.includes(id))
      ).length;
    }

    await client.query('BEGIN');

    const updated = await Event.update(existing.id, parsed.value, userId, role, client);

    // 대회형은 이름·날짜·장소를 기존 대회 행에도 반영한다.
    if (existing.competitionId) {
      await client.query(
        `UPDATE competitions SET name = $1, date = $2, location = $3 WHERE id = $4`,
        [parsed.value.title, parsed.value.date, parsed.value.location, existing.competitionId]
      );
    }

    await client.query('COMMIT');

    res.json({ ...updated, removedOptionRegistrations });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    client.release();
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const deleted = await Event.delete(req.params.id, userId, role);
    if (!deleted) return notFound(res);

    // 대회형이면 연결된 대회도 함께 지운다 (참가 학생은 CASCADE).
    if (deleted.competitionId) {
      await Competition.delete(deleted.competitionId, userId, role);
    }

    res.json({ message: '이벤트가 삭제되었습니다.' });
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/* ─────────── 신청 현황 ─────────── */

export const getRegistrations = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);

    const registrations = await EventRegistration.listByEvent(event.id);
    const labelById = new Map(event.options.map((o) => [o.id, o.label]));

    const rows = registrations.map((r) => ({
      ...r,
      options: r.optionIds.map((id) => ({ id, label: labelById.get(id) || '(삭제된 옵션)' }))
    }));

    // 옵션별 인원 (취소는 빼고 센다)
    const counts = new Map(event.options.map((o) => [o.id, 0]));
    for (const r of rows) {
      if (r.status === 'cancelled') continue;
      for (const id of r.optionIds) {
        if (counts.has(id)) counts.set(id, counts.get(id) + 1);
      }
    }

    res.json({
      event: {
        id: event.id,
        type: event.type,
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        options: event.options,
        competitionId: event.competitionId
      },
      summary: event.options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) || 0 })),
      activeCount: rows.filter((r) => r.status !== 'cancelled').length,
      registrations: rows
    });
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 대회 신청을 확정한다 → 기존 참가 학생(competition_students)으로 올린다.
 * 종목은 비워 두고 선생님이 기존 화면에서 채운다.
 */
export const confirmRegistration = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);
    if (event.type !== 'competition') {
      return res.status(400).json({ error: '대회 이벤트만 확정할 수 있습니다.' });
    }

    const registration = await EventRegistration.getById(req.params.regId);
    if (!registration || String(registration.eventId) !== String(event.id)) {
      return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });
    }
    if (registration.status === 'cancelled') {
      return res.status(400).json({ error: '취소된 신청은 확정할 수 없습니다.' });
    }

    await Competition.addStudent(event.competitionId, registration.studentId);
    const confirmed = await EventRegistration.confirm(registration.id);

    res.json(confirmed);
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const confirmAllRegistrations = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);
    if (event.type !== 'competition') {
      return res.status(400).json({ error: '대회 이벤트만 확정할 수 있습니다.' });
    }

    const registrations = await EventRegistration.listByEvent(event.id);
    const targets = registrations.filter((r) => r.status === 'registered');

    for (const r of targets) {
      await Competition.addStudent(event.competitionId, r.studentId);
      await EventRegistration.confirm(r.id);
    }

    res.json({ confirmed: targets.length });
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 선생님이 학부모 대신 신청·취소 (전화로 받은 경우) */
export const registerStudent = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);
    if (event.type === 'closure') {
      return res.status(400).json({ error: '휴관일은 신청할 수 없습니다.' });
    }

    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: '잘못된 학생 ID입니다.' });

    const validIds = new Set(event.options.map((o) => o.id));
    const optionIds = (Array.isArray(req.body.optionIds) ? req.body.optionIds : []).filter((id) =>
      validIds.has(id)
    );

    const saved = await EventRegistration.upsertRegistered({
      eventId: event.id,
      studentId,
      parentUserId: null,
      optionIds,
      createdBy: 'teacher'
    });

    res.json(saved);
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const cancelStudentRegistration = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const event = await Event.getById(req.params.id, userId, role);
    if (!event) return notFound(res);

    const cancelled = await EventRegistration.cancel(event.id, parseInt(req.params.studentId, 10));
    if (!cancelled) return res.status(404).json({ error: '신청을 찾을 수 없습니다.' });

    res.json(cancelled);
  } catch (error) {
    console.error('이벤트 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getRegistrations,
  confirmRegistration,
  confirmAllRegistrations,
  registerStudent,
  cancelStudentRegistration
};
