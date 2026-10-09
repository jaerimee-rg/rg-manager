/**
 * e2e 용 데이터·세션을 만든다. (카카오 로그인은 자동화할 수 없어 토큰을 직접 발급한다)
 * 사용: node e2e/setup.mjs  →  e2e/.sessions.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../../server');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/rg_manager';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret';

const pool = (await import(path.join(serverDir, 'database.js'))).default;
const jwt = (await import(path.join(serverDir, 'node_modules/jsonwebtoken/index.js'))).default;
const bcrypt = (await import(path.join(serverDir, 'node_modules/bcrypt/bcrypt.js'))).default;

await new Promise((r) => setTimeout(r, 2500));

const now = new Date().toISOString();
const stamp = Date.now();
const sign = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

// 선생님
const pw = await bcrypt.hash('e2e-teacher', 10);
const teacherName = `e2e선생님_${stamp}`;
const t = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt") VALUES ($1,$2,'user',$3) RETURNING id, username, role`,
  [teacherName, pw, now]
);
const teacher = t.rows[0];

// 학생 두 명
const students = [];
for (const [name, birth] of [[`가은${stamp}`, '2018-04-01'], [`나윤${stamp}`, '2019-06-15']]) {
  const r = await pool.query(
    `INSERT INTO students (name, birthdate, "classIds", "userId", "createdAt") VALUES ($1,$2,'[]',$3,$4) RETURNING id, name, birthdate`,
    [name, birth, teacher.id, now]
  );
  students.push(r.rows[0]);
}

// 초대 링크
const inv = await pool.query(
  `INSERT INTO parent_invites ("userId", token, "createdAt", "updatedAt") VALUES ($1,$2,$3,$3) RETURNING id, token`,
  [teacher.id, `e2e-${stamp}`, now]
);

// 학부모 (초대를 거친 결과와 같은 상태)
const parentPw = await bcrypt.hash(String(Math.random()), 10);
const parentName = `e2e학부모_${stamp}`;
const p = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "kakaoId") VALUES ($1,$2,'parent',$3,$4) RETURNING id, username, role`,
  [parentName, parentPw, now, `e2e-kakao-${stamp}`]
);
const parent = p.rows[0];
await pool.query(
  `INSERT INTO parent_accounts ("userId","teacherId","inviteId","createdAt","lastLoginAt") VALUES ($1,$2,$3,$4,$4)`,
  [parent.id, teacher.id, inv.rows[0].id, now]
);

// ───────── 앨범 (사진 공유) ─────────
// Google Drive 없이도 화면을 검증할 수 있게, 폴더가 있는 이벤트와 사진 몇 장을 직접 넣는다.
// 썸네일은 Drive 를 가리키므로 브라우저에서 뜨지 않는다 — DOM 과 개수만 확인한다.

// 확정된 대회 (앨범 있음) + 미확정 대회 (앨범 있음, 하지만 못 봐야 한다)
const comp = await pool.query(
  `INSERT INTO competitions (name, date, location, "userId", "createdAt")
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [`e2e앨범대회_${stamp}`, '2026-09-12', '올림픽공원', teacher.id, now]
);

// 사진 메뉴(docs/photo-menu) 부터 앨범은 비공개로 시작한다. 학부모 화면을 보는 픽스처는 공개해 둔다.
const mkEvent = async (title, competitionId, withAlbum, { type = 'competition', published = true, audience = 'participants' } = {}) => {
  const row = await pool.query(
    `INSERT INTO events ("userId", type, title, date, location, options, "isPublished",
                         "registrationOpen", "competitionId", "driveFolderId", "driveFolderName",
                         "albumStatus", "albumUploadOpen", "albumCreatedAt", "albumPublished", "albumAudience",
                         "createdAt", "updatedAt")
     VALUES ($1,$9,$2,'2026-09-12','올림픽공원','[]',TRUE,TRUE,$3,$4,$5,$6,TRUE,$7,$8,$10,$7,$7)
     RETURNING id`,
    [teacher.id, title, competitionId,
      withAlbum ? `e2e-folder-${stamp}` : null,
      withAlbum ? `2026-09-12 ${title}` : null,
      withAlbum ? 'ready' : 'none', now, published, type, audience]
  );
  return row.rows[0].id;
};

const albumEventId = await mkEvent(`e2e확정대회_${stamp}`, comp.rows[0].id, true);
// 공개됐지만 공개 범위(참가 확정 학부모) 밖 — 학부모는 못 봐야 한다
const lockedEventId = await mkEvent(`e2e미확정대회_${stamp}`, null, true);
// 아직 비공개인 앨범 — 선생님이 사진 메뉴에서 공개하는 흐름을 이것으로 본다
const privateTitle = `e2e비공개앨범_${stamp}`;
const privateEventId = await mkEvent(privateTitle, null, true, { type: 'special', published: false });

// 이벤트 없이 만든 사진 전용 폴더(type='folder', photo-menu FR-517) — 비공개로 두고, 테스트가 공개했다가 되돌린다.
// 이벤트가 아니라서 장소·신청이 없고, 공개 범위는 모든 학부모다.
const folderTitle = `e2e사진폴더_${stamp}`;
const folderRow = await pool.query(
  `INSERT INTO events ("userId", type, title, date, options, "isPublished", "registrationOpen",
                       "driveFolderId", "driveFolderName", "albumStatus", "albumUploadOpen", "albumCreatedAt",
                       "albumPublished", "albumAudience", "createdAt", "updatedAt")
   VALUES ($1,'folder',$2,'2026-09-20','[]',TRUE,FALSE,$3,$4,'ready',TRUE,$5,FALSE,'all',$5,$5)
   RETURNING id`,
  [teacher.id, folderTitle, `e2e-photo-folder-${stamp}`, `2026-09-20 ${folderTitle}`, now]
);
const folderEventId = folderRow.rows[0].id;

// 지우기 테스트용 사진 폴더 (FR-519) — 사진이 한 장 들어 있다. 선생님 테스트가 화면에서 지운다.
const doomedFolderTitle = `e2e지울폴더_${stamp}`;
const doomedRow = await pool.query(
  `INSERT INTO events ("userId", type, title, date, options, "isPublished", "registrationOpen",
                       "driveFolderId", "driveFolderName", "albumStatus", "albumUploadOpen", "albumCreatedAt",
                       "albumPublished", "albumAudience", "createdAt", "updatedAt")
   VALUES ($1,'folder',$2,'2026-09-21','[]',TRUE,FALSE,$3,$4,'ready',TRUE,$5,FALSE,'all',$5,$5)
   RETURNING id`,
  [teacher.id, doomedFolderTitle, `e2e-doomed-folder-${stamp}`, `2026-09-21 ${doomedFolderTitle}`, now]
);
const doomedFolderEventId = doomedRow.rows[0].id;

// 사진 폴더를 지울 이벤트 앨범 (FR-519, 이벤트 앨범) — 공개 중인 스페셜, 사진 한 장과 신청 한 건.
// 선생님 테스트가 사진 메뉴에서 폴더를 지운 뒤 이벤트와 신청은 남는지 본다.
const doomedEventTitle = `e2e지울이벤트앨범_${stamp}`;
const doomedEventId = await mkEvent(doomedEventTitle, null, true, { type: 'special', audience: 'all' });
// 날짜를 앞당겨 사진 목록에서 e2e확정대회 아래에 둔다 — 같은 날짜면 id 순으로 위에 서서, 휴대폰 화면의 표지 테스트가 보는
// e2e확정대회 카드를 화면 밖(lazy 이미지가 안 뜬다)으로 밀어낸다
await pool.query(`UPDATE events SET date = '2026-09-05' WHERE id = $1`, [doomedEventId]);

// 모든 학부모에게 공개된 스페셜 앨범, 사진 한 장 — 학부모 테스트가 그 한 장을 숨겨 "보일 사진이 없는 앨범은 사진 탭에서 빠진다" 를 본다.
// 날짜를 앞당기는 이유는 위와 같다(사진 목록에서 e2e확정대회 아래에 두려고)
const sparseEventTitle = `e2e한장앨범_${stamp}`;
const sparseEventId = await mkEvent(sparseEventTitle, null, true, { type: 'special', audience: 'all' });
await pool.query(`UPDATE events SET date = '2026-09-04' WHERE id = $1`, [sparseEventId]);

// 첫째 아이를 이 대회의 참가 학생으로 넣어 "확정" 상태를 만든다.
await pool.query(
  `INSERT INTO competition_students ("competitionId","studentId","createdAt") VALUES ($1,$2,$3)`,
  [comp.rows[0].id, students[0].id, now]
);

// 사진 4장(선생님 3, 학부모 1) + 영상 1개
const mkMedia = async ({ i, kind, uploaderRole, uploaderUserId, hidden = false, eventId = albumEventId, faceStatus = 'done' }) => {
  const row = await pool.query(
    `INSERT INTO event_media ("eventId","driveFileId",kind,"originalName","driveName","mimeType",size,
                              "takenAt","uploaderUserId","uploaderRole",status,"isHidden","faceStatus",
                              "faceCount","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready',$11,$13,$14,$12,$12)
     RETURNING id`,
    [eventId, `e2e-file-${stamp}-${i}`, kind,
      kind === 'video' ? `VID_${i}.mp4` : `IMG_${i}.jpg`,
      `20260912_e2e_${i}`, kind === 'video' ? 'video/mp4' : 'image/jpeg',
      100000 + i, `2026-09-12T1${i}:00:00.000Z`, uploaderUserId, uploaderRole, hidden, now,
      faceStatus, faceStatus === 'done' ? 1 : 0]
  );
  return row.rows[0].id;
};

const mediaIds = [];
mediaIds.push(await mkMedia({ i: 1, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id }));
mediaIds.push(await mkMedia({ i: 2, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id }));
mediaIds.push(await mkMedia({ i: 3, kind: 'image', uploaderRole: 'parent', uploaderUserId: parent.id }));
mediaIds.push(await mkMedia({ i: 4, kind: 'video', uploaderRole: 'teacher', uploaderUserId: teacher.id }));
// 비공개 앨범에도 두 장 — 공개하면 학부모 이벤트 상세 사진 칸에 나타나야 한다
await mkMedia({ i: 5, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: privateEventId });
await mkMedia({ i: 6, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: privateEventId });
// 지울 폴더에도 한 장 — 폴더를 지우면 이 기록도 함께 사라져야 한다
await mkMedia({ i: 40, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: doomedFolderEventId });
await mkMedia({ i: 41, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: doomedEventId });
const sparseMediaId = await mkMedia({ i: 42, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: sparseEventId });
await pool.query(
  `INSERT INTO event_registrations ("eventId", "studentId", "parentUserId", status, "confirmedAt", "createdBy", "createdAt", "updatedAt")
   VALUES ($1,$2,NULL,'confirmed',$3,'teacher',$3,$3)`,
  [doomedEventId, students[0].id, now]
);
// 사진 전용 폴더에도 한 장
await mkMedia({ i: 7, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: folderEventId });
// 예전 방식(버전 기록 없음)으로 "얼굴 없음" 이 된 사진 두 장 — 선생님 [얼굴 찾기] 가 다시 찾아 저장하는지 본다
const faceScanEventId = await mkEvent(`e2e얼굴찾기_${stamp}`, null, true, { type: 'special', published: false });
await mkMedia({ i: 8, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: faceScanEventId, faceStatus: 'none' });
await mkMedia({ i: 9, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: faceScanEventId, faceStatus: 'none' });
// 얼굴이 나오는 사진 한 장 — [얼굴 찾기] 가 찾은 얼굴을 작게 잘라 보여 주는지 본다(위 앨범과 따로 둬 서로 안 섞이게)
const faceThumbEventId = await mkEvent(`e2e얼굴그림_${stamp}`, null, true, { type: 'special', published: false });
await mkMedia({ i: 11, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: faceThumbEventId, faceStatus: 'none' });

// 얼굴 목록(앨범 위 사람마다 얼굴 하나) — 사진 세 장에 두 사람: 가(사진 21·22), 나(22·23). 모든 학부모에게 공개한 사진 전용
// 폴더라 학부모 화면에서도 본다(이벤트가 아니라 일정 화면에는 안 나온다). 두 특징값은 서로 직각이고, 학부모가 등록한 기준
// 얼굴(0.1 로 채운 값)과도 직각이라 자동 태그가 붙지 않는다 — 순전히 얼굴끼리 닮은 것으로 묶인다.
const peopleEventId = await mkEvent(`e2e얼굴목록_${stamp}`, null, true, { type: 'folder', published: true, audience: 'all' });
const peopleVector = (sign) => Buffer.from(Float32Array.from({ length: 512 }, (_, k) => sign(k)).buffer).toString('base64');
const personA = peopleVector((k) => (k % 2 ? -1 : 1));
const personB = peopleVector((k) => (k % 4 < 2 ? 1 : -1));
const peopleMediaIds = [];
for (const i of [21, 22, 23]) {
  peopleMediaIds.push(await mkMedia({ i, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: peopleEventId }));
}
// 지금 방식으로 찾은 것으로 — 아니면 [얼굴 찾기] 안내가 함께 뜬다
await pool.query('UPDATE event_media SET "faceAnalyzerVersion" = 3 WHERE id = ANY($1::int[])', [peopleMediaIds]);
for (const [mediaId, descriptor, box] of [
  [peopleMediaIds[0], personA, { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }],
  [peopleMediaIds[1], personA, { x: 0.1, y: 0.3, w: 0.15, h: 0.15 }],
  [peopleMediaIds[1], personB, { x: 0.6, y: 0.3, w: 0.15, h: 0.15 }],
  [peopleMediaIds[2], personB, { x: 0.4, y: 0.4, w: 0.25, h: 0.25 }]
]) {
  await pool.query(
    `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4)`,
    [mediaId, JSON.stringify(box), descriptor, now]
  );
}

// 얼굴 목록에서 사람 빼기 — 위 얼굴 목록 앨범과 같은 모양(사진 세 장, 가: 31·32, 나: 32·33)을 따로 둔다.
// 선생님이 한 사람을 빼므로 학부모 얼굴 목록 테스트가 쓰는 앨범(peopleEventId)은 건드리지 않는다.
const removeFaceEventId = await mkEvent(`e2e얼굴빼기_${stamp}`, null, true, { type: 'special', published: false });
const removeFaceMediaIds = [];
for (const i of [31, 32, 33]) {
  removeFaceMediaIds.push(await mkMedia({ i, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: removeFaceEventId }));
}
await pool.query('UPDATE event_media SET "faceAnalyzerVersion" = 3 WHERE id = ANY($1::int[])', [removeFaceMediaIds]);
for (const [mediaId, descriptor, box] of [
  [removeFaceMediaIds[0], personA, { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }],
  [removeFaceMediaIds[1], personA, { x: 0.1, y: 0.3, w: 0.15, h: 0.15 }],
  [removeFaceMediaIds[1], personB, { x: 0.6, y: 0.3, w: 0.15, h: 0.15 }],
  [removeFaceMediaIds[2], personB, { x: 0.4, y: 0.4, w: 0.25, h: 0.25 }]
]) {
  await pool.query(
    `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4)`,
    [mediaId, JSON.stringify(box), descriptor, now]
  );
}
// 등록된 아이로 묶인 사람(다: 사진 33) — 선생님이 손으로 태그했다. 이 사람은 길게 눌러도 X 가 없어야 한다
const personC = peopleVector((k) => (k % 8 < 4 ? 1 : -1));   // 가·나·기준 얼굴 모두와 직각
const studentFace = await pool.query(
  `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4) RETURNING id`,
  [removeFaceMediaIds[2], JSON.stringify({ x: 0.05, y: 0.1, w: 0.12, h: 0.12 }), personC, now]
);
await pool.query(
  `INSERT INTO media_tags ("mediaId","studentId",source,"faceId","createdByUserId","createdAt","updatedAt")
   VALUES ($1,$2,'manual',$3,$4,$5,$5)`,
  [removeFaceMediaIds[2], students[0].id, studentFace.rows[0].id, teacher.id, now]
);

// 학부모가 첫째 아이에 등록해 둔 얼굴 사진 두 장(특징값만) → 내 정보에서 한 장을 지우는 흐름을 본다.
// 두 장이 같은 값이라 한 장을 지워도 남은 한 장과 아래 태그 사진의 얼굴이 그대로 맞는다(태그가 유지된다).
const faceVector = Buffer.from(new Float32Array(512).fill(0.1).buffer).toString('base64');   // ArcFace 512차원
for (let i = 0; i < 2; i += 1) {
  await pool.query(
    `INSERT INTO child_face_profiles ("studentId","teacherUserId","parentUserId","createdBy",descriptor,"consentAt","createdAt")
     VALUES ($1,$2,$3,'parent',$4,$5,$5)`,
    [students[0].id, teacher.id, parent.id, faceVector, now]
  );
}

// 예전 규칙으로 붙은 자동 태그가 남은 앨범 — 얼굴은 기준 얼굴과 전혀 다른데(코사인 거리 1, 직각) 'face' 태그가 붙어 있다.
// 앨범을 열면 지금 규칙으로 다시 매칭돼 이 태그가 사라져야 한다(albumMatchRules 가 비어 있다).
const staleEventId = await mkEvent(`e2e재매칭_${stamp}`, null, true, { type: 'special', published: false });
const staleMediaId = await mkMedia({ i: 10, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id, eventId: staleEventId });
const farVector = Buffer.from(Float32Array.from({ length: 512 }, (_, i) => (i % 2 ? -0.9 : 0.9)).buffer).toString('base64');
const staleFace = await pool.query(
  `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4) RETURNING id`,
  [staleMediaId, JSON.stringify({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }), farVector, now]
);
await pool.query(
  `INSERT INTO media_tags ("mediaId","studentId",source,distance,"faceId","createdAt","updatedAt") VALUES ($1,$2,'face',0.45,$3,$4,$4)`,
  [staleMediaId, students[0].id, staleFace.rows[0].id, now]
);

// 첫째 아이 태그를 두 장에 붙인다 → "우리 아이만" 토글로 걸러지는지 확인한다.
// 실제처럼 그 아이 기준 얼굴과 같은 얼굴(거리 0)을 함께 넣는다 — 얼굴 벡터가 없는 사진의 자동 태그는
// 앨범을 열 때 다시 매칭하며 지워진다(예전 face-api 값만 남은 사진의 틀린 태그를 치우는 규칙).
for (const mediaId of mediaIds.slice(0, 2)) {
  const tagged = await pool.query(
    `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4) RETURNING id`,
    [mediaId, JSON.stringify({ x: 0.3, y: 0.2, w: 0.2, h: 0.25 }), faceVector, now]
  );
  await pool.query(
    `INSERT INTO media_tags ("mediaId","studentId",source,distance,"faceId","createdAt","updatedAt") VALUES ($1,$2,'face',0,$3,$4,$4)`,
    [mediaId, students[0].id, tagged.rows[0].id, now]
  );
}

/* ───────── 계정 · 역할 · 초대 (docs/accounts-roles) ─────────
   한 카카오 계정이 역할마다 계정을 갖고, 학부모가 선생님 여럿과 연결되는 상태를 만든다. */

