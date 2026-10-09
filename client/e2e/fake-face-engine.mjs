// e2e 전용 가짜 얼굴 분석 서버 — face_engine/(Python, InsightFace) 과 같은 주소·응답 모양만 흉내 낸다.
// 진짜 분석은 모델(약 190MB)이 있어야 해서 e2e 에서는 "브라우저 → Express → 분석 서버 → 저장" 흐름만 본다.
// 받은 사진은 얼굴이 없는 것으로 답한다(e2e 가 쓰는 사진은 모두 얼굴 없는 그림이다).
//
//   node e2e/fake-face-engine.mjs                 # 기본 포트 5057
//   서버는 FACE_ENGINE_URL=http://localhost:5057 을 붙여 띄운다(없으면 분석 테스트 2개가 skip 된다).
//
// GET /__calls 는 지금까지 받은 분석 요청 수와 마지막 요청의 Content-Type.
import http from 'http';

const PORT = Number(process.env.FAKE_FACE_ENGINE_PORT || 5057);
const calls = { count: 0, lastContentType: null };

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/__calls') return send(res, 200, calls);
  if (req.method === 'GET' && pathname === '/api/face-engine/health') {
    return send(res, 200, { ok: true, ready: true, analyzerVersion: 3, fake: true });
  }
  if (pathname !== '/api/face-engine/detect') return send(res, 404, { error: 'not_found', reason: 'not_found' });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed', reason: 'method_not_allowed' });

  // 진짜처럼 로그인 토큰이 없으면 거절한다(서명까지는 보지 않는다 — face_engine/tests 가 본다).
  if (!/^Bearer \S+/.test(req.headers.authorization || '')) {
    return send(res, 401, { error: '로그인이 필요해요.', reason: 'unauthorized' });
  }

  let size = 0;
  req.on('data', (chunk) => { size += chunk.length; });
  req.on('end', () => {
    if (!size) return send(res, 400, { error: '사진이 비어 있어요.', reason: 'empty_body' });
    calls.count += 1;
    calls.lastContentType = req.headers['content-type'] || null;
    return send(res, 200, { faces: [], analyzerVersion: 3, width: 64, height: 64 });
  });
}).listen(PORT, () => console.log(`가짜 얼굴 분석: http://localhost:${PORT}`));
