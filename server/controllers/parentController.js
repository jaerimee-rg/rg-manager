import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import ParentInvite from '../models/ParentInvite.js';
import ParentTeacher from '../models/ParentTeacher.js';
import Student from '../models/Student.js';
import Event from '../models/Event.js';
import EventRegistration from '../models/EventRegistration.js';
import ChildFaceProfile from '../models/ChildFaceProfile.js';
import Competition from '../models/Competition.js';
import EventMedia from '../models/EventMedia.js';
import { isConfirmedParent } from '../utils/albumAccess.js';
import { thumbnailUrl } from '../utils/mediaSerializer.js';
import { matchChild, defaultParentName } from '../services/parentOnboarding.js';
import { teacherIdsOf, teachersOf, childBelongsToEvent } from '../services/parentScope.js';
import { extractInviteToken } from '../utils/oauthState.js';
import { canRegister, todayKst } from '../services/eventService.js';
import { sendEventRegistrationKakaoMessage } from '../utils/kakaoMessage.js';

export const CHILD_NAME_MAX = 20;
export const PARENT_NAME_MAX = 20;
export const MAX_CHILDREN = 10;

const notFound = (res) => res.status(404).json({ error: '찾을 수 없습니다.' });

/**
 * 선생님에게 신청 소식을 알린다.
 * 신청은 이미 저장된 뒤라 알림이 실패해도 학부모 응답을 막지 않는다.
 */
const notifyTeacher = async ({ event, child, optionIds, action }) => {
  try {
    const labels = (event.options || [])
      .filter((o) => (optionIds || []).includes(o.id))
      .map((o) => o.label);

    await sendEventRegistrationKakaoMessage({
      // 학부모가 여러 선생님과 연결될 수 있으므로 **이 이벤트를 만든 선생님**에게 보낸다.
      // (학부모의 소속 선생님을 쓰면 엉뚱한 선생님에게 갈 수 있다 — FR-374)
      userId: event.userId,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      childName: child.childName,
      optionLabels: labels,
      action
    });
  } catch (error) {
    console.error('이벤트 신청 알림 처리 오류:', error?.message || error);
  }
};

/* 스코프는 services/parentScope 한 곳에서만 만든다.
   학부모가 여러 선생님과 연결될 수 있어(FR-350) 선생님 한 명을 고르면 안 된다. */

/** 학부모 화면에 내려보낼 자녀 정보 (다른 집 정보는 담지 않는다) */
const presentChild = (child) => ({
  id: child.id,
  childName: child.childName,
  childBirthdate: child.childBirthdate,
  status: child.status,
  studentId: child.studentId,
  studentName: child.studentName || null,
  // 어느 선생님의 아이인지 (선생님이 여럿일 때 화면이 구분해 보여준다)
  teacherId: child.teacherId,
  teacherName: child.teacherName || null
});