// 위 학부모를 다대다 연결 표에도 넣는다 (initDatabase 백필과 같은 모양)
await pool.query(
  `INSERT INTO parent_teachers ("parentUserId","teacherId","inviteId","createdAt")
   VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
  [parent.id, teacher.id, inv.rows[0].id, now]
);

/* 두 번째 선생님 + 그 선생님의 학생 + 같은 학부모의 두 번째 자녀.
   username 은 초대로 만든 계정처럼 `카카오_<ts>` 자동 식별자이고, 사람에게 보이는 이름은
   displayName 이다 — 학부모 화면에 식별자가 새지 않는지 검증하는 구성. */
const teacher2DisplayName = `e2e박지우_${stamp}`;
const t2 = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "displayName") VALUES ($1,$2,'user',$3,$4) RETURNING id, username, role`,
  [`카카오_${stamp}`, pw, now, teacher2DisplayName]
);
const teacher2 = t2.rows[0];

const s2 = await pool.query(
  `INSERT INTO students (name, birthdate, "classIds", "userId", "createdAt") VALUES ($1,$2,'[]',$3,$4) RETURNING id, name, birthdate`,
  [`나윤B${stamp}`, '2019-06-15', teacher2.id, now]
);
const studentB = s2.rows[0];

const invB = await pool.query(
  `INSERT INTO parent_invites ("userId", token, "createdAt", "updatedAt") VALUES ($1,$2,$3,$3) RETURNING id, token`,
  [teacher2.id, `e2e-b-${stamp}`, now]
);

