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

const mkEvent = async (title, competitionId, withAlbum) => {
  const row = await pool.query(
    `INSERT INTO events ("userId", type, title, date, location, options, "isPublished",
                         "registrationOpen", "competitionId", "driveFolderId", "driveFolderName",
                         "albumStatus", "albumUploadOpen", "albumCreatedAt", "createdAt", "updatedAt")
     VALUES ($1,'competition',$2,'2026-09-12','올림픽공원','[]',TRUE,TRUE,$3,$4,$5,$6,TRUE,$7,$7,$7)
     RETURNING id`,
    [teacher.id, title, competitionId,
      withAlbum ? `e2e-folder-${stamp}` : null,
      withAlbum ? `2026-09-12 ${title}` : null,
      withAlbum ? 'ready' : 'none', now]
  );
  return row.rows[0].id;
};

const albumEventId = await mkEvent(`e2e확정대회_${stamp}`, comp.rows[0].id, true);
const lockedEventId = await mkEvent(`e2e미확정대회_${stamp}`, null, true);

// 첫째 아이를 이 대회의 참가 학생으로 넣어 "확정" 상태를 만든다.
await pool.query(
  `INSERT INTO competition_students ("competitionId","studentId","createdAt") VALUES ($1,$2,$3)`,
  [comp.rows[0].id, students[0].id, now]
);

// 사진 4장(선생님 3, 학부모 1) + 영상 1개
const mkMedia = async ({ i, kind, uploaderRole, uploaderUserId, hidden = false }) => {
  const row = await pool.query(
    `INSERT INTO event_media ("eventId","driveFileId",kind,"originalName","driveName","mimeType",size,
                              "takenAt","uploaderUserId","uploaderRole",status,"isHidden","faceStatus",
                              "faceCount","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready',$11,'done',1,$12,$12)
     RETURNING id`,
    [albumEventId, `e2e-file-${stamp}-${i}`, kind,
      kind === 'video' ? `VID_${i}.mp4` : `IMG_${i}.jpg`,
      `20260912_e2e_${i}`, kind === 'video' ? 'video/mp4' : 'image/jpeg',
      100000 + i, `2026-09-12T1${i}:00:00.000Z`, uploaderUserId, uploaderRole, hidden, now]
  );
  return row.rows[0].id;
};

const mediaIds = [];
mediaIds.push(await mkMedia({ i: 1, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id }));
mediaIds.push(await mkMedia({ i: 2, kind: 'image', uploaderRole: 'teacher', uploaderUserId: teacher.id }));
mediaIds.push(await mkMedia({ i: 3, kind: 'image', uploaderRole: 'parent', uploaderUserId: parent.id }));
mediaIds.push(await mkMedia({ i: 4, kind: 'video', uploaderRole: 'teacher', uploaderUserId: teacher.id }));

// 첫째 아이 태그를 두 장에 붙인다 → "우리 아이만" 토글로 걸러지는지 확인한다.
for (const mediaId of mediaIds.slice(0, 2)) {
  await pool.query(
    `INSERT INTO media_tags ("mediaId","studentId",source,"createdAt","updatedAt") VALUES ($1,$2,'face',$3,$3)`,
    [mediaId, students[0].id, now]
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

const sessions = {
  album: { eventId: albumEventId, lockedEventId, mediaIds, taggedCount: 2, totalCount: 4 },
  teacher: { token: sign(teacher), user: { id: teacher.id, username: teacher.username, role: 'user' } },
  teacher2Token: sign(teacher2),
  parent: { token: sign(parent), user: { id: parent.id, username: parent.username, role: 'parent' } },
  parentMulti: { token: sign(parentMulti), user: { id: parentMulti.id, username: parentMulti.username, role: 'parent' } },
  admin: { token: sign(adminUser), user: { id: adminUser.id, username: adminUser.username, role: 'admin' } },
  teacher2: { id: teacher2.id, username: teacher2.username, displayName: teacher2DisplayName, invite: invB.rows[0].token, eventId: eventB.rows[0].id },
  teacherInvite: { id: tinv.rows[0].id, token: tinv.rows[0].token },
  sharedKakao,
  invite: inv.rows[0].token,
  students,
  studentB,
  stamp
};

writeFileSync(path.join(here, '.sessions.json'), JSON.stringify(sessions, null, 2));
console.log('e2e 데이터 준비 완료:', teacherName, '/', parentName);
await pool.end();
