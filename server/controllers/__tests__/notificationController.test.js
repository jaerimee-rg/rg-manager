import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/NotificationSetting.js', () => ({
  default: {
    getAll: jest.fn(),
    isEnabled: jest.fn(),
    setEnabled: jest.fn()
  },
  NOTIFICATION_EVENTS: [
    { eventType: 'ATTENDANCE', label: '출석 체크 알림', description: '' },
    { eventType: 'FAQ_INQUIRY', label: '새 문의 알림', description: '' },
    { eventType: 'CUSTOM', label: '관리자 직접 발송', description: '' }
  ],
  isKnownEvent: (type) => ['ATTENDANCE', 'FAQ_INQUIRY', 'CUSTOM'].includes(type)
}));

jest.unstable_mockModule('../../models/KakaoMessageLog.js', () => ({
  default: {
    getAll: jest.fn(),
    getCount: jest.fn()
  }
}));

const NotificationSetting = (await import('../../models/NotificationSetting.js')).default;
const KakaoMessageLog = (await import('../../models/KakaoMessageLog.js')).default;
const { getNotificationSettings, updateNotificationSetting, getNotificationLogs } = await import(
  '../notificationController.js'
);

const SETTINGS = [
  { eventType: 'ATTENDANCE', label: '출석 체크 알림', enabled: true },
  { eventType: 'FAQ_INQUIRY', label: '새 문의 알림', enabled: true },
  { eventType: 'CUSTOM', label: '관리자 직접 발송', enabled: true }
];

describe('notificationController', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, user: { id: 1, role: 'admin' } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    jest.clearAllMocks();
    NotificationSetting.getAll.mockResolvedValue(SETTINGS);
    NotificationSetting.setEnabled.mockResolvedValue({});
    KakaoMessageLog.getAll.mockResolvedValue([]);
    KakaoMessageLog.getCount.mockResolvedValue(0);
  });

  describe('getNotificationSettings', () => {
    it('관리자가 아니면 403 을 반환한다', async () => {
      req.user.role = 'user';

      await getNotificationSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(NotificationSetting.getAll).not.toHaveBeenCalled();
    });

    it('이벤트 목록을 돌려준다', async () => {
      await getNotificationSettings(req, res);

      expect(res.json).toHaveBeenCalledWith(SETTINGS);
    });
  });

  describe('updateNotificationSetting', () => {
    it('관리자가 아니면 403 을 반환한다', async () => {
      req.user.role = 'user';
      req.params = { eventType: 'ATTENDANCE' };
      req.body = { enabled: false };

      await updateNotificationSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(NotificationSetting.setEnabled).not.toHaveBeenCalled();
    });

    it('알 수 없는 이벤트는 400 을 반환한다', async () => {
      req.params = { eventType: 'UNKNOWN_EVENT' };
      req.body = { enabled: false };

      await updateNotificationSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(NotificationSetting.setEnabled).not.toHaveBeenCalled();
    });

    it('enabled 가 불리언이 아니면 400 을 반환한다', async () => {
      req.params = { eventType: 'ATTENDANCE' };
      req.body = { enabled: 'false' };

      await updateNotificationSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(NotificationSetting.setEnabled).not.toHaveBeenCalled();
    });

    it('이벤트를 끄고 갱신된 전체 목록을 돌려준다', async () => {
      req.params = { eventType: 'FAQ_INQUIRY' };
      req.body = { enabled: false };

      await updateNotificationSetting(req, res);

      expect(NotificationSetting.setEnabled).toHaveBeenCalledWith('FAQ_INQUIRY', false, 1);
      expect(res.json).toHaveBeenCalledWith(SETTINGS);
    });
  });

  describe('getNotificationLogs', () => {
    it('관리자가 아니면 403 을 반환한다', async () => {
      req.user.role = 'user';

      await getNotificationLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('유형 필터를 모델에 그대로 전달한다', async () => {
      req.query = { eventType: 'ATTENDANCE' };

      await getNotificationLogs(req, res);

      expect(KakaoMessageLog.getAll).toHaveBeenCalledWith(100, 0, 'ATTENDANCE');
      expect(KakaoMessageLog.getCount).toHaveBeenCalledWith('ATTENDANCE');
    });

    it('limit 은 200 건으로 제한한다', async () => {
      req.query = { limit: '9999' };

      await getNotificationLogs(req, res);

      expect(KakaoMessageLog.getAll).toHaveBeenCalledWith(200, 0, undefined);
    });
  });
});