/* 위 `parent` 는 선생님 **1명**으로 남긴다 — 기존 e2e(온보딩 → 신청)가
   "선생님을 고를 필요가 없는" 단일 선생님 상태를 전제한다.
   다중 선생님은 아래 parentMulti 로 따로 검증한다. */

// 두 번째 선생님의 공개 이벤트 (학부모 일정에 함께 보여야 한다)
const eventB = await pool.query(
  `INSERT INTO events ("userId", type, title, date, location, options, "isPublished", "registrationOpen", "createdAt", "updatedAt")
   VALUES ($1,'special',$2,'2026-11-15','한강공원','[]',TRUE,TRUE,$3,$3) RETURNING id`,
  [teacher2.id, `e2eB러닝_${stamp}`, now]
);

/* 다중 선생님 시나리오는 **별도 학부모**로 만든다.
   위의 `parent` 는 기존 e2e(가입 → 온보딩 → 신청)가 "아이가 아직 없는 상태" 를
   전제하므로, 여기에 자녀·두 번째 선생님을 붙이면 그 시나리오가 깨진다. */
const p2 = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "kakaoId") VALUES ($1,$2,'parent',$3,$4) RETURNING id, username, role`,
  [`e2e다중학부모_${stamp}`, parentPw, now, `e2e-kakao-multi-${stamp}`]
);
const parentMulti = p2.rows[0];

await pool.query(
  `INSERT INTO parent_accounts ("userId","teacherId","inviteId","createdAt","lastLoginAt") VALUES ($1,$2,$3,$4,$4)`,
  [parentMulti.id, teacher.id, inv.rows[0].id, now]
);

for (const [teacherId, inviteId] of [[teacher.id, inv.rows[0].id], [teacher2.id, invB.rows[0].id]]) {
  await pool.query(
    `INSERT INTO parent_teachers ("parentUserId","teacherId","inviteId","createdAt")
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [parentMulti.id, teacherId, inviteId, now]
  );
}

