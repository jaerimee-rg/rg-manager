/**
 * 사진 폴더 공유 링크 (선생님 → 학부모, docs/photo-menu FR-518).
 *
 * 링크는 학부모 앱의 앨범 주소에 선생님의 학부모 초대 토큰을 붙인 것이다:
 *   `/parent/photos/<eventId>?invite=<token>`
 * - 이미 가입한 학부모: 로그인 뒤 그 앨범이 열린다(초대 값은 쓰이지 않는다).
 * - 처음 온 학부모: 그 초대로 가입 → 아이 등록 → 그 앨범.
 * - 다른 선생님 쪽으로만 가입한 학부모: 그 초대로 이 선생님과 연결된 뒤 열린다.
 * 누가 볼 수 있는지는 링크가 아니라 앨범의 공개 여부·공개 범위가 정한다.
 * 초대 토큰이 없으면(만들지 못했거나 만료) 앨범 주소만 준다 — 이미 가입한 학부모에게는 그대로 쓸 수 있다.
 */
export const parentAlbumPath = (eventId) => `/parent/photos/${eventId}`;

export const albumSharePath = (eventId, inviteToken) => {
  const path = parentAlbumPath(eventId);
  return inviteToken ? `${path}?invite=${encodeURIComponent(inviteToken)}` : path;
};

export default { parentAlbumPath, albumSharePath };
