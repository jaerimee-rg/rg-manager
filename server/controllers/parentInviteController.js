import ParentInvite from '../models/ParentInvite.js';
import { APP_URL } from '../utils/appUrl.js';

const inviteUrl = (token) => `${APP_URL}/invite/${token}`;

const present = (invite) => ({
  token: invite.token,
  url: inviteUrl(invite.token),
  expiresAt: invite.expiresAt,
  createdAt: invite.createdAt,
  updatedAt: invite.updatedAt
});

/** 선생님의 초대 링크 (없으면 만들어서 돌려준다) */
export const getInvite = async (req, res) => {
  try {
    const invite = await ParentInvite.getOrCreate(req.user.id);
    res.json(present(invite));
  } catch (error) {
    console.error('초대 링크 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** 링크 재발급 — 기존 링크는 즉시 무효가 된다 (이미 가입한 학부모는 영향 없음) */
export const regenerateInvite = async (req, res) => {
  try {
    const invite = await ParentInvite.regenerate(req.user.id);
    res.json(present(invite));
  } catch (error) {
    console.error('초대 링크 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 학부모가 링크를 열었을 때 (비로그인 공개).
 * 선생님 id 같은 내부 정보는 내려보내지 않는다.
 */
export const checkInvite = async (req, res) => {
  try {
    const invite = await ParentInvite.getByToken(req.params.token);

    if (!ParentInvite.isUsable(invite)) {
      return res.status(404).json({ error: '유효하지 않은 초대 링크입니다.' });
    }

    res.json({ valid: true, teacherName: invite.teacherName });
  } catch (error) {
    console.error('초대 링크 처리 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getInvite, regenerateInvite, checkInvite };