// 선생님마다 자녀 하나씩 — "다른 선생님 아이로는 신청 불가" 를 검증하기 위한 구성
await pool.query(
  `INSERT INTO parent_children ("parentUserId","teacherId","studentId","childName","childBirthdate",status,"linkedAt","linkedBy","createdAt")
   VALUES ($1,$2,$3,$4,$5,'linked',$6,'auto',$6)`,
  [parentMulti.id, teacher.id, students[0].id, students[0].name, students[0].birthdate, now]
);
await pool.query(
  `INSERT INTO parent_children ("parentUserId","teacherId","studentId","childName","childBirthdate",status,"linkedAt","linkedBy","createdAt")
   VALUES ($1,$2,$3,$4,$5,'linked',$6,'auto',$6)`,
  [parentMulti.id, teacher2.id, studentB.id, studentB.name, studentB.birthdate, now]
);

/* 사진 폴더 공유 링크(docs/photo-menu FR-518)용 학부모 — **두 번째 선생님 쪽으로만** 가입해 있다.
   첫 번째 선생님이 보낸 사진 링크(초대 포함)를 열면 그 선생님과 연결된 뒤 사진이 열려야 한다.
   다른 시나리오의 학부모를 건드리지 않게 따로 둔다(연결이 늘어나면 그 학부모의 화면이 달라진다). */
