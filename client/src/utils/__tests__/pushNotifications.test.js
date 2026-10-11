jest.mock('../api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../api';
import {
  pushEnvironment, isIos, isStandalone, urlBase64ToUint8Array, openExternalUrl,
  currentSubscription, enablePush, disablePush, notifyResultMessage, loadPushConfig
} from '../pushNotifications';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.9.0',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.9.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
};

const pushCapable = { PushManager: function PushManager() {}, Notification: function Notification() {} };
const navWith = (userAgent, extra = {}) => ({ userAgent, serviceWorker: {}, maxTouchPoints: 0, ...extra });
const winWith = (extra = {}, standalone = false) => ({ ...extra, matchMedia: () => ({ matches: standalone }) });

describe('pushEnvironment', () => {
  it('카카오톡 안의 브라우저는 무엇이 있든 안내만 한다 — 웹뷰라 알림이 오지 않는다', () => {
    expect(pushEnvironment(navWith(UA.kakaoAndroid), winWith(pushCapable))).toBe('kakaotalk');
    expect(pushEnvironment(navWith(UA.kakaoIos), winWith())).toBe('kakaotalk');
  });

  it('서비스 워커 + PushManager + Notification 이 있으면 켤 수 있다', () => {
    expect(pushEnvironment(navWith(UA.androidChrome), winWith(pushCapable))).toBe('supported');
    expect(pushEnvironment(navWith(UA.firefoxDesktop), winWith(pushCapable))).toBe('supported');
  });

  it('아이폰 사파리 탭은 홈 화면에 추가하라고 안내한다', () => {
    expect(pushEnvironment(navWith(UA.iphoneSafari), winWith())).toBe('ios-install');
  });

  it('맥으로 소개하는 아이패드도 아이폰처럼 다룬다', () => {
    expect(pushEnvironment(navWith(UA.ipadSafari, { maxTouchPoints: 5 }), winWith())).toBe('ios-install');
  });

  it('홈 화면 앱인데도 안 되면 iOS 업데이트를 안내한다', () => {
    expect(pushEnvironment(navWith(UA.iphoneSafari, { standalone: true }), winWith())).toBe('ios-update');
    expect(pushEnvironment(navWith(UA.iphoneSafari), winWith({}, true))).toBe('ios-update');
  });

  it('그 밖에 알림이 없는 브라우저', () => {
    expect(pushEnvironment({ userAgent: UA.firefoxDesktop }, winWith())).toBe('unsupported');
  });
});

describe('isIos · isStandalone', () => {
  it('터치 없는 맥은 아이패드가 아니다', () => {
    expect(isIos({ userAgent: UA.ipadSafari, maxTouchPoints: 0 })).toBe(false);
  });

  it('display-mode 를 모르는 브라우저에서도 던지지 않는다', () => {
    expect(isStandalone({}, {})).toBe(false);
  });
});

describe('urlBase64ToUint8Array', () => {
  it('base64url(패딩 없음)을 바이트로 바꾼다', () => {
    // "hello?" → aGVsbG8/ (base64) → aGVsbG8_ (base64url)
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8_'))).toEqual([104, 101, 108, 108, 111, 63]);
    expect(Array.from(urlBase64ToUint8Array('aGk'))).toEqual([104, 105]);
  });
});

describe('openExternalUrl', () => {
  it('지금 주소를 카카오톡 외부 브라우저 열기 주소로 감싼다', () => {
    expect(openExternalUrl('https://rg-manager.vercel.app/parent/settings?a=1'))
      .toBe('kakaotalk://web/openExternal?url=https%3A%2F%2Frg-manager.vercel.app%2Fparent%2Fsettings%3Fa%3D1');
  });
});

describe('브라우저 구독', () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: jest.fn().mockResolvedValue(true)
  };
  let registration;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchWithAuth.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    registration = {
      pushManager: {
        getSubscription: jest.fn().mockResolvedValue(null),
        subscribe: jest.fn().mockResolvedValue(subscription)
      }
    };
    global.Notification = { permission: 'default', requestPermission: jest.fn().mockResolvedValue('granted') };
  });

  afterAll(() => {
    delete global.Notification;
  });

  it('설정을 못 받으면 꺼진 것으로 본다', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false });
    await expect(loadPushConfig()).resolves.toEqual({ configured: false, publicKey: null });
  });

  it('켜기: 권한을 먼저 묻고, 공개키로 구독해 서버에 저장한다', async () => {
    await expect(enablePush({ registration, publicKey: 'aGk' })).resolves.toBe('granted');

    expect(Notification.requestPermission).toHaveBeenCalled();
    const options = registration.pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey)).toEqual([104, 105]);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/push/subscriptions', {
      method: 'POST', body: JSON.stringify(subscription.toJSON())
    });
  });

  it('이미 구독돼 있으면 그 구독을 다시 저장한다', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(subscription);

    await enablePush({ registration, publicKey: 'aGk' });

    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/push/subscriptions', expect.objectContaining({ method: 'POST' }));
  });

  it('권한을 거절하면 구독하지 않는다', async () => {
    Notification.requestPermission.mockResolvedValue('denied');

    await expect(enablePush({ registration, publicKey: 'aGk' })).resolves.toBe('denied');
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('서버 저장이 실패하면 기기 구독도 풀고 던진다 — "켜짐" 인데 안 오는 상태를 만들지 않는다', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false });

    await expect(enablePush({ registration, publicKey: 'aGk' })).rejects.toThrow('subscription_not_saved');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('끄기: 서버 구독을 지우고 기기 구독을 푼다', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(subscription);

    await disablePush({ registration });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/push/subscriptions', {
      method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('끌 구독이 없으면 아무것도 하지 않는다', async () => {
    await disablePush({ registration });
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('지금 켜져 있으면 그 구독을 서버에 다시 알려 둔다 (같은 기기에서 다른 학부모 계정)', async () => {
    Notification.permission = 'granted';
    registration.pushManager.getSubscription.mockResolvedValue(subscription);

    await expect(currentSubscription(registration)).resolves.toBe(subscription);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/push/subscriptions', expect.objectContaining({ method: 'POST' }));
  });

  it('권한이 사라졌으면 켜진 것으로 보지 않고 저장하지도 않는다', async () => {
    Notification.permission = 'denied';
    registration.pushManager.getSubscription.mockResolvedValue(subscription);

    await expect(currentSubscription(registration)).resolves.toBeNull();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });
});

describe('notifyResultMessage', () => {
  it.each([
    [undefined, ''],
    [{ recipients: 3, sent: 4, failed: 0 }, '학부모 3명에게 알림을 보냈어요'],
    [{ recipients: 0, sent: 0, failed: 0 }, '알림을 켠 학부모가 아직 없어요 · 학부모가 내 정보에서 알림을 켜면 받을 수 있어요'],
    [{ recipients: 0, sent: 0, failed: 2 }, '학부모 알림을 보내지 못했어요 · 잠시 뒤 다시 해 주세요'],
    [{ skipped: 'not_configured' }, '알림 기능이 아직 준비되지 않아 학부모 알림은 보내지 못했어요'],
    [{ skipped: 'private' }, '비공개 이벤트라 학부모 알림은 보내지 않았어요'],
    [{ skipped: 'empty' }, '보이는 사진이 없어 학부모 알림은 보내지 않았어요'],
    [{ skipped: 'error' }, '학부모 알림을 보내지 못했어요']
  ])('%j → %s', (notification, message) => {
    expect(notifyResultMessage(notification)).toBe(message);
  });
});
