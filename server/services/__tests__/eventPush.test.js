import { jest } from '@jest/globals';

jest.unstable_mockModule('web-push', () => ({
  default: { sendNotification: jest.fn() }
}));

jest.unstable_mockModule('../../models/PushSubscription.js', () => ({
  default: { listForTeacherParents: jest.fn(), deleteByIds: jest.fn() }
}));

const webpush = (await import('web-push')).default;
const PushSubscription = (await import('../../models/PushSubscription.js')).default;
const { notifyParentsOfEvent, PUSH_TTL_SECONDS, SEND_TIMEOUT_MS } = await import('../eventPush.js');

const env = { VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key', VAPID_SUBJECT: 'mailto:t@example.com' };
const event = {
  id: 9, userId: 7, type: 'special', title: '한강 러닝', date: '2026-10-12', location: '여의도',
  isPublished: true, registrationOpen: true
};
const sub = (id, userId) => ({
  id, userId, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: `p${id}`, auth: `a${id}`
});
const pushError = (statusCode) => Object.assign(new Error(`status ${statusCode}`), { statusCode });

describe('notifyParentsOfEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PushSubscription.deleteByIds.mockImplementation(async (ids) => ids.length);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('비공개 이벤트는 보내지 않는다 (학부모에게 404 라 눌러도 안 열린다)', async () => {
    expect(await notifyParentsOfEvent({ ...event, isPublished: false }, { env })).toEqual({ skipped: 'private' });
    expect(PushSubscription.listForTeacherParents).not.toHaveBeenCalled();
  });

  it('사진 전용 폴더는 이벤트가 아니다', async () => {
    expect(await notifyParentsOfEvent({ ...event, type: 'folder' }, { env })).toEqual({ skipped: 'not_event' });
  });

  it('키가 없으면 보내지 않고 이유를 돌려준다', async () => {
    expect(await notifyParentsOfEvent(event, { env: {} })).toEqual({ skipped: 'not_configured' });
    expect(PushSubscription.listForTeacherParents).not.toHaveBeenCalled();
  });

  it('이벤트 주인 선생님의 학부모 구독을 찾는다 — 알림을 켠 사람이 없으면 0명', async () => {
    PushSubscription.listForTeacherParents.mockResolvedValue([]);

    expect(await notifyParentsOfEvent(event, { env })).toEqual({ recipients: 0, sent: 0, failed: 0, removed: 0 });
    expect(PushSubscription.listForTeacherParents).toHaveBeenCalledWith(7);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('기기마다 보내고, 받은 학부모 수는 사람 단위로 센다', async () => {
    PushSubscription.listForTeacherParents.mockResolvedValue([sub(1, 20), sub(2, 20), sub(3, 21)]);
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await notifyParentsOfEvent(event, { env });

    expect(result).toEqual({ recipients: 2, sent: 3, failed: 0, removed: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3);

    const [subscription, payload, options] = webpush.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', keys: { p256dh: 'p1', auth: 'a1' } });
    expect(JSON.parse(payload).notification).toEqual(expect.objectContaining({
      title: '새 일정 · 한강 러닝', tag: 'event-9'
    }));
    expect(JSON.parse(payload).notification.navigate).toMatch(/\/parent\/events\/9$/);
    expect(options).toEqual({
      TTL: PUSH_TTL_SECONDS,
      urgency: 'normal',
      topic: 'event-9',
      timeout: SEND_TIMEOUT_MS,
      vapidDetails: { subject: 'mailto:t@example.com', publicKey: 'pub-key', privateKey: 'priv-key' }
    });
  });

  it('없어진 구독(404·410)은 지우고, 다른 실패는 실패로 센다', async () => {
    PushSubscription.listForTeacherParents.mockResolvedValue([sub(1, 20), sub(2, 21), sub(3, 22), sub(4, 23)]);
    webpush.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(pushError(410))
      .mockRejectedValueOnce(pushError(404))
      .mockRejectedValueOnce(pushError(500));

    const result = await notifyParentsOfEvent(event, { env });

    expect(result).toEqual({ recipients: 1, sent: 1, failed: 1, removed: 2 });
    expect(PushSubscription.deleteByIds).toHaveBeenCalledWith([2, 3]);
  });

  it('시간 초과처럼 상태 코드가 없는 실패도 실패로 센다', async () => {
    PushSubscription.listForTeacherParents.mockResolvedValue([sub(1, 20)]);
    webpush.sendNotification.mockRejectedValue(new Error('Socket timeout'));

    expect(await notifyParentsOfEvent(event, { env })).toEqual({ recipients: 0, sent: 0, failed: 1, removed: 0 });
    expect(PushSubscription.deleteByIds).not.toHaveBeenCalled();
  });

  it('구독 정리가 실패해도 결과는 돌려준다', async () => {
    PushSubscription.listForTeacherParents.mockResolvedValue([sub(1, 20)]);
    webpush.sendNotification.mockRejectedValue(pushError(410));
    PushSubscription.deleteByIds.mockRejectedValue(new Error('db down'));

    expect(await notifyParentsOfEvent(event, { env })).toEqual({ recipients: 0, sent: 0, failed: 0, removed: 0 });
  });

  it('구독 조회가 실패해도 던지지 않는다 — 이벤트 저장은 이미 끝났다', async () => {
    PushSubscription.listForTeacherParents.mockRejectedValue(new Error('db down'));

    await expect(notifyParentsOfEvent(event, { env })).resolves.toEqual({ skipped: 'error' });
  });
});