const p3 = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "kakaoId") VALUES ($1,$2,'parent',$3,$4) RETURNING id, username, role`,
  [`e2e다른반학부모_${stamp}`, parentPw, now, `e2e-kakao-other-${stamp}`]
);
const parentOther = p3.rows[0];
await pool.query(
  `INSERT INTO parent_accounts ("userId","teacherId","inviteId","createdAt","lastLoginAt") VALUES ($1,$2,$3,$4,$4)`,
  [parentOther.id, teacher2.id, invB.rows[0].id, now]
);
await pool.query(
  `INSERT INTO parent_teachers ("parentUserId","teacherId","inviteId","createdAt") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
  [parentOther.id, teacher2.id, invB.rows[0].id, now]
);
// 아이가 하나라도 있어야 온보딩으로 돌려보내지 않는다 (학생과 아직 맞춰지지 않은 상태)
await pool.query(
  `INSERT INTO parent_children ("parentUserId","teacherId","studentId","childName","childBirthdate",status,"createdAt")
   VALUES ($1,$2,NULL,$3,'2019-03-03','pending',$4)`,
  [parentOther.id, teacher2.id, `다른반아이${stamp}`, now]
);

/* 아이 삭제(마지막 아이 → 다시 등록) 전용 학부모 — 첫 번째 선생님, 아이 하나(학생과 아직 안 맞춰짐), 학부모명 있음.
   공용 학부모(parent)의 아이를 지우면 그 학부모에게 넣어 둔 얼굴 사진·자동 태그가 함께 지워져
   뒤의 사진 테스트가 깨지므로 따로 둔다. */
