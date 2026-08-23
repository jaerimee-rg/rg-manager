import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/ParentInvite.js', () => ({
  default: {
    getOrCreate: jest.fn(),
    regenerate: jest.fn(),
    getByToken: jest.fn(),
    isUsable: jest.fn()
  }
}));

const ParentInvite = (await import('../../models/ParentInvite.js')).default;
const { getInvite, regenerateInvite, checkInvite } = await import('../parentInviteController.js');

describe('parentInviteController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, user: { id: 7, role: 'user' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('링크가 없으면 만들어서 전체 주소로 돌려준다', async () => {
    ParentInvite.getOrCreate.mockResolvedValue({ token: 'abc123', createdAt: 'now', updatedAt: 'now' });

    await getInvite(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.token).toBe('abc123');
    expect(payload.url).toMatch(/\/invite\/abc123$/);
  });

  it('재발급하면 새 토큰을 돌려준다', async () => {
    ParentInvite.regenerate.mockResolvedValue({ token: 'newtoken', createdAt: 'now', updatedAt: 'now' });

    await regenerateInvite(req, res);

    expect(ParentInvite.regenerate).toHaveBeenCalledWith(7);
    expect(res.json.mock.calls[0][0].token).toBe('newtoken');
  });

  it('공개 확인은 선생님 이름만 알려준다', async () => {
    ParentInvite.getByToken.mockResolvedValue({ token: 'abc', teacherName: '이재림', userId: 7, id: 1 });
    ParentInvite.isUsable.mockReturnValue(true);
    req.params.token = 'abc';

    await checkInvite(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ valid: true, teacherName: '이재림' });
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('token');
  });

  it('없거나 만료된 토큰은 404', async () => {
    ParentInvite.getByToken.mockResolvedValue(null);
    ParentInvite.isUsable.mockReturnValue(false);
    req.params.token = 'gone';

    await checkInvite(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
