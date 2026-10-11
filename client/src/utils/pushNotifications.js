import { fetchWithAuth } from './api';

/**
 * 새 일정 브라우저 알림(Web Push).
 * 학부모는 내 정보에서 이 기기의 알림을 켜고(구독), 선생님이 이벤트를 저장하며 [학부모에게 알림 보내기] 를
 * 체크하면 서버가 그 구독으로 보낸다. 알림을 띄우고 누르면 여는 일은 서비스 워커(public/sw.js)가 맡는다.
 */

export const SW_URL = '/sw.js';
export const PUSH_API = '/api/parent/push';

export const isIos = (nav) => {
  const ua = String(nav?.userAgent || '');
  // iPadOS 사파리는 맥으로 자신을 소개한다 — 터치가 되는 "맥" 은 아이패드다
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(nav?.maxTouchPoints) > 1);
};

export const isStandalone = (nav, win) =>
  nav?.standalone === true || Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches);

/**
 * 이 브라우저에서 알림을 켤 수 있는지, 안 되면 무엇을 안내할지.
 * - 'kakaotalk'   카카오톡 안의 브라우저 — 알림이 오지 않는다. 다른 브라우저로 열어야 한다
 * - 'supported'   켤 수 있다
 * - 'ios-install' 아이폰·아이패드 사파리 탭 — 홈 화면에 추가한 앱에서만 받을 수 있다
 * - 'ios-update'  홈 화면 앱인데도 안 된다 — iOS 16.4 이전
 * - 'unsupported' 그 밖의 브라우저
 */
export const pushEnvironment = (nav = globalThis.navigator, win = globalThis.window) => {
  if (/KAKAOTALK/i.test(String(nav?.userAgent || ''))) return 'kakaotalk';

  const supported = Boolean(nav && 'serviceWorker' in nav && win && 'PushManager' in win && 'Notification' in win);
  if (supported) return 'supported';

  if (isIos(nav)) return isStandalone(nav, win) ? 'ios-update' : 'ios-install';
  return 'unsupported';
};

/** VAPID 공개키(base64url) → 브라우저 subscribe() 가 받는 바이트 */
export const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

/** 카카오톡 안의 브라우저에서 지금 화면을 기본 브라우저로 연다 (카카오톡이 알아듣는 주소) */
export const openExternalUrl = (href) => `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;

export const loadPushConfig = async () => {
  const response = await fetchWithAuth(PUSH_API);
  if (!response.ok) return { configured: false, publicKey: null };
  return response.json();
};

export const registerServiceWorker = () => navigator.serviceWorker.register(SW_URL, { scope: '/' });

const saveSubscription = (subscription) =>
  fetchWithAuth(`${PUSH_API}/subscriptions`, { method: 'POST', body: JSON.stringify(subscription.toJSON()) });

/**
 * 이 기기에 켜진 알림이 있는지. 있으면 서버에도 다시 알려 둔다 —
 * 같은 기기에서 다른 학부모 계정으로 들어왔거나 서버가 구독을 잃었을 때 이 계정으로 맞춘다.
 */
export const currentSubscription = async (registration) => {
  const subscription = await registration.pushManager.getSubscription();
  if (subscription && Notification.permission === 'granted') {
    saveSubscription(subscription).catch(() => {});
  }
  return Notification.permission === 'granted' ? subscription : null;
};

/**
 * 알림 켜기. 버튼을 누른 바로 그 자리에서 불러야 한다 — 아이폰은 사용자가 누른 동작 안에서만 권한을 물을 수 있다.
 * → 'granted' | 'denied' | 'default'(물음을 닫음). 저장까지 실패하면 던진다.
 */
export const enablePush = async ({ registration, publicKey }) => {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const subscription = (await registration.pushManager.getSubscription())
    || (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));

  const response = await saveSubscription(subscription);
  if (!response.ok) {
    // 서버가 모르는 구독을 기기에만 남기면 "켜짐" 으로 보이는데 알림은 오지 않는다
    await subscription.unsubscribe().catch(() => {});
    throw new Error('subscription_not_saved');
  }
  return 'granted';
};

/** 알림 끄기 — 서버 구독을 먼저 지우고 기기 구독을 푼다 */
export const disablePush = async ({ registration }) => {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetchWithAuth(`${PUSH_API}/subscriptions`, {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  await subscription.unsubscribe();
};

/** 선생님이 [학부모에게 알림 보내기] 로 저장한 뒤 이벤트 목록에 잠깐 띄우는 결과 문구 */
export const notifyResultMessage = (notification) => {
  if (!notification) return '';
  if (notification.skipped === 'not_configured') return '알림 기능이 아직 준비되지 않아 학부모 알림은 보내지 못했어요';
  if (notification.skipped === 'private') return '비공개 이벤트라 학부모 알림은 보내지 않았어요';
  if (notification.skipped === 'empty') return '보이는 사진이 없어 학부모 알림은 보내지 않았어요';
  if (notification.skipped) return '학부모 알림을 보내지 못했어요';
  if (notification.recipients > 0) return `학부모 ${notification.recipients}명에게 알림을 보냈어요`;
  if (notification.failed > 0) return '학부모 알림을 보내지 못했어요 · 잠시 뒤 다시 해 주세요';
  return '알림을 켠 학부모가 아직 없어요 · 학부모가 내 정보에서 알림을 켜면 받을 수 있어요';
};