const p4 = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "kakaoId") VALUES ($1,$2,'parent',$3,$4) RETURNING id, username, role`,
  [`e2e삭제학부모_${stamp}`, parentPw, now, `e2e-kakao-solo-${stamp}`]
);
const parentSolo = p4.rows[0];
const parentSoloName = '솔로엄마';
await pool.query(
  `INSERT INTO parent_accounts ("userId","teacherId","inviteId","createdAt","lastLoginAt","displayName") VALUES ($1,$2,$3,$4,$4,$5)`,
  [parentSolo.id, teacher.id, inv.rows[0].id, now, parentSoloName]
);
await pool.query(
  `INSERT INTO parent_teachers ("parentUserId","teacherId","inviteId","createdAt") VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
  [parentSolo.id, teacher.id, inv.rows[0].id, now]
);
const soloChild = { name: `솔로${String(stamp).slice(-6)}`, birthdate: '2020-02-02' };
await pool.query(
  `INSERT INTO parent_children ("parentUserId","teacherId","studentId","childName","childBirthdate",status,"createdAt")
   VALUES ($1,$2,NULL,$3,$4,'pending',$5)`,
  [parentSolo.id, teacher.id, soloChild.name, soloChild.birthdate, now]
);

/* 관리자: 첫 번째 선생님과 **같은 카카오 계정** 을 쓴다.
   역할 전환(관리자 ↔ 선생님)을 카카오 화면 없이 검증하기 위한 구성이다. */
const sharedKakao = `e2e-shared-${stamp}`;
await pool.query('UPDATE users SET "kakaoId" = $1 WHERE id = $2', [sharedKakao, teacher.id]);

