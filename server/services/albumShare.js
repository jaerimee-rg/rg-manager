import ParentInvite from '../models/ParentInvite.js';
import { albumSharePath } from '../utils/albumShare.js';

/**
 * 사진 폴더 공유 링크의 경로 (docs/photo-menu FR-518) — 앨범 주소 + 이 앨범 **주인 선생님**의 학부모 초대 토큰.
 * 초대는 선생님당 하나라 없으면 여기서 만든다(학부모 메뉴의 초대 링크와 같은 것).
 * 선생님 앨범 화면과, 그 앨범을 볼 수 있는 학부모의 앨범 화면 양쪽에 준다 — 학부모도 다른 학부모에게 보낸다.
 * 초대를 읽지 못해도 화면은 떠야 한다 — 그때는 초대 없는 주소만 준다(이미 가입한 학부모에게는 그대로 쓸 수 있다).
 */
export const sharePathFor = async (event) => {
  try {
    const invite = await ParentInvite.getOrCreate(event.userId);
    return albumSharePath(event.id, ParentInvite.isUsable(invite) ? invite.token : null);
  } catch (error) {
    console.error('공유 링크용 초대 조회 실패:', error?.message || error);
    return albumSharePath(event.id, null);
  }
};

export default { sharePathFor };
