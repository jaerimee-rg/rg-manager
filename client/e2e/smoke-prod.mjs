/**
 * 프로덕션 스모크 테스트.
 * Google Drive 는 아직 연결되지 않은 상태이므로 "미연결 경로"가 바르게 도는지 본다.
 */
const BASE = process.env.SMOKE_BASE || 'https://rg-manager.vercel.app';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = async (path, options = {}) => {
  const res = await fetch(BASE + path, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML */ }
  return { status: res.status, json, text, type: res.headers.get('content-type') || '' };
};

// 1) 기존 기능 회귀
const api = await get('/api');
check('API 살아 있음', api.status === 200 && api.json?.message?.includes('리듬체조'));

const login = await get('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
check('로그인 엔드포인트 응답(400/401)', [400, 401].includes(login.status), `status ${login.status}`);

const home = await get('/');
check('앱 화면(index.html) 서빙', home.status === 200 && home.text.includes('<div id="root">'));

const assets = home.text.match(/\/assets\/index-[\w-]+\.js/);
if (assets) {
  const js = await get(assets[0]);
  check('번들 로드', js.status === 200 && js.type.includes('javascript'));
} else check('번들 참조 확인', false, 'index.html 에서 번들을 못 찾음');

// 2) 새 정적 자산 — 이번 배포에서 고친 라우팅
for (const file of ['tiny_face_detector_model-weights_manifest.json', 'face_recognition_model-weights_manifest.json']) {
  const m = await get(`/models/${file}`);
  check(`얼굴 모델 ${file.split('_')[0]} 제공`, m.status === 200 && Boolean(m.json), m.type);
}
// HTTP/2 응답에는 content-length 가 없을 수 있어 본문을 실제로 센다.
const bin = await fetch(`${BASE}/models/tiny_face_detector_model.bin`);
const binBytes = (await bin.arrayBuffer()).byteLength;
check('모델 가중치(.bin) 제공', bin.status === 200 && binBytes > 100000, `${Math.round(binBytes / 1024)}KB`);

// 3) 새 API — 토큰 없이도 규칙대로 막혀야 한다
const drive = await get('/api/drive/account');
check('인증 없는 /api/drive/account 는 401', drive.status === 401, `status ${drive.status}`);

const album = await get('/api/events/1/album');
check('인증 없는 앨범 API 는 401', album.status === 401, `status ${album.status}`);

const parentAlbums = await get('/api/parent/albums');
check('인증 없는 학부모 앨범 API 는 401', parentAlbums.status === 401, `status ${parentAlbums.status}`);

// 4) 새 라우트가 SPA 로 열린다 (React Router 가 처리)
const photos = await get('/parent/photos');
check('학부모 사진 경로가 앱으로 열림', photos.status === 200 && photos.text.includes('<div id="root">'));

// 5) 계정·역할·초대 (docs/accounts-roles)
const roles = await get('/api/auth/roles');
check('인증 없는 역할 조회는 401', roles.status === 401, `status ${roles.status}`);

const switchRole = await get('/api/auth/switch-role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"admin"}' });
check('인증 없는 역할 전환은 401', switchRole.status === 401, `status ${switchRole.status}`);

const teacherInvites = await get('/api/teacher-invites');
check('인증 없는 선생님 초대 목록은 401', teacherInvites.status === 401, `status ${teacherInvites.status}`);

// 공개 확인 경로는 열려 있되, 없는 토큰은 404 여야 한다
const badInvite = await get('/api/teacher-invite/not-a-real-token');
check('없는 선생님 초대 토큰은 404', badInvite.status === 404, `status ${badInvite.status}`);

const inviteLanding = await get('/teacher-invite/xyz');
check('선생님 초대 랜딩이 앱으로 열림', inviteLanding.status === 200 && inviteLanding.text.includes('<div id="root">'));

console.log('');
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `실패 ${failed.length}건: ${failed.map((r) => r.name).join(', ')}` : `모두 통과 (${results.length}건)`);
process.exit(failed.length ? 1 : 0);
