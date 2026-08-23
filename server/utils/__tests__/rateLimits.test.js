import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import express from 'express';
import http from 'http';
import {
  RATE_LIMIT_WINDOW_MS,
  PUBLIC_CHAT_READ_MAX,
  PUBLIC_CHAT_WRITE_MAX,
  PUBLIC_CHAT_POLL_INTERVAL_MS,
  visitorKeyGenerator
} from '../rateLimits.js';

describe('공개 채팅 한도 값', () => {
  it('폴링만으로는 읽기 한도를 소진하지 못한다', () => {
    const pollsPerWindow = RATE_LIMIT_WINDOW_MS / PUBLIC_CHAT_POLL_INTERVAL_MS;

    expect(pollsPerWindow).toBe(75);
    // 페이지 로드·탭 복귀·질문 전송을 더해도 여유가 있어야 한다
    expect(pollsPerWindow).toBeLessThan(PUBLIC_CHAT_READ_MAX / 2);
  });

  it('예전 설정(8초 폴링 / 한도 30)이 왜 막혔는지 — 회귀 방지', () => {
    const oldInterval = 8000;
    const oldMax = 30;

    // 폴링만으로 한도의 3배를 넘겼다
    expect(RATE_LIMIT_WINDOW_MS / oldInterval).toBeGreaterThan(oldMax * 3);
    // 4분이면 소진됐다
    expect((oldMax * oldInterval) / 1000).toBe(240);
  });

  it('쓰기 한도는 읽기보다 훨씬 엄격하다 (AI 호출 비용 방어)', () => {
    expect(PUBLIC_CHAT_WRITE_MAX).toBeLessThan(PUBLIC_CHAT_READ_MAX);
    expect(PUBLIC_CHAT_WRITE_MAX).toBeLessThanOrEqual(30);
  });
});

describe('visitorKeyGenerator', () => {
  it('본문의 visitorKey 를 키로 쓴다', () => {
    expect(visitorKeyGenerator({ body: { visitorKey: 'abc-123' }, query: {} })).toBe(
      'visitor:abc-123'
    );
  });

  it('쿼리스트링의 visitorKey 도 인식한다 (폴링은 GET 이다)', () => {
    expect(visitorKeyGenerator({ body: {}, query: { visitorKey: 'abc-123' } })).toBe(
      'visitor:abc-123'
    );
  });

  it('학부모마다 다른 키를 돌려준다 — 한 명이 전체를 잠그지 않도록', () => {
    const a = visitorKeyGenerator({ body: { visitorKey: 'aaa' }, query: {}, ip: '1.2.3.4' });
    const b = visitorKeyGenerator({ body: { visitorKey: 'bbb' }, query: {}, ip: '1.2.3.4' });

    // 같은 IP(공유 와이파이·프록시)라도 분리되어야 한다
    expect(a).not.toBe(b);
  });

  it('visitorKey 가 없으면 IP 로 떨어진다', () => {
    expect(visitorKeyGenerator({ body: {}, query: {}, ip: '1.2.3.4' })).toBe(
      ipKeyGenerator('1.2.3.4')
    );
  });

  it('공백뿐인 값은 키로 쓰지 않는다', () => {
    expect(visitorKeyGenerator({ body: { visitorKey: '   ' }, query: {}, ip: '1.2.3.4' })).toBe(
      ipKeyGenerator('1.2.3.4')
    );
  });

  it('아주 긴 값이 들어와도 키 길이를 제한한다', () => {
    const key = visitorKeyGenerator({ body: { visitorKey: 'x'.repeat(500) }, query: {} });
    expect(key.length).toBe('visitor:'.length + 100);
  });

  it('IPv6 는 서브넷 단위로 정규화한다 (주소를 바꿔가며 우회 방지)', () => {
    expect(visitorKeyGenerator({ body: {}, query: {}, ip: '2001:db8::1' })).toBe(
      ipKeyGenerator('2001:db8::1')
    );
  });
});

// 실제 서버를 띄워 리미터가 붙은 순서까지 확인한다.
describe('리미터 동작 (실제 요청)', () => {
  let server;
  let baseUrl;

  const WRITE_MAX = 3;
  const READ_MAX = 10;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    const readLimiter = rateLimit({
      windowMs: 60000,
      max: READ_MAX,
      keyGenerator: visitorKeyGenerator,
      standardHeaders: true,
      legacyHeaders: false
    });
    const writeLimiter = rateLimit({
      windowMs: 60000,
      max: WRITE_MAX,
      keyGenerator: visitorKeyGenerator,
      standardHeaders: true,
      legacyHeaders: false
    });

    // server.js 와 동일한 순서
    app.post('/api/chat/public/:publicId/messages', writeLimiter);
    app.use('/api/chat/public', readLimiter);
    app.all('/api/chat/public/:publicId/messages', (req, res) => res.json({ ok: true }));

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const get = (visitorKey) =>
    fetch(`${baseUrl}/api/chat/public/abc/messages?visitorKey=${visitorKey}`);

  const post = (visitorKey) =>
    fetch(`${baseUrl}/api/chat/public/abc/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey, message: '질문' })
    });

  it('읽기는 쓰기 한도에 걸리지 않는다 (폴링이 질문 전송을 막지 않는다)', async () => {
    // 쓰기 한도(3)를 훌쩍 넘는 횟수를 읽는다
    for (let i = 0; i < WRITE_MAX + 3; i++) {
      const res = await get('reader');
      expect(res.status).toBe(200);
    }

    // 읽기를 많이 했어도 질문은 여전히 보낼 수 있어야 한다
    const sent = await post('reader');
    expect(sent.status).toBe(200);
  });

  it('쓰기는 자체 한도를 넘으면 429 를 반환한다', async () => {
    for (let i = 0; i < WRITE_MAX; i++) {
      expect((await post('writer')).status).toBe(200);
    }

    const blocked = await post('writer');
    expect(blocked.status).toBe(429);
  });

  it('한 학부모가 한도를 넘어도 다른 학부모는 영향을 받지 않는다', async () => {
    for (let i = 0; i < WRITE_MAX + 1; i++) await post('heavy-user');
    expect((await post('heavy-user')).status).toBe(429);

    // 다른 브라우저(visitorKey)는 그대로 사용 가능해야 한다
    expect((await post('other-user')).status).toBe(200);
  });

  it('429 응답에 남은 한도와 회복 시각을 알려준다 (클라이언트 백오프용)', async () => {
    for (let i = 0; i < WRITE_MAX + 1; i++) await post('headers-user');
    const res = await post('headers-user');

    expect(res.status).toBe(429);
    expect(res.headers.get('ratelimit-remaining')).toBe('0');
    expect(Number(res.headers.get('ratelimit-reset'))).toBeGreaterThan(0);
  });
});
