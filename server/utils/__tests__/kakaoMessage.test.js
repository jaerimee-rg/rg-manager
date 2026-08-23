import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/User.js', () => ({
  default: {
    getKakaoTokens: jest.fn(),
    updateKakaoTokens: jest.fn()
  }
}));

jest.unstable_mockModule('../../models/KakaoMessageLog.js', () => ({
  default: { create: jest.fn() }
}));

jest.unstable_mockModule('../../models/NotificationSetting.js', () => ({
  default: { isEnabled: jest.fn() },
  NOTIFICATION_EVENTS: [
    { eventType: 'ATTENDANCE', label: '출석 체크 알림' },
    { eventType: 'FAQ_INQUIRY', label: '새 문의 알림' },
    { eventType: 'CUSTOM', label: '관리자 직접 발송' }
  ]
}));

const User = (await import('../../models/User.js')).default;
const KakaoMessageLog = (await import('../../models/KakaoMessageLog.js')).default;
const NotificationSetting = (await import('../../models/NotificationSetting.js')).default;
const { sendAttendanceKakaoMessage, sendFaqInquiryKakaoMessage, sendCustomKakaoMessage } =
  await import('../kakaoMessage.js');

// 토큰이 살아있는 사용자 (알림 설정만 분기하도록 나머지는 통과시킨다)
const validTokens = {
  kakaoAccessToken: 'token',
  kakaoRefreshToken: 'refresh',
  kakaoTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  kakaoMessageConsent: true
};

const attendanceArgs = {
  userId: 1,
  date: '2026-08-22',
  className: '토요반',
  schedule: '10:00',
  students: [{ id: 1, name: '가은' }],
  presentStudentIds: [1]
};

describe('kakaoMessage — 이벤트별 알림 on/off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    User.getKakaoTokens.mockResolvedValue(validTokens);
    KakaoMessageLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    delete global.fetch;
  });

  const kakaoOk = () => ({ json: () => Promise.resolve({ result_code: 0 }) });

  it('출석 알림이 꺼져 있으면 카카오 API 를 호출하지 않는다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(false);

    const result = await sendAttendanceKakaoMessage(attendanceArgs);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, disabled: true, skipped: true });
    expect(result.error).toContain('출석 체크 알림');
    // 보내지 않았으므로 이력도 남기지 않는다
    expect(KakaoMessageLog.create).not.toHaveBeenCalled();
  });

  it('문의 알림이 꺼져 있으면 발송하지 않는다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(false);

    const result = await sendFaqInquiryKakaoMessage({
      userId: 1,
      channelName: '문의',
      visitorName: '학부모',
      question: '주차 되나요?'
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.disabled).toBe(true);
    expect(result.error).toContain('새 문의 알림');
  });

  it('관리자 직접 발송이 꺼져 있으면 발송하지 않는다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(false);

    const result = await sendCustomKakaoMessage({ senderId: 1, recipientId: 2, message: '안내' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.disabled).toBe(true);
    expect(result.error).toContain('관리자 직접 발송');
  });

  it('켜져 있으면 평소대로 발송한다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(true);
    global.fetch.mockResolvedValue(kakaoOk());

    const result = await sendAttendanceKakaoMessage(attendanceArgs);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(KakaoMessageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'ATTENDANCE', success: true })
    );
  });

  it('설정 조회가 실패해도 알림을 막지 않는다', async () => {
    NotificationSetting.isEnabled.mockRejectedValue(new Error('db down'));
    global.fetch.mockResolvedValue(kakaoOk());

    const result = await sendAttendanceKakaoMessage(attendanceArgs);

    expect(result.success).toBe(true);
  });

  it('첫 문의와 이어지는 메시지의 문구를 구분한다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(true);
    global.fetch.mockResolvedValue(kakaoOk());

    const sentText = async () => {
      const body = global.fetch.mock.calls.at(-1)[1].body;
      return JSON.parse(body.get('template_object')).text;
    };

    await sendFaqInquiryKakaoMessage({
      userId: 1,
      channelName: '문의',
      visitorName: '학부모',
      question: '주차 되나요?'
    });
    expect(await sentText()).toContain('새 문의가 도착했습니다');

    await sendFaqInquiryKakaoMessage({
      userId: 1,
      channelName: '문의',
      visitorName: '학부모',
      question: '몇 시까지 하나요?',
      isFollowUp: true
    });
    const followUp = await sentText();
    expect(followUp).toContain('새 메시지가 도착했습니다');
    expect(followUp).toContain('몇 시까지 하나요?');

    // 이어지는 메시지도 이력에는 같은 종류로 남는다
    expect(KakaoMessageLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageType: 'FAQ_INQUIRY', success: true })
    );
  });

  it('이벤트마다 자기 설정만 확인한다', async () => {
    NotificationSetting.isEnabled.mockResolvedValue(true);
    global.fetch.mockResolvedValue(kakaoOk());

    await sendFaqInquiryKakaoMessage({
      userId: 1,
      channelName: '문의',
      visitorName: '학부모',
      question: '질문'
    });

    expect(NotificationSetting.isEnabled).toHaveBeenCalledWith('FAQ_INQUIRY');
    expect(NotificationSetting.isEnabled).not.toHaveBeenCalledWith('ATTENDANCE');
  });
});
