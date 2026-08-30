import TeacherInvite, { DEFAULT_EXPIRES_DAYS } from '../models/TeacherInvite.js';
import { APP_URL } from '../utils/appUrl.js';

/**
 * 선생님 초대 (docs/accounts-roles FR-340~348).
 * 관리자만 발급·조회·회수하고, 랜딩 확인만 공개다.
 */

const inviteUrl = (token) => `${APP_URL}/teacher-invite/${token}`;

/** 목록에 토큰 원문을 내보내지 않는다 — 링크(URL) 로만 다룬다 (NFR-306) */
const present = (invite) => ({
  id: invite.id,
  url: inviteUrl(invite.token),
  label: invite.label,
  status: TeacherInvite.statusOf(invite),
  expiresAt: invite.expiresAt,
  usedAt: invite.usedAt,
  usedByName: invite.usedByName || null,
  createdByName: invite.createdByName || null,
  revokedAt: invite.revokedAt,
  createdAt: invite.createdAt
});

export const listInvites = async (req, res) => {
  try {
    const invites = await TeacherInvite.list();
    res.json({
      invites: invites.map(present),
      defaultExpiresInDays: DEFAULT_EXPIRES_DAYS
    });
  } catch (error) {
    console.error('선생님 초대 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const createInvite = async (req, res) => {
  try {
    const { label, expiresInDays } = req.body || {};

    const invite = await TeacherInvite.create({
      createdBy: req.user.id,
      label,
      // 값을 안 보내면 기본 14일, 0/null 이면 만료 없음
      expiresInDays: expiresInDays === undefined ? DEFAULT_EXPIRES_DAYS : expiresInDays
    });

    res.status(201).json(present(invite));
  } catch (error) {
    console.error('선생님 초대 발급 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const revokeInvite = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const existing = await TeacherInvite.getById(id);
    if (!existing) return res.status(404).json({ error: '초대를 찾을 수 없습니다.' });

    const revoked = await TeacherInvite.revoke(id);
    if (!revoked) {
      // 이미 쓰인 초대는 회수해도 의미가 없다 (가입은 이미 끝났다)
      return res.status(409).json({ error: '이미 사용된 초대는 회수할 수 없습니다.' });
    }

    res.json(present(revoked));
  } catch (error) {
    console.error('선생님 초대 회수 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 초대 링크를 연 사람이 보는 확인 (비로그인 공개).
 * 관리자 이름 외에 내부 정보(id·이메일)는 내려보내지 않는다 (FR-348).
 */
export const checkInvite = async (req, res) => {
  try {
    const invite = await TeacherInvite.getByToken(req.params.token);

    if (!TeacherInvite.isUsable(invite)) {
      return res.status(404).json({ error: '유효하지 않은 초대 링크입니다.' });
    }

    res.json({ valid: true, adminName: invite.createdByName || null, expiresAt: invite.expiresAt });
  } catch (error) {
    console.error('선생님 초대 확인 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { listInvites, createInvite, revokeInvite, checkInvite };