export const getMe = async (req, res) => {
  try {
    const teachers = await teachersOf(req.user.id);
    const children = await ParentChild.listByParent(req.user.id);
    const account = await ParentAccount.getByUserId(req.user.id);

    // 자녀별 얼굴 사진 등록 여부 — "우리 아이만" 안내를 띄울지 화면이 정한다.
    // 여기가 실패해도 내 정보 화면 자체는 떠야 하므로 0 으로 두고 넘어간다.
    const linkedIds = children.filter((child) => child.studentId).map((child) => child.studentId);
    let faceCounts = {};
    try {
      faceCounts = await ChildFaceProfile.countsByStudents(linkedIds);
    } catch (error) {
      console.error('자녀 얼굴 등록 수 조회 실패(0 으로 표시):', error?.message || error);
    }

    res.json({
      /* displayName 은 학부모가 정한 별명("예림엄마"), username 은 카카오 닉네임.
         아직 정하지 않은 옛 계정은 null 이라 화면이 username 으로 되돌린다. */
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: account?.displayName || null
      },
      // 연결된 선생님 전부 (FR-353)
      teachers,
      // 옛 클라이언트 호환 — 대표(첫) 선생님. 한 배포 주기 뒤 제거한다.
      teacher: teachers[0] ? { name: teachers[0].name } : null,
      children: children.map((child) => ({
        ...presentChild(child),
        faceProfileCount: child.studentId ? (faceCounts[child.studentId] || 0) : 0
      }))
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 학부모 표시 이름 검사. 통과하면 다듬은 값을, 아니면 오류 메시지를 준다. */
const cleanParentName = (value) => {
  const name = String(value ?? '').trim();
  if (name.length > PARENT_NAME_MAX) {
    return { error: `학부모명은 ${PARENT_NAME_MAX}자 이내로 입력해주세요.` };
  }
  return { name };
};

/**
 * 온보딩·자녀 추가. 이름·생년월일이 선생님의 학생과 정확히 하나 맞으면 바로 연결하고,
 * 아니면 확인 대기로 두어 가입 자체는 끝난다 (오타로 막히지 않도록).
 *
 * 온보딩에서는 학부모명("예림엄마")도 함께 받는다. 비워서 보내면 첫 아이 이름으로
 * 기본값을 만들어 넣는다 — 화면이 자동으로 채우지만 서버도 같은 규칙을 갖는다.
 */
export const addChildren = async (req, res) => {
  try {
    const teachers = await teachersOf(req.user.id);
    if (!teachers.length) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    /* 아이는 선생님 1명의 학생에 대응한다 (FR-354).
       선생님이 여럿이면 화면이 골라 보내고, 하나면 그 선생님으로 정한다. */
    const requested = req.body.teacherId;
    const teacher = requested
      ? teachers.find((row) => String(row.id) === String(requested))
      : (teachers.length === 1 ? teachers[0] : null);

    if (!teacher) {
      return res.status(400).json({ error: '어느 선생님의 아이인지 선택해 주세요.', needsTeacher: true });
    }

    const input = Array.isArray(req.body.children) ? req.body.children : [];
    if (input.length === 0) return res.status(400).json({ error: '아이 정보를 입력해주세요.' });

    const existing = await ParentChild.listByParent(req.user.id);
    if (existing.length + input.length > MAX_CHILDREN) {
      return res.status(400).json({ error: `아이는 최대 ${MAX_CHILDREN}명까지 등록할 수 있습니다.` });
    }

    const cleaned = [];
    for (const raw of input) {
      const name = String(raw?.name ?? '').trim();
      const birthdate = String(raw?.birthdate ?? '').trim();

      if (!name) return res.status(400).json({ error: '아이 이름을 입력해주세요.' });
      if (name.length > CHILD_NAME_MAX) {
        return res.status(400).json({ error: `아이 이름은 ${CHILD_NAME_MAX}자 이내로 입력해주세요.` });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
        return res.status(400).json({ error: '생년월일을 선택해주세요.' });
      }
      cleaned.push({ name, birthdate });
    }

    const parentName = cleanParentName(req.body.parentName);
    if (parentName.error) return res.status(400).json({ error: parentName.error });

    /* 학부모명은 가입(첫 아이 등록) 때 한 번 정한다. 나중에 아이를 더 추가할 때
       빈 값이 와도 이미 정해 둔 이름을 지우지 않는다. */
    const account = await ParentAccount.getByUserId(req.user.id);
    const nextName = parentName.name || (account?.displayName ? '' : defaultParentName(cleaned[0].name));
    if (nextName) {
      await ParentAccount.updateDisplayName(req.user.id, nextName);
    }

    // 고른 선생님의 학생 명단과만 대조한다 (FR-356)
    const students = await Student.getAll(teacher.id, 'user');
    const created = [];

    for (const child of cleaned) {
      const match = matchChild(students, { name: child.name, birthdate: child.birthdate });

      // 같은 학생이 이미 연결돼 있으면 중복으로 만들지 않는다
      const duplicate = match.studentId && (await ParentChild.hasStudent(req.user.id, match.studentId));

      const row = await ParentChild.create({
        parentUserId: req.user.id,
        teacherId: teacher.id,
        childName: child.name,
        childBirthdate: child.birthdate,
        studentId: duplicate ? null : match.studentId,
        linkedBy: 'auto'
      });

      created.push(row);
    }

    const children = await ParentChild.listByParent(req.user.id);
    res.status(201).json({
      children: children.map(presentChild),
      created: created.length,
      displayName: nextName || account?.displayName || null
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 내 정보에서 학부모명 바꾸기.
 * users.username 은 카카오 닉네임(식별용)이라 건드리지 않고 별명만 바꾼다.
 */
export const updateName = async (req, res) => {
  try {
    const { name, error } = cleanParentName(req.body.parentName ?? req.body.name);
    if (error) return res.status(400).json({ error });
    if (!name) return res.status(400).json({ error: '학부모명을 입력해주세요.' });

    const account = await ParentAccount.updateDisplayName(req.user.id, name);
    if (!account) return res.status(404).json({ error: '학부모 정보를 찾을 수 없습니다.' });

    res.json({ displayName: account.displayName });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 올해 12월 31일 (KST 기준) */
const endOfYear = (today) => `${today.slice(0, 4)}-12-31`;

/**
 * 일정 화면: 오늘부터 올해 말까지의 공개 이벤트 + 내 자녀들의 신청 상태.
 * 달력 없이 카드로 보여주므로 한 번의 호출로 끝난다.
 */
export const getEvents = async (req, res) => {
  try {
    const teachers = await teachersOf(req.user.id);
    const teacherIds = teachers.map((row) => row.id);

    // 선생님 필터 (화면의 칩). 연결되지 않은 선생님 id 를 보내면 무시한다.
    const filter = req.query.teacherId ? Number(req.query.teacherId) : null;
    const scope = filter && teacherIds.includes(filter) ? [filter] : teacherIds;

    const today = todayKst();
    const children = await ParentChild.listByParent(req.user.id);
    const events = await Event.listUpcomingForParent(scope, today, endOfYear(today));

    const studentIds = children.filter((c) => c.studentId).map((c) => c.studentId);
    const registrations = await EventRegistration.listForStudents(
      events.map((e) => e.id),
      studentIds
    );

    const regKey = (eventId, studentId) => `${eventId}:${studentId}`;
    const regMap = new Map(registrations.map((r) => [regKey(r.eventId, r.studentId), r]));
    const now = Date.now();

    res.json({
      today,
      teachers,
      children: children.map(presentChild),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        title: event.title,
        date: event.date,
        endDate: event.endDate,
        startTime: event.startTime,
        location: event.location,
        // 어느 선생님의 일정인지 (카드 배지)
        teacherId: event.userId,
        teacherName: event.teacherName || null,
        hasOptions: (event.options || []).length > 0,
        optionCount: (event.options || []).length,
        registrationDeadline: event.registrationDeadline,
        /* 자녀별 신청 상태와 신청 가능 여부를 함께 담아 화면이 다시 묻지 않게 한다.
           **그 선생님의 아이만** 후보다 — 김 선생님 아이로 박 선생님 대회에 신청할 수 없다. */
        children: children.filter((child) => childBelongsToEvent(child, event)).map((child) => {
          const reg = child.studentId ? regMap.get(regKey(event.id, child.studentId)) : null;
          const allowed = canRegister(event, child, now);
          return {
            childId: child.id,
            childName: child.childName,
            status: reg && reg.status !== 'cancelled' ? reg.status : null,
            optionIds: reg && reg.status !== 'cancelled' ? reg.optionIds : [],
            canRegister: allowed.ok,
            reason: allowed.reason
          };
        })
      }))
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const getEvent = async (req, res) => {
  try {
    const teacherIds = await teacherIdsOf(req.user.id);

    // 연결되지 않은 선생님의 이벤트는 없는 것으로 취급한다 (FR-372)
    const event = await Event.getPublishedForParent(req.params.id, teacherIds);
    if (!event) return notFound(res);

    const allChildren = await ParentChild.listByParent(req.user.id);
    // 이 이벤트에 신청할 수 있는 건 그 선생님의 아이뿐이다
    const children = allChildren.filter((child) => childBelongsToEvent(child, event));
    const studentIds = children.filter((c) => c.studentId).map((c) => c.studentId);
    const registrations = await EventRegistration.listForStudents([event.id], studentIds);
    const byStudent = new Map(registrations.map((r) => [r.studentId, r]));
    const now = Date.now();

    /* 신청한 학생 명단 — 상세 화면 아래에 "누가 같이 가는지" 를 보여준다.
       학부모에게는 **이름·상태·옵션**만 준다. 다른 집의 학부모명·학생 id·생년월일은 내려보내지 않고,
       취소한 신청은 명단에서 뺀다. 휴관일은 신청 자체가 없다. */
    let roster = [];
    if (event.type !== 'closure') {
      const labelById = new Map((event.options || []).map((o) => [o.id, o.label]));
      const mine = new Set(studentIds);
      const rows = await EventRegistration.listByEvent(event.id);
      roster = rows
        .filter((r) => r.status !== 'cancelled')
        .map((r) => ({
          studentName: r.studentName,
          status: r.status,
          options: (r.optionIds || []).map((id) => labelById.get(id)).filter(Boolean),
          mine: mine.has(r.studentId)
        }));
    }

    // 앨범이 있고 자녀가 확정됐으면 상세에서 바로 사진으로 들어갈 수 있게 알려준다.
    // 여기가 실패해도 상세 화면은 떠야 하므로 앨범 정보만 비운다.
    let album = null;
    try {
      if (event.driveFolderId) {
        const confirmedStudentIds = registrations.filter((r) => r.status === 'confirmed').map((r) => r.studentId);
        const competitionStudentIds = event.competitionId ? await Competition.getStudentIds(event.competitionId) : [];
        const confirmed = isConfirmedParent({ childStudentIds: studentIds, confirmedStudentIds, competitionStudentIds });

        if (confirmed) {
          const summaries = await EventMedia.summaries([event.id], { studentIds });
          const counts = summaries[event.id] || { images: 0, videos: 0, mine: 0, previews: [] };
          album = {
            available: true,
            counts: { images: counts.images, videos: counts.videos, mine: counts.mine },
            previews: (counts.previews || []).map((id) => thumbnailUrl(id, 400)),
            uploadOpen: event.albumUploadOpen !== false
          };
        } else {
          album = { available: false, reason: 'not_confirmed' };
        }
      }
    } catch (error) {
      console.error('이벤트 상세의 앨범 정보 조회 실패(생략하고 계속):', error?.message || error);
    }

    res.json({
      album,
      today: todayKst(),
      id: event.id,
      type: event.type,
      title: event.title,
      teacherId: event.userId,
      teacherName: event.teacherName || null,
      date: event.date,
      endDate: event.endDate,
      startTime: event.startTime,
      location: event.location,
      description: event.description,
      options: event.options,
      requireOption: event.requireOption === true,
      registrationDeadline: event.registrationDeadline,
      registrations: roster,
      children: children.map((child) => {
        const reg = child.studentId ? byStudent.get(child.studentId) : null;
        const allowed = canRegister(event, child, now);
        return {
          childId: child.id,
          childName: child.childName,
          status: reg ? reg.status : null,
          optionIds: reg && reg.status !== 'cancelled' ? reg.optionIds : [],
          canRegister: allowed.ok,
          reason: allowed.reason
        };
      })
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 신청에 필요한 것들을 한 번에 확인한다 (내 자녀인지, 내 선생님 이벤트인지) */
const loadForRegistration = async (req) => {
  const teacherIds = await teacherIdsOf(req.user.id);

  const event = await Event.getPublishedForParent(req.params.id, teacherIds);
  if (!event) return { error: 404 };

  const children = await ParentChild.listByParent(req.user.id);
  const child = children.find((c) => String(c.id) === String(req.params.childId));
  if (!child) return { error: 404 };

  // 다른 선생님의 아이로는 이 이벤트에 신청할 수 없다 (AC-323)
  if (!childBelongsToEvent(child, event)) return { error: 404 };

  return { event, child };
};

export const registerChild = async (req, res) => {
  try {
    const loaded = await loadForRegistration(req);
    if (loaded.error) return notFound(res);

    const { event, child } = loaded;
    const allowed = canRegister(event, child);
    if (!allowed.ok) {
      const messages = {
        none: '휴관일은 신청할 수 없어요.',
        hidden: '지금은 신청할 수 없어요.',
        closed: '지금은 접수를 받지 않아요.',
        deadline: '접수가 마감되었어요. 선생님께 문의해 주세요.',
        started: '이미 시작된 일정이에요.',
        child_pending: '선생님이 아이 정보를 확인한 뒤에 신청할 수 있어요.'
      };
      return res.status(400).json({ error: messages[allowed.reason] || '지금은 신청할 수 없어요.' });
    }

    const validIds = new Set((event.options || []).map((o) => o.id));
    const optionIds = (Array.isArray(req.body.optionIds) ? req.body.optionIds : []).filter((id) =>
      validIds.has(id)
    );

    if (event.requireOption && optionIds.length === 0) {
      return res.status(400).json({ error: '옵션을 1개 이상 선택해 주세요.' });
    }

    const existing = await EventRegistration.getByEventAndStudent(event.id, child.studentId);
    const changing = existing && existing.status !== 'cancelled';

    const saved = await EventRegistration.upsertRegistered({
      eventId: event.id,
      studentId: child.studentId,
      parentUserId: req.user.id,
      optionIds,
      createdBy: 'parent'
    });

    await notifyTeacher({
      event,
      child,
      optionIds: saved.optionIds,
      action: changing ? 'updated' : 'registered'
    });

    res.json({ status: saved.status, optionIds: saved.optionIds });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 신청 취소. 신청할 수 있는 기간 안에서는 자유롭게 되돌릴 수 있다.
 * 확정된 신청을 취소하면 선생님이 알아볼 수 있도록 표시가 남는다.
 */
export const cancelChild = async (req, res) => {
  try {
    const loaded = await loadForRegistration(req);
    if (loaded.error) return notFound(res);

    const { event, child } = loaded;
    const allowed = canRegister(event, child);
    if (!allowed.ok && allowed.reason !== 'child_pending') {
      return res.status(400).json({ error: '접수가 끝나 취소할 수 없어요. 선생님께 문의해 주세요.' });
    }

    const cancelled = await EventRegistration.cancel(event.id, child.studentId);
    if (!cancelled) return res.status(404).json({ error: '신청 내역이 없습니다.' });

    await notifyTeacher({
      event,
      child,
      optionIds: cancelled.optionIds,
      action: cancelled.cancelledAfterConfirm ? 'cancelled_after_confirm' : 'cancelled'
    });

    res.json({
      status: cancelled.status,
      cancelledAfterConfirm: cancelled.cancelledAfterConfirm === true
    });
  } catch (error) {
    console.error('학부모 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 학부모가 초대 링크를 붙여넣어 선생님을 추가한다 (FR-353).
 * 링크가 있어야만 연결되므로 권한이 늘어나지 않는다.
 */
export const addTeacher = async (req, res) => {
  try {
    const token = extractInviteToken(req.body?.invite);
    if (!token) return res.status(400).json({ error: '초대 링크를 입력해 주세요.' });

    const invite = await ParentInvite.getByToken(token);
    if (!ParentInvite.isUsable(invite)) {
      return res.status(400).json({ error: '유효하지 않은 초대 링크입니다. 선생님께 새 링크를 요청해 주세요.' });
    }

    const already = await ParentTeacher.isLinked(req.user.id, invite.userId);
    await ParentAccount.create({ userId: req.user.id, teacherId: invite.userId, inviteId: invite.id });

    res.status(already ? 200 : 201).json({
      teachers: await teachersOf(req.user.id),
      alreadyLinked: already
    });
  } catch (error) {
    console.error('선생님 연결 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getMe, addChildren, getEvents, getEvent, registerChild, cancelChild, addTeacher };