const a = await pool.query(
  `INSERT INTO users (username, password, role, "createdAt", "kakaoId") VALUES ($1,$2,'admin',$3,$4) RETURNING id, username, role`,
  [`e2e관리자_${stamp}`, pw, now, sharedKakao]
);
const adminUser = a.rows[0];

// 아직 쓰지 않은 선생님 초대 (관리자 화면에서 목록·회수를 확인한다)
const tinv = await pool.query(
  `INSERT INTO teacher_invites (token, "createdBy", label, "expiresAt", "createdAt")
   VALUES ($1,$2,$3,$4,$5) RETURNING id, token`,
  [`e2e-tinv-${stamp}`, adminUser.id, `e2e초대_${stamp}`,
   new Date(Date.now() + 14 * 86400000).toISOString(), now]
);

// 같은 파일 건너뛰기 — Google 이 연결된 것처럼 보이는 **따로 된** 선생님(다른 테스트의 '연결 안 됨' 전제를 건드리지 않게).
// 연결 행의 토큰은 가짜다. 올릴 파일이 전부 앨범에 이미 있으면 서버는 Drive 를 부르지 않으므로 진짜 서버로 끝까지 돈다.
const sameFileTeacher = (await pool.query(
  `INSERT INTO users (username, password, role, "createdAt") VALUES ($1,$2,'user',$3) RETURNING id, username, role`,
  [`e2e같은파일_${stamp}`, pw, now]
)).rows[0];
await pool.query(
  `INSERT INTO google_drive_accounts ("userId", "googleSub", "googleEmail", "accessToken", "refreshToken", "tokenExpiresAt",
                                      status, "connectedAt", "updatedAt")
   VALUES ($1,$2,$3,'e2e-fake-access','e2e-fake-refresh',$4,'connected',$5,$5)`,
  [sameFileTeacher.id, `e2e-sub-${stamp}`, `e2e-${stamp}@example.com`, new Date(Date.now() + 365 * 86400000).toISOString(), now]
);
const sameFileTitle = `e2e같은파일앨범_${stamp}`;
const sameFileEventId = (await pool.query(
  `INSERT INTO events ("userId", type, title, date, options, "isPublished", "registrationOpen",
                       "driveFolderId", "driveFolderName", "albumStatus", "albumUploadOpen", "albumCreatedAt",
                       "albumPublished", "albumAudience", "createdAt", "updatedAt")
   VALUES ($1,'folder',$2,'2026-09-28','[]',TRUE,FALSE,$3,$4,'ready',TRUE,$5,FALSE,'all',$5,$5)
   RETURNING id`,
  [sameFileTeacher.id, sameFileTitle, `e2e-same-folder-${stamp}`, `2026-09-28 ${sameFileTitle}`, now]
)).rows[0].id;
// 이미 올라가 있는 두 파일 — 하나는 한글 이름(NFC 로 저장된다)
const sameFiles = [{ name: 'IMG_dup.jpg', size: 4 }, { name: '대회사진.jpg', size: 5 }];
for (const [i, file] of sameFiles.entries()) {
  await pool.query(
    `INSERT INTO event_media ("eventId","driveFileId",kind,"originalName","driveName","mimeType",size,
                              "takenAt","uploaderUserId","uploaderRole",status,"faceStatus","faceAnalyzerVersion","createdAt","updatedAt")
     VALUES ($1,$2,'image',$3,$4,'image/jpeg',$5,$6,$7,'teacher','ready','none',3,$6,$6)`,
    [sameFileEventId, `e2e-same-file-${stamp}-${i}`, file.name, `20260928_선생님_${file.name}`, file.size, now, sameFileTeacher.id]
  );
}

