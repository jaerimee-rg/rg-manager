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

const sessions = {
  teacher: { token: sign(teacher), user: { id: teacher.id, username: teacher.username, role: 'user' } },
  parent: { token: sign(parent), user: { id: parent.id, username: parent.username, role: 'parent' } },
  invite: inv.rows[0].token,
  students,
  stamp
};

writeFileSync(path.join(here, '.sessions.json'), JSON.stringify(sessions, null, 2));
console.log('e2e 데이터 준비 완료:', teacherName, '/', parentName);
await pool.end();
