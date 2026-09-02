/**
 * 이벤트 공유 링크 (선생님 → 학부모).
 *
 * 링크는 학부모 앱의 이벤트 주소 그대로다: `https://<도메인>/parent/events/<id>`.
 * 토큰이 따로 없다 — 열어 보는 쪽은 어차피 로그인한 학부모여야 하고, 서버가
 * "그 선생님과 연결된 학부모의 공개 이벤트" 인지 확인한다(아니면 404).
 * 로그인이 안 돼 있으면 로그인 화면을 거쳐 같은 주소로 돌아온다(utils/returnTo.js).
 */

export const parentEventPath = (eventId) => `/parent/events/${eventId}`;

export const eventShareUrl = (eventId, origin = window.location.origin) =>
  `${origin}${parentEventPath(eventId)}`;

/** 비공개 이벤트는 학부모에게 404 라 링크를 보내 봐야 소용없다 */
export const canShareEvent = (event) => Boolean(event) && event.isPublished !== false;

export const SHARE_DISABLED_HINT = '공개한 이벤트만 공유할 수 있어요';

export default { parentEventPath, eventShareUrl, canShareEvent, SHARE_DISABLED_HINT };
