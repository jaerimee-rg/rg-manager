/**
 * /api/face-engine/* — 얼굴 분석(face_engine/, Python)으로 넘긴다. **로컬·e2e 전용.**
 *
 * 운영(Vercel)에서는 vercel.json 이 이 경로를 Python 함수로 먼저 보내서 Express 까지 오지 않는다.
 * 로컬에서는 FACE_ENGINE_URL(예: http://localhost:5090 — face_engine/dev_server.py, e2e 는 fake-face-engine.mjs)
 * 로 그대로 넘기고, 없으면 503 을 준다 — 브라우저는 그 사진을 '분석 안 됨'(skipped)으로 두고 업로드를 이어 간다.
 */
const FORWARDED_HEADERS = ['authorization', 'content-type'];

export const createFaceEngineProxy = ({ baseUrl = process.env.FACE_ENGINE_URL, fetchImpl = fetch } = {}) =>
  async (req, res) => {
    if (!baseUrl) {
      return res.status(503).json({ error: '얼굴 분석 서버가 꺼져 있어요.', reason: 'engine_unavailable' });
    }

    const headers = {};
    for (const name of FORWARDED_HEADERS) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }

    try {
      const body = Buffer.isBuffer(req.body) && req.body.length ? req.body : undefined;
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/face-engine${req.path}`, {
        method: req.method,
        headers,
        body: req.method === 'GET' ? undefined : body
      });
      const text = await response.text();
      res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(text);
    } catch (error) {
      console.error('얼굴 분석 서버 연결 실패:', error?.message || error);
      res.status(503).json({ error: '얼굴 분석 서버에 연결하지 못했어요.', reason: 'engine_unavailable' });
    }
  };

export default createFaceEngineProxy;
