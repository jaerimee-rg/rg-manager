import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 프로젝트 루트의 .env를 로드한다 (server/ 에서 실행되어도 동작).
// 파일이 없으면 조용히 무시되므로 Render/Vercel 환경변수와 충돌하지 않는다.
dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });
// server/.env 가 있으면 추가로 로드 (기존 값은 덮어쓰지 않음)
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
