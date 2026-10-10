import {
  pushConfig, isAllowedPushEndpoint, normalizeSubscription, eventWhen, eventPushMessage, ENDPOINT_MAX
} from '../webPush.js';

const P256DH = 'B' + 'A'.repeat(86);          // 65바이트 공개키의 base64url 길이(87자)
const AUTH = 'k'.repeat(22);                   // 16바이트

describe('pushConfig', () => {
  it('공개키·비밀키가 둘 다 있어야 켜진다', () => {
    expect(pushConfig({}).configured).toBe(false);
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'pub' }).configured).toBe(false);
    expect(pushConfig({ VAPID_PRIVATE_KEY: 'priv' }).configured).toBe(false);
    expect(pushConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toEqual(expect.objectContaining({
      configured: true, publicKey: 'pub', privateKey: 'priv'
    }));
  });

  it('공백만 있는 값은 없는 것으로 본다', () => {
    expect(pushConfig({ VAPID_PUBLIC_KEY: '  ', VAPID_PRIVATE_KEY: 'priv' }).configured).toBe(false);
  });

  it('연락처(subject)는 비우면 운영 주소, 주면 그 값', () => {
    expect(pushConfig({}).subject).toBe('https://rg-manager.vercel.app');
    expect(pushConfig({ VAPID_SUBJECT: 'mailto:a@b.c' }).subject).toBe('mailto:a@b.c');
  });
});

describe('isAllowedPushEndpoint — 서버가 POST 를 보낼 주소라 브라우저 푸시 서비스만 받는다', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://jmt17.google.com/fcm/send/abc:def',
    'https://web.push.apple.com/QGxyz',
    'https://api.push.apple.com/3/device/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-par02p.notify.windows.com/w/?token=abc'
  ])('받는다: %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    ['http 는 안 된다', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['다른 호스트', 'https://example.com/push'],
    ['구글 흉내', 'https://google.com.evil.example/push'],
    ['google.com 으로 끝나기만', 'https://evilgoogle.com/push'],
    ['내부 주소', 'https://localhost/push'],
    ['비슷한 이름', 'https://fcm.googleapis.com.evil.example/x'],
    ['앞에 붙인 이름', 'https://evilpush.apple.com/x'],
    ['포트 지정', 'https://fcm.googleapis.com:8443/x'],
    ['계정 정보', 'https://user:pw@fcm.googleapis.com/x'],
    ['주소가 아님', 'not a url'],
    ['빈 값', ''],
    ['문자열이 아님', { href: 'https://fcm.googleapis.com/x' }]
  ])('거절: %s', (_, url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });

  it('지나치게 긴 주소는 거절한다', () => {
    const long = `https://fcm.googleapis.com/${'a'.repeat(ENDPOINT_MAX)}`;
    expect(isAllowedPushEndpoint(long)).toBe(false);
  });
});

describe('normalizeSubscription', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

  it('브라우저의 toJSON() 모양을 저장할 값으로 바꾼다', () => {
    expect(normalizeSubscription({ endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } }))
      .toEqual({ value: { endpoint, p256dh: P256DH, auth: AUTH } });
  });

  it('패딩(=)이 붙은 키도 받는다', () => {
    expect(normalizeSubscription({ endpoint, keys: { p256dh: `${P256DH}=`, auth: `${AUTH}==` } }).value).toBeTruthy();
  });

  it('주소가 틀리면 400 용 메시지와 거절한 호스트', () => {
    expect(normalizeSubscription({ endpoint: 'https://push.example.com/x', keys: { p256dh: P256DH, auth: AUTH } }))
      .toEqual({ error: expect.any(String), rejectedHost: 'push.example.com' });
    expect(normalizeSubscription({ endpoint: 'not a url' }).rejectedHost).toBeNull();
  });

  it.each([
    ['키 없음', undefined],
    ['p256dh 너무 짧음', { p256dh: 'abc', auth: AUTH }],
    ['auth 너무 김', { p256dh: P256DH, auth: 'a'.repeat(40) }],
    ['base64url 이 아닌 글자', { p256dh: `${P256DH.slice(0, 80)}/+<>`, auth: AUTH }],
    ['숫자', { p256dh: 1, auth: AUTH }]
  ])('키가 틀리면 거절: %s', (_, keys) => {
    expect(normalizeSubscription({ endpoint, keys }).error).toBeTruthy();
  });

  it('본문이 없어도 던지지 않는다', () => {
    expect(normalizeSubscription(undefined).error).toBeTruthy();
  });
});

describe('eventWhen', () => {
  it('날짜에 요일을 붙인다', () => {
    expect(eventWhen({ date: '2026-10-12' })).toBe('10월 12일(월)');
  });

  it('기간이면 종료일을, 시간이 있으면 시간을 붙인다', () => {
    expect(eventWhen({ date: '2026-10-10', endDate: '2026-10-11', startTime: '09:30' }))
      .toBe('10월 10일(토) ~ 10월 11일(일) 09:30');
  });

  it('종료일이 시작일과 같으면 한 번만', () => {
    expect(eventWhen({ date: '2026-10-10', endDate: '2026-10-10' })).toBe('10월 10일(토)');
  });
});

describe('eventPushMessage', () => {
  const appUrl = 'https://rg-manager.vercel.app';
  const event = {
    id: 42, type: 'competition', title: '서울시장배 대회', date: '2026-10-12', startTime: '10:00',
    location: '올림픽공원', registrationOpen: true
  };

  it('Declarative Web Push 모양 — 아이폰이 서비스 워커 없이도 띄운다', () => {
    const message = eventPushMessage(event, { appUrl });
    expect(message.web_push).toBe(8030);
    expect(message.notification).toEqual({
      title: '새 일정 · 서울시장배 대회',
      body: '10월 12일(월) 10:00 · 올림픽공원\n지금 신청할 수 있어요',
      navigate: 'https://rg-manager.vercel.app/parent/events/42',
      tag: 'event-42',
      lang: 'ko',
      dir: 'ltr'
    });
  });

  it('접수를 받지 않으면 신청 안내를 붙이지 않는다', () => {
    const { notification } = eventPushMessage({ ...event, registrationOpen: false }, { appUrl });
    expect(notification.body).toBe('10월 12일(월) 10:00 · 올림픽공원');
  });

  it('휴관일은 "휴관 안내" 로 날짜만', () => {
    const { notification } = eventPushMessage(
      { id: 7, type: 'closure', title: '추석 휴관', date: '2026-10-03', endDate: '2026-10-05', registrationOpen: false },
      { appUrl }
    );
    expect(notification.title).toBe('휴관 안내 · 추석 휴관');
    expect(notification.body).toBe('10월 3일(토) ~ 10월 5일(월)');
  });
});
