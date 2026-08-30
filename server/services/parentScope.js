import ParentTeacher from '../models/ParentTeacher.js';
import Event from '../models/Event.js';

/**
 * 학부모가 무엇을 볼 수 있는지 정하는 단 하나의 자리
 * (docs/accounts-roles 02 §2.10).
 *
 * 예전에는 컨트롤러마다 `ParentAccount.getByUserId().teacherId` 로 선생님 한 명을
 * 얻어 썼다. 학부모가 여러 선생님과 연결되면서 스코프가 배열이 되었고, 누락되면
 * 곧바로 "다른 선생님 데이터가 보인다" 가 되므로 이 모듈만 쓰도록 모았다.
 */

/** 연결된 선생님 id 배열 (없으면 빈 배열) */
export const teacherIdsOf = (parentUserId) => ParentTeacher.teacherIds(parentUserId);

/** 연결된 선생님 (id·이름·연결 시각) */
export const teachersOf = (parentUserId) => ParentTeacher.listTeachers(parentUserId);

/**
 * 이벤트를 읽고 **그 이벤트를 소유한 선생님과 연결돼 있는지**까지 확인한다 (FR-370).
 * 연결이 없으면 null → 컨트롤러는 404 로 답한다(존재 자체를 알리지 않는다, FR-372).
 */
export const scopedEvent = async (parentUserId, eventId, teacherIds) => {
  const ids = teacherIds || (await teacherIdsOf(parentUserId));
  if (!ids.length) return null;

  const event = await Event.getPublishedForParent(eventId, ids);
  return event || null;
};

/**
 * 자녀가 이 이벤트에 신청할 수 있는 자녀인지 (FR-371, AC-323).
 * 자녀는 선생님 1명의 학생이므로 이벤트 소유자와 같아야 한다 —
 * 김 선생님 아이로 박 선생님 대회에 신청할 수 없다.
 */
export const childBelongsToEvent = (child, event) =>
  Boolean(child) && Boolean(event) && Number(child.teacherId) === Number(event.userId);

export default { teacherIdsOf, teachersOf, scopedEvent, childBelongsToEvent };
