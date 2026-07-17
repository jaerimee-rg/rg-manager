import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import studentRoutes from './routes/students.js';
import classRoutes from './routes/classes.js';
import attendanceRoutes from './routes/attendance.js';
import authRoutes from './routes/auth.js';
import logRoutes from './routes/logs.js';
import competitionRoutes from './routes/competitions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// 프록시(Vercel/Render) 뒤에서 클라이언트 IP·프로토콜을 올바르게 인식
app.set('trust proxy', 1);

// 보안 헤더
app.use(helmet({
  contentSecurityPolicy: false, // React SPA와 호환
  crossOriginEmbedderPolicy: false
}));

// Serve static files from React build (CORS 체크 전에 정적 파일 서빙)
app.use(express.static(path.join(__dirname, '../client/dist')));

// CORS 설정 (API 요청에만 적용)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // 같은 서버 요청(origin 없음) 또는 허용 목록 확인
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // 허용되지 않은 origin: CORS 헤더를 설정하지 않음 (에러 대신)
      // same-origin 요청은 CORS 헤더 없이도 정상 동작
      callback(null, false);
    }
  },
  credentials: true
}));

// 레이트 리미팅 - 인증 엔드포인트
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20,
  message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 레이트 리미팅 - 일반 API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false
});

// HTTPS 리다이렉션 (프로덕션)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      const host = process.env.APP_HOST || req.header('host');
      res.redirect(`https://${host}${req.url}`);
    } else {
      next();
    }
  });
}

app.use(express.json({ limit: '10mb' }));

// API routes
app.get('/api', (req, res) => {
  res.json({ message: '리듬체조 출석 관리 API' });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/kakao', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/competitions', competitionRoutes);

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Vercel 서버리스 환경에서는 listen 대신 앱을 export하여 함수로 실행
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  });
}

export default app;
