import { ipKeyGenerator } from 'express-rate-limit';

// 공개 채팅(비로그인) 레이트 리밋 설정.
// server.js 에서 DB 연결 없이 가져다 쓰고, 테스트에서도 같은 값을 검증한다.

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// 학부모 화면은 관리자 답변을 받아보려고 주기적으로 메시지를 다시 읽는다.
// 읽기와 쓰기에 같은 한도를 걸면 질문을 하나도 보내지 않아도 폴링만으로 한도가
// 소진되어 채팅 자체가 막힌다. 그래서 비용이 드는 쓰기(AI 호출)만 엄격하게 잡는다.
export const PUBLIC_CHAT_READ_MAX = 300;
export const PUBLIC_CHAT_WRITE_MAX = 20;

// 공개 추천 상품(/shop/:publicId). 읽기는 페이지를 열 때 1번이라 넉넉하고,
// 방문·클릭 기록은 연타·봇 부풀림을 막을 만큼만 받는다 (docs/recommended-shop 02 §7).
export const PUBLIC_SHOP_READ_MAX = 300;
export const PUBLIC_SHOP_TRACK_MAX = 120;
// visitorKey 는 브라우저가 보내는 값이라 바꿔 가며 보내면 칸이 계속 새로 생긴다.
// 기록 경로에는 IP(서브넷) 기준 상한을 하나 더 건다 — 같은 와이파이의 학부모 여럿이 써도 넉넉한 값.
export const PUBLIC_SHOP_TRACK_IP_MAX = 600;
// 예약 요청은 선생님 목록에 사람 손으로 처리할 행이 쌓이므로 훨씬 엄격하게, IP(서브넷) 기준으로 센다.
// 같은 와이파이의 학부모 몇 명이 몇 개씩 예약해도 넉넉한 값.
export const PUBLIC_SHOP_RESERVE_IP_MAX = 20;

// 학부모 사진 보기 기록(POST /api/parent/events/:id/views) — 사진을 넘길 때마다 하나씩 와서 일반 API 한도(200, IP 기준)를
// 함께 쓰면 사진을 많이 넘겨 본 학부모, 그리고 같은 와이파이의 다른 학부모까지 일반 화면이 429 로 막힌다.
// 그래서 일반 한도에서 빼고 이 칸만 따로 센다 — 같은 와이파이에서 여럿이 앨범을 넘겨 봐도 넉넉한 값.
export const PHOTO_VIEW_IP_MAX = 2000;

/** 학부모 사진 보기 기록 요청인지 — 일반 API 한도에서 빼고 PHOTO_VIEW_IP_MAX 로 센다 */
export const isPhotoViewBeacon = (req) =>
  req?.method === 'POST' && /^\/api\/parent\/events\/\d+\/views\/?$/.test(String(req.originalUrl || '').split('?')[0]);

// 클라이언트 폴링 주기와 맞물린 값이라 함께 관리한다 (client/src/pages/PublicChat.jsx).
export const PUBLIC_CHAT_POLL_INTERVAL_MS = 12000;

const VISITOR_KEY_MAX = 100;

/**
 * IP 기준으로 세면 서버리스·프록시 환경이나 공유 와이파이에서 여러 학부모가
 * 한 칸을 나눠 쓰게 되어, 한 명의 폴링이 나머지를 모두 잠글 수 있다.
 * 브라우저마다 고유한 visitorKey 를 우선 쓰고, 없을 때만 IP 로 떨어진다.
 */
export const visitorKeyGenerator = (req) => {
  const raw = req.body?.visitorKey ?? req.query?.visitorKey;

  if (typeof raw === 'string' && raw.trim()) {
    return `visitor:${raw.trim().slice(0, VISITOR_KEY_MAX)}`;
  }

  // IPv6 는 그대로 쓰면 주소를 바꿔가며 우회할 수 있어 서브넷 단위로 정규화한다.
  return ipKeyGenerator(req.ip);
};
