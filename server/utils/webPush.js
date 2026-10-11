// 학부모 브라우저 알림(Web Push)의 순수한 부분 — 설정 읽기, 구독 검증, 알림 문구.
// DB·네트워크는 services/eventPush.js 가 맡는다.

/**
 * VAPID 키 — 브라우저가 "이 서버가 보낸 알림" 임을 확인하는 키 한 쌍.
 * `npx web-push generate-vapid-keys` 로 만들어 환경변수에 넣는다. 없으면 알림 기능만 꺼진다.
 */
export const pushConfig = (env = process.env) => {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  return {
    configured: Boolean(publicKey && privateKey),
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    // 푸시 서비스(애플·구글)가 문제 생길 때 연락할 곳. mailto: 또는 https: 만 받는다.
    subject: String(env.VAPID_SUBJECT || '').trim() || 'https://rg-manager.vercel.app'
  };
};

/**
 * 구독 주소(endpoint)는 브라우저가 정하지만 요청 본문으로 들어오므로 그대로 믿으면 안 된다 —
 * 서버가 이 주소로 POST 를 보내기 때문에, 아무 주소나 받으면 서버를 다른 곳을 두드리는 데 쓸 수 있다.
 * 브라우저들이 실제로 쓰는 푸시 서비스만 받는다.
 */
const PUSH_HOSTS = [
  // 구글 — 크롬은 fcm.googleapis.com, 구글 상표가 없는 크로미움 빌드는 jmt17.google.com
  (host) => host.endsWith('.googleapis.com') || host.endsWith('.google.com'),
  (host) => host === 'web.push.apple.com' || host.endsWith('.push.apple.com'),   // 사파리·아이폰 홈 화면 앱
  (host) => host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com'), // 파이어폭스
  (host) => host.endsWith('.notify.windows.com')                 // 엣지(윈도우)
];

export const ENDPOINT_MAX = 2048;

export const isAllowedPushEndpoint = (value) => {
  if (typeof value !== 'string' || !value || value.length > ENDPOINT_MAX) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((matches) => matches(host));
};

// p256dh = 65바이트 공개키(base64url 87자), auth = 16바이트(22자). 패딩(=)이 붙어 오는 브라우저도 있다.
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const keyOk = (value, min, max) =>
  typeof value === 'string' && value.length >= min && value.length <= max && BASE64URL.test(value);

const hostOf = (value) => {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

/**
 * 브라우저의 PushSubscription.toJSON() → 저장할 값. 틀리면 { error }.
 * 주소가 목록에 없는 푸시 서비스면 그 호스트(`rejectedHost`)도 돌려준다 — 로그로 남겨 진짜 브라우저면 목록에 더한다.
 */
export const normalizeSubscription = (body) => {
  const endpoint = body?.endpoint;
  if (!isAllowedPushEndpoint(endpoint)) {
    return { error: '알림 주소가 올바르지 않아요.', rejectedHost: hostOf(endpoint) };
  }

  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!keyOk(p256dh, 80, 100) || !keyOk(auth, 16, 32)) return { error: '알림 키가 올바르지 않아요.' };

  return { value: { endpoint, p256dh, auth } };
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-10-12' → '10월 12일(월)' — 날짜 문자열 그대로 계산해 서버 시간대에 흔들리지 않는다. */
const dayLabel = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return String(ymd || '');
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${weekday})`;
};

/** 일정의 날짜(기간이면 ~ 종료일)와 시간 */
export const eventWhen = (event) => {
  let when = dayLabel(event.date);
  if (event.endDate && event.endDate !== event.date) when += ` ~ ${dayLabel(event.endDate)}`;
  if (event.startTime) when += ` ${event.startTime}`;
  return when;
};

/**
 * 이벤트 알림 한 통의 내용.
 * 모양은 Declarative Web Push(`web_push: 8030`) — 아이폰(iOS 18.4+)은 서비스 워커 없이도 이 JSON 만으로 알림을 띄우고,
 * 다른 브라우저에서는 우리 서비스 워커(client/public/sw.js)가 같은 `notification` 을 읽어 띄운다.
 * tag 가 이벤트마다 같아서 같은 이벤트를 다시 보내면 쌓이지 않고 바뀐다.
 */
export const eventPushMessage = (event, { appUrl }) => {
  const isClosure = event.type === 'closure';
  const title = `${isClosure ? '휴관 안내' : '새 일정'} · ${event.title}`;

  const parts = [eventWhen(event)];
  if (!isClosure && event.location) parts.push(event.location);
  let body = parts.join(' · ');
  if (!isClosure && event.registrationOpen !== false) body += '\n지금 신청할 수 있어요';

  return {
    web_push: 8030,
    notification: {
      title,
      body,
      navigate: `${appUrl}/parent/events/${event.id}`,
      tag: `event-${event.id}`,
      lang: 'ko',
      dir: 'ltr'
    }
  };
};

/** { images: 12, videos: 2 } → '사진 12장 · 영상 2개' (없는 쪽은 뺀다) */
export const mediaCountLabel = ({ images = 0, videos = 0 } = {}) => [
  images > 0 ? `사진 ${images}장` : null,
  videos > 0 ? `영상 ${videos}개` : null
].filter(Boolean).join(' · ');

/**
 * 사진 전용 폴더(type='folder')를 처음 공개할 때의 알림 한 통. 모양은 eventPushMessage 와 같다.
 * 누르면 학부모 앱의 그 폴더(사진 탭의 앨범 화면)가 열린다. tag 는 이벤트 알림과 겹치지 않게 album-<id>.
 */
export const photoFolderPushMessage = (event, counts, { appUrl }) => {
  const parts = [dayLabel(event.date)];
  const what = mediaCountLabel(counts);
  if (what) parts.push(what);

  return {
    web_push: 8030,
    notification: {
      title: `새 사진 · ${event.title}`,
      body: `${parts.join(' · ')}\n사진 탭에서 볼 수 있어요`,
      navigate: `${appUrl}/parent/photos/${event.id}`,
      tag: `album-${event.id}`,
      lang: 'ko',
      dir: 'ltr'
    }
  };
};

export default {
  pushConfig, isAllowedPushEndpoint, normalizeSubscription, eventWhen, eventPushMessage, mediaCountLabel, photoFolderPushMessage
};
