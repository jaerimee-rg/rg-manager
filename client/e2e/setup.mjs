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

const sessions = {
  album: { eventId: albumEventId, lockedEventId, mediaIds, taggedCount: 2, totalCount: 4 },
  teacher: { token: sign(teacher), user: { id: teacher.id, username: teacher.username, role: 'user' } },
  parent: { token: sign(parent), user: { id: parent.id, username: parent.username, role: 'parent' } },
  invite: inv.rows[0].token,
  students,
  stamp
};

writeFileSync(path.join(here, '.sessions.json'), JSON.stringify(sessions, null, 2));
console.log('e2e 데이터 준비 완료:', teacherName, '/', parentName);
await pool.end();
