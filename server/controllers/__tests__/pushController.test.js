import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/PushSubscription.js', () => ({
  default: { upsert: jest.fn(), deleteOwned: jest.fn() }
}));

const PushSubscription = (await import('../../models/PushSubscription.js')).default;
const { getPushConfig, saveSubscription, deleteSubscription } = await import('../pushController.js');

const P256DH = 'B' + 'A'.repeat(86);
const AUTH = 'k'.repeat(22);
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

describe('pushController', () => {
  const saved = { ...process.env };
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'pub-key';
    process.env.VAPID_PRIVATE_KEY = 'priv-key';
    req = { body: {}, params: {}, query: {}, user: { id: 20, role: 'parent' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = saved;
  });

  describe('설정', () => {
    it('공개키만 내려주고 비밀키는 내려주지 않는다', () => {
      getPushConfig(req, res);
      expect(res.json).toHaveBeenCalledWith({ configured: true, publicKey: 'pub-key' });
    });

    it('키가 없으면 configured:false', () => {
      delete process.env.VAPID_PRIVATE_KEY;
      getPushConfig(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ configured: false }));
    });
  });

  describe('구독 저장', () => {
    it('내 계정으로 저장한다', async () => {
      req.body = { endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } };
      PushSubscription.upsert.mockResolvedValue({ id: 1 });

      await saveSubscription(req, res);

      expect(PushSubscription.upsert).toHaveBeenCalledWith({ userId: 20, endpoint, p256dh: P256DH, auth: AUTH });
      expect(res.json).toHaveBeenCalledWith({ subscribed: true });
    });

    it('푸시 서비스가 아닌 주소는 400 — 거절한 호스트는 로그에 남긴다', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      req.body = { endpoint: 'https://example.com/hook', keys: { p256dh: P256DH, auth: AUTH } };

      await saveSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(PushSubscription.upsert).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.any(String), 'example.com');
    });

    it('키가 틀리면 400', async () => {
      req.body = { endpoint, keys: { p256dh: 'x', auth: AUTH } };

      await saveSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('서버에 키가 없으면 503 — 받아 둬도 보낼 수 없다', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      req.body = { endpoint, keys: { p256dh: P256DH, auth: AUTH } };

      await saveSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(PushSubscription.upsert).not.toHaveBeenCalled();
    });

    it('DB 오류는 500', async () => {
      req.body = { endpoint, keys: { p256dh: P256DH, auth: AUTH } };
      PushSubscription.upsert.mockRejectedValue(new Error('db'));

      await saveSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('구독 삭제', () => {
    it('내 구독만 지운다', async () => {
      req.body = { endpoint };
      PushSubscription.deleteOwned.mockResolvedValue(true);

      await deleteSubscription(req, res);

      expect(PushSubscription.deleteOwned).toHaveBeenCalledWith(20, endpoint);
      expect(res.json).toHaveBeenCalledWith({ removed: true });
    });

    it('주소가 없으면 400', async () => {
      await deleteSubscription(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(PushSubscription.deleteOwned).not.toHaveBeenCalled();
    });

    it('서버 키가 없어도 끄기는 된다', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      req.body = { endpoint };
      PushSubscription.deleteOwned.mockResolvedValue(false);

      await deleteSubscription(req, res);

      expect(res.json).toHaveBeenCalledWith({ removed: false });
    });
  });
});
