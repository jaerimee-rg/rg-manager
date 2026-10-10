/*
 * JR 리듬체조 서비스 워커 — 학부모 브라우저 알림만 맡는다. 화면·데이터는 캐시하지 않는다.
 *
 * 서버(server/services/eventPush.js)는 Declarative Web Push 모양
 * { web_push: 8030, notification: { title, body, navigate, tag } } 으로 보낸다.
 * 아이폰(iOS 18.4+)은 이 JSON 만으로도 알림을 띄우고, 나머지 브라우저는 여기서 같은 값을 읽어 띄운다.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const readMessage = (event) => {
  if (!event.data) return {};
  try {
    const data = event.data.json();
    return data && typeof data.notification === 'object' ? data.notification : data || {};
  } catch {
    return { body: event.data.text() };
  }
};

// 알림이 여는 주소는 언제나 이 앱 안이다 — 내용에 다른 사이트 주소가 와도 경로만 쓴다.
const sameOriginUrl = (value) => {
  try {
    const target = new URL(value || '/', self.location.origin);
    return new URL(target.pathname + target.search, self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
};

self.addEventListener('push', (event) => {
  const message = readMessage(event);
  event.waitUntil(self.registration.showNotification(message.title || 'JR 리듬체조', {
    body: message.body || '',
    tag: message.tag || undefined,
    lang: 'ko',
    icon: '/icon-192.png',
    data: { url: sameOriginUrl(message.navigate) }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);

  event.waitUntil((async () => {
    // 앱이 이미 열려 있으면 그 창에서 연다(창이 늘어나지 않게). 안 되면 새 창.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      } catch {
        break;
      }
    }
    await self.clients.openWindow(url);
  })());
});
