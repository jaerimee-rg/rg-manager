import fs from 'fs';
import path from 'path';

/**
 * public/sw.js 는 빌드를 거치지 않고 그대로 나가는 스크립트라, 가짜 self 위에서 직접 돌려 본다.
 * (public/ 아래에 테스트를 두면 Vite 가 빌드 결과물로 함께 복사하므로 여기에 둔다.)
 */
const SOURCE = fs.readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://rg-manager.vercel.app';

const loadWorker = ({ windows = [] } = {}) => {
  const listeners = {};
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: jest.fn(),
    registration: { showNotification: jest.fn().mockResolvedValue(undefined) },
    clients: {
      claim: jest.fn().mockResolvedValue(undefined),
      matchAll: jest.fn().mockResolvedValue(windows),
      openWindow: jest.fn().mockResolvedValue(undefined)
    }
  };
  // eslint-disable-next-line no-new-func
  new Function('self', SOURCE)(self);

  const fire = async (type, event) => {
    let pending = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  return { self, fire };
};

const pushEvent = (payload) => ({
  data: typeof payload === 'string'
    ? { json: () => JSON.parse(payload), text: () => payload }
    : { json: () => payload, text: () => JSON.stringify(payload) }
});

describe('service worker — push', () => {
  it('서버가 보낸 declarative 모양에서 제목·내용·여는 주소를 꺼내 띄운다', async () => {
    const { self, fire } = loadWorker();

    await fire('push', pushEvent({
      web_push: 8030,
      notification: {
        title: '새 일정 · 한강 러닝', body: '10월 12일(월) · 여의도', tag: 'event-9',
        navigate: `${ORIGIN}/parent/events/9`
      }
    }));

    expect(self.registration.showNotification).toHaveBeenCalledWith('새 일정 · 한강 러닝', expect.objectContaining({
      body: '10월 12일(월) · 여의도',
      tag: 'event-9',
      icon: '/icon-192.png',
      data: { url: `${ORIGIN}/parent/events/9` }
    }));
  });

  it('다른 사이트 주소가 와도 이 앱 안의 같은 경로만 연다', async () => {
    const { self, fire } = loadWorker();

    await fire('push', pushEvent({ notification: { title: 't', navigate: 'https://evil.example/parent/events/9?x=1' } }));

    expect(self.registration.showNotification.mock.calls[0][1].data.url).toBe(`${ORIGIN}/parent/events/9?x=1`);
  });

  it('JSON 이 아니어도 알림은 띄운다', async () => {
    const { self, fire } = loadWorker();

    await fire('push', { data: { json: () => { throw new Error('bad'); }, text: () => '그냥 글' } });

    expect(self.registration.showNotification).toHaveBeenCalledWith('JR 리듬체조', expect.objectContaining({
      body: '그냥 글', data: { url: `${ORIGIN}/` }
    }));
  });
});

describe('service worker — notificationclick', () => {
  const clickEvent = (url) => ({ notification: { close: jest.fn(), data: { url } } });

  it('열린 앱 창이 있으면 그 창을 앞으로 가져와 이벤트로 이동한다', async () => {
    const client = { url: `${ORIGIN}/parent/schedule`, focus: jest.fn().mockResolvedValue(), navigate: jest.fn().mockResolvedValue() };
    const { self, fire } = loadWorker({ windows: [client] });
    const event = clickEvent(`${ORIGIN}/parent/events/9`);

    await fire('notificationclick', event);

    expect(event.notification.close).toHaveBeenCalled();
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/parent/events/9`);
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('열린 창이 없으면 새 창으로 연다', async () => {
    const { self, fire } = loadWorker();

    await fire('notificationclick', clickEvent(`${ORIGIN}/parent/events/9`));

    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/parent/events/9`);
  });

  it('창을 옮기지 못하면(예: 아직 서비스 워커가 맡지 않은 창) 새 창으로 연다', async () => {
    const client = { url: `${ORIGIN}/`, focus: jest.fn().mockResolvedValue(), navigate: jest.fn().mockRejectedValue(new TypeError('not controlled')) };
    const { self, fire } = loadWorker({ windows: [client] });

    await fire('notificationclick', clickEvent(`${ORIGIN}/parent/events/9`));

    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/parent/events/9`);
  });

  it('다른 사이트의 창은 쓰지 않는다', async () => {
    const other = { url: 'https://evil.example/', focus: jest.fn(), navigate: jest.fn() };
    const { self, fire } = loadWorker({ windows: [other] });

    await fire('notificationclick', clickEvent(`${ORIGIN}/parent/events/9`));

    expect(other.focus).not.toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/parent/events/9`);
  });
});
