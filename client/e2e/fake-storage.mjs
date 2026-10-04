// e2e 전용 가짜 Supabase Storage — 상품 사진 올리기·보이기·지우기를 운영 저장소에 닿지 않고 끝까지 돌려 본다.
// server/utils/storage.js 가 부르는 REST 모양만 흉내 낸다(올리기 POST · 지우기 DELETE · 공개 GET).
//
//   node e2e/fake-storage.mjs                     # 기본 포트 5056
//   서버는 SUPABASE_URL=http://localhost:5056 SUPABASE_SECRET_KEY=e2e-fake 를 붙여 띄운다.
//
// GET /__files 는 지금 들고 있는 파일 경로 목록 — 상품을 지우면 사진 파일도 지워지는지 테스트가 본다.
import http from 'http';

const PORT = Number(process.env.FAKE_STORAGE_PORT || 5056);
const files = new Map();

const keyOf = (bucket, path) => `${bucket}/${decodeURIComponent(path)}`;

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/__files') return send(res, 200, [...files.keys()]);

  // 공개 주소를 먼저 본다 — 아래 일반 주소 모양에도 걸리기 때문에
  const publicMatch = pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (publicMatch && req.method === 'GET') {
    const file = files.get(keyOf(publicMatch[1], publicMatch[2]));
    return file ? send(res, 200, file.body, file.type) : send(res, 404, { error: 'not_found' });
  }

  const objectMatch = pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
  if (!objectMatch) return send(res, 404, { error: 'not_found' });
  const key = keyOf(objectMatch[1], objectMatch[2]);

  if (req.method === 'POST') {
    files.set(key, { type: req.headers['content-type'] || 'application/octet-stream', body: await readBody(req) });
    return send(res, 200, { Key: key });
  }
  if (req.method === 'DELETE') {
    return files.delete(key) ? send(res, 200, { message: 'deleted' }) : send(res, 404, { error: 'not_found' });
  }
  if (req.method === 'GET') {
    const file = files.get(key);
    return file ? send(res, 200, file.body, file.type) : send(res, 404, { error: 'not_found' });
  }
  return send(res, 405, { error: 'method_not_allowed' });
}).listen(PORT, () => console.log(`가짜 저장소: http://localhost:${PORT}`));
