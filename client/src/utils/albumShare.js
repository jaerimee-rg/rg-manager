/**
 * 사진 폴더 공유 링크 (선생님 → 학부모, docs/photo-menu FR-518).
 *
 * 링크는 학부모 앱의 앨범 주소에 선생님의 학부모 초대 토큰을 붙인 것이다:
 *   `https://<도메인>/parent/photos/<eventId>?invite=<token>`
 * 서버가 앨범 응답의 `sharePath` 로 만들어 준다(서버 utils/albumShare.js) — 버튼을 누른 그 자리에서
 * 바로 복사해야 해서(사파리는 기다렸다 복사하면 막는다) 미리 받아 둔다.
 *
 *   - 이미 가입한 학부모: 로그인 뒤 그 앨범이 열린다(utils/returnTo.js).
 *   - 처음 온 학부모: 그 초대로 가입 → 아이 등록 → 그 앨범.
 *   - 다른 선생님 쪽으로만 가입한 학부모: 그 초대로 이 선생님과 연결된 뒤 열린다(ParentAlbum).
 * 누가 볼 수 있는지는 링크가 아니라 앨범의 공개 여부·공개 범위가 정한다.
 */

export const parentAlbumPath = (eventId) => `/parent/photos/${eventId}`;

export const albumShareUrl = (album, origin = window.location.origin) =>
  `${origin}${album?.sharePath || parentAlbumPath(album?.eventId)}`;

/** 비공개 앨범은 학부모에게 "아직 공개하지 않은 앨범" 이라 링크를 보내 봐야 소용없다 */
export const canShareAlbum = (album) =>
  Boolean(album) && Boolean(album.driveFolderId) && album.published === true;

export const ALBUM_SHARE_DISABLED_HINT = '학부모에게 공개한 앨범만 공유할 수 있어요';

/** 복사한 뒤 알림 — 공개 범위가 참가 확정 학부모면 그 밖의 학부모는 링크로 와도 못 본다는 것을 알려 준다 */
export const albumShareToast = (album) => (
  album?.audience === 'participants'
    ? '공유 링크를 복사했어요 · 참가 확정 학부모만 볼 수 있어요'
    : '공유 링크를 복사했어요 · 학부모가 로그인(처음이면 가입)하면 이 사진이 바로 열려요'
);

export default { parentAlbumPath, albumShareUrl, canShareAlbum, ALBUM_SHARE_DISABLED_HINT, albumShareToast };
