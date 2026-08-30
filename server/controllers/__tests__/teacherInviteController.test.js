import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/TeacherInvite.js', () => ({
  default: {
    create: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    getByToken: jest.fn(),
    revoke: jest.fn(),
    isUsable: jest.fn(() => false),
    // 상태 파생은 실제 규칙을 그대로 쓴다 (목록 표시를 검증하기 위해)
    statusOf: jest.fn((invite) => {
      if (!invite) return 'invalid';
      if (invite.revokedAt) return 'revoked';
      if (invite.usedAt) return 'used';
      if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) return 'expired';
      return 'pending';
    })
  },
  DEFAULT_EXPIRES_DAYS: 14
}));

const TeacherInvite = (await import('../../models/TeacherInvite.js')).default;
const controller = await import('../teacherInviteController.js');

describe('teacherInviteController', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, user: { id: 1, role: 'admin' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.clearAllMocks();
  });

  describe('createInvite', () => {
    it('메모와 만료일로 초대를 만들고 링크를 돌려준다', async () => {
      req.body = { label: '김리듬 선생님에게', expiresInDays: 7 };
      TeacherInvite.create.mockResolvedValue({
        id: 5, token: 'TOK', label: '김리듬 선생님에게',
        expiresAt: '2026-09-06T00:00:00.000Z', createdAt: '2026-08-30T00:00:00.000Z'
      });

      await controller.createInvite(req, res);

      expect(TeacherInvite.create).toHaveBeenCalledWith({
        createdBy: 1, label: '김리듬 선생님에게', expiresInDays: 7
      });
      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.url).toContain('/teacher-invite/TOK');
      expect(payload.status).toBe('pending');
    });

    it('만료일을 안 보내면 기본 14일을 쓴다', async () => {
      TeacherInvite.create.mockResolvedValue({ id: 6, token: 'T', createdAt: 'x' });

      await controller.createInvite(req, res);

      expect(TeacherInvite.create).toHaveBeenCalledWith(expect.objectContaining({ expiresInDays: 14 }));
    });
  });

  describe('listInvites', () => {
    it('상태를 파생해 돌려주고 토큰 원문은 노출하지 않는다', async () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const future = new Date(Date.now() + 86400000).toISOString();

      TeacherInvite.list.mockResolvedValue([
        { id: 1, token: 'A', label: '대기', expiresAt: future, createdAt: 'c' },
        { id: 2, token: 'B', label: '사용', usedAt: 'u', usedByName: '박지우', createdAt: 'c' },
        { id: 3, token: 'C', label: '만료', expiresAt: past, createdAt: 'c' },
        { id: 4, token: 'D', label: '회수', revokedAt: 'r', createdAt: 'c' }
      ]);

      await controller.listInvites(req, res);

      const { invites } = res.json.mock.calls[0][0];
      expect(invites.map((i) => i.status)).toEqual(['pending', 'used', 'expired', 'revoked']);
      // 토큰은 url 안에만 있고 별도 필드로 새어 나가지 않는다
      expect(invites.every((i) => i.token === undefined)).toBe(true);
      expect(invites[1].usedByName).toBe('박지우');
    });
  });

  describe('revokeInvite', () => {
    it('미사용 초대를 회수한다', async () => {
      req.params = { id: '5' };
      TeacherInvite.getById.mockResolvedValue({ id: 5, token: 'T' });
      TeacherInvite.revoke.mockResolvedValue({ id: 5, token: 'T', revokedAt: 'now', createdAt: 'c' });

      await controller.revokeInvite(req, res);

      expect(res.json.mock.calls[0][0].status).toBe('revoked');
    });

    it('이미 사용된 초대는 409', async () => {
      req.params = { id: '5' };
      TeacherInvite.getById.mockResolvedValue({ id: 5, usedAt: 'x' });
      TeacherInvite.revoke.mockResolvedValue(null);

      await controller.revokeInvite(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('없는 초대는 404', async () => {
      req.params = { id: '999' };
      TeacherInvite.getById.mockResolvedValue(null);

      await controller.revokeInvite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('checkInvite — 공개 랜딩', () => {
    it('유효하면 관리자 이름만 알려준다', async () => {
      req.params = { token: 'TOK' };
      TeacherInvite.getByToken.mockResolvedValue({
        id: 5, token: 'TOK', createdBy: 1, createdByName: '박원장',
        expiresAt: '2026-09-13T00:00:00.000Z'
      });
      TeacherInvite.isUsable.mockReturnValue(true);

      await controller.checkInvite(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload).toEqual({ valid: true, adminName: '박원장', expiresAt: '2026-09-13T00:00:00.000Z' });
      // 내부 식별자는 내려보내지 않는다
      expect(payload.id).toBeUndefined();
      expect(payload.createdBy).toBeUndefined();
      expect(payload.token).toBeUndefined();
    });

    it('무효하면 404 (사용됨·만료·회수 모두)', async () => {
      req.params = { token: 'TOK' };
      TeacherInvite.getByToken.mockResolvedValue({ id: 5, usedAt: 'x' });
      TeacherInvite.isUsable.mockReturnValue(false);

      await controller.checkInvite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