// 전체 사진(모든 폴더) — 따로 된 선생님에 대회 앨범 하나 + 사진 전용 폴더 하나. 같은 아이(가)가 두 폴더에 걸쳐 사진 3장(51·52·53),
// 다른 사람(나)은 52 에만, 54 는 얼굴 없음. 공유 선생님의 다른 앨범 얼굴과 섞이지 않게 선생님을 따로 둔다
// (전체 사진의 얼굴 목록은 그 선생님의 모든 폴더를 함께 묶는다).
const allPhotosTeacher = (await pool.query(
  `INSERT INTO users (username, password, role, "createdAt") VALUES ($1,$2,'user',$3) RETURNING id, username, role`,
  [`e2e전체사진_${stamp}`, pw, now]
)).rows[0];
const allPhotosEventTitle = `e2e전체사진대회_${stamp}`;
const allPhotosFolderTitle = `e2e전체사진폴더_${stamp}`;
const mkAllPhotosAlbum = async (type, title, date) => (await pool.query(
  `INSERT INTO events ("userId", type, title, date, options, "isPublished", "registrationOpen",
                       "driveFolderId", "driveFolderName", "albumStatus", "albumUploadOpen", "albumCreatedAt",
                       "albumPublished", "albumAudience", "createdAt", "updatedAt")
   VALUES ($1,$2,$3,$4,'[]',TRUE,FALSE,$5,$6,'ready',TRUE,$7,FALSE,'all',$7,$7)
   RETURNING id`,
  [allPhotosTeacher.id, type, title, date, `e2e-all-${type}-${stamp}`, `${date} ${title}`, now]
)).rows[0].id;
const allPhotosEventId = await mkAllPhotosAlbum('competition', allPhotosEventTitle, '2026-09-14');
const allPhotosFolderId = await mkAllPhotosAlbum('folder', allPhotosFolderTitle, '2026-09-15');
const allPhotosMedia = {};
for (const [i, eventId] of [[51, allPhotosEventId], [52, allPhotosEventId], [53, allPhotosFolderId], [54, allPhotosFolderId]]) {
  allPhotosMedia[i] = await mkMedia({ i, kind: 'image', uploaderRole: 'teacher', uploaderUserId: allPhotosTeacher.id, eventId });
}
await pool.query('UPDATE event_media SET "faceAnalyzerVersion" = 3 WHERE id = ANY($1::int[])', [Object.values(allPhotosMedia)]);
await pool.query(`UPDATE event_media SET "faceStatus" = 'none', "faceCount" = 0 WHERE id = $1`, [allPhotosMedia[54]]);
for (const [mediaId, descriptor, box] of [
  [allPhotosMedia[51], personA, { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }],
  [allPhotosMedia[52], personA, { x: 0.1, y: 0.3, w: 0.15, h: 0.15 }],
  [allPhotosMedia[52], personB, { x: 0.6, y: 0.3, w: 0.15, h: 0.15 }],
  [allPhotosMedia[53], personA, { x: 0.4, y: 0.4, w: 0.25, h: 0.25 }]
]) {
  await pool.query(
    `INSERT INTO media_faces ("mediaId", box, score, descriptor, "createdAt") VALUES ($1,$2,0.9,$3,$4)`,
    [mediaId, JSON.stringify(box), descriptor, now]
  );
}

const sessions = {
  album: { eventId: albumEventId, lockedEventId, privateEventId, privateTitle, folderEventId, folderTitle, doomedFolderEventId, doomedFolderTitle, doomedEventId, doomedEventTitle, sparseEventId, sparseEventTitle, sparseMediaId, faceScanEventId, faceThumbEventId, peopleEventId, removeFaceEventId, staleEventId, mediaIds, taggedCount: 2, totalCount: 4 },
  teacher: { token: sign(teacher), user: { id: teacher.id, username: teacher.username, role: 'user' } },
  teacher2Token: sign(teacher2),
  parent: { token: sign(parent), user: { id: parent.id, username: parent.username, role: 'parent' } },
  parentMulti: { token: sign(parentMulti), user: { id: parentMulti.id, username: parentMulti.username, role: 'parent' } },
  parentOther: { token: sign(parentOther), user: { id: parentOther.id, username: parentOther.username, role: 'parent' } },
  parentSolo: {
    token: sign(parentSolo), user: { id: parentSolo.id, username: parentSolo.username, role: 'parent' },
    displayName: parentSoloName, child: soloChild
  },
  admin: { token: sign(adminUser), user: { id: adminUser.id, username: adminUser.username, role: 'admin' } },
  teacher2: { id: teacher2.id, username: teacher2.username, displayName: teacher2DisplayName, invite: invB.rows[0].token, eventId: eventB.rows[0].id },
  teacherInvite: { id: tinv.rows[0].id, token: tinv.rows[0].token },
  allPhotos: {
    teacher: { token: sign(allPhotosTeacher), user: { id: allPhotosTeacher.id, username: allPhotosTeacher.username, role: 'user' } },
    eventTitle: allPhotosEventTitle,
    folderTitle: allPhotosFolderTitle
  },
  sameFile: {
    teacher: { token: sign(sameFileTeacher), user: { id: sameFileTeacher.id, username: sameFileTeacher.username, role: 'user' } },
    eventId: sameFileEventId,
    title: sameFileTitle,
    files: sameFiles
  },
  sharedKakao,
  invite: inv.rows[0].token,
  students,
  studentB,
  stamp
};

writeFileSync(path.join(here, '.sessions.json'), JSON.stringify(sessions, null, 2));
console.log('e2e 데이터 준비 완료:', teacherName, '/', parentName);
await pool.end();
