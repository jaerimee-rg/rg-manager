import './loadEnv.js';
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
import faqRoutes from './routes/faqs.js';
import chatRoutes from './routes/chat.js';
import {
  RATE_LIMIT_WINDOW_MS,
  PUBLIC_CHAT_READ_MAX,
  PUBLIC_CHAT_WRITE_MAX,
  visitorKeyGenerator
} from './utils/rateLimits.js';
import notificationRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// 프록시(Vercel) 뒤에서 클라이언트 IP·프로토콜을 올바르게 인식
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
  // 공개 채팅은 아래 전용 한도를 쓴다. 여기서 또 세면 더 낮은 쪽(200, IP 기준)이
  // 실제 상한이 되어 학부모 여러 명이 한 칸을 나눠 쓰게 된다.
  skip: (req) => req.originalUrl.startsWith('/api/chat/public'),
  standardHeaders: true,
  legacyHeaders: false
});

// 레이트 리미팅 - 공개 채팅(비로그인). 설정 근거는 utils/rateLimits.js 참고.
// 폴링(12초 주기 → 15분에 약 75회)에 여유를 둔 값
const publicChatReadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: PUBLIC_CHAT_READ_MAX,
  message: { error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' },
  keyGenerator: visitorKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

// 질문 전송만 엄격하게 (Gemini 호출 비용이 드는 경로)
const publicChatWriteLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: PUBLIC_CHAT_WRITE_MAX,
  message: { error: '질문을 너무 자주 보내셨어요. 잠시 후 다시 시도해주세요.' },
  keyGenerator: visitorKeyGenerator,
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

// 쓰기 경로를 먼저 걸고, 나머지 공개 채팅 요청은 읽기 한도로 처리한다.
app.post('/api/chat/public/:publicId/messages', publicChatWriteLimiter);
app.use('/api/chat/public', publicChatReadLimiter);
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
app.use('/api/faqs', faqRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

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
