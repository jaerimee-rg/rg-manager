import { isIos, isStandalone } from './pushNotifications';

/**
 * 학부모 — 홈 화면에 추가 안내 (docs/home-screen-prompt).
 *
 * 웹은 "홈 화면에 추가해 뒀는지" 를 직접 물어볼 수 없어서 세 가지 신호를 합친다.
 * ① 지금 홈 화면 아이콘으로 열렸다(standalone) ② 브라우저가 appinstalled 를 알려 줬다
 * ③ 이 기기에서 홈 화면 아이콘으로 열린 적이 있다 — ②·③ 은 INSTALLED_KEY 하나로 남긴다.
 * 기록은 기기(브라우저) 단위다 — 계정에 묶으면 아빠 폰의 "다시 보지 않기" 가 엄마 폰까지 막는다.
 */

export const HIDDEN_KEY = 'homeScreenPrompt.hidden';
export const INSTALLED_KEY = 'homeScreenPrompt.installed';
export const SHOWN_KEY = 'homeScreenPrompt.shown';

/** 첫 화면을 먼저 보여 주고, 그 사이에 설치 이벤트(beforeinstallprompt)가 올 시간도 준다 */
export const PROMPT_DELAY_MS = 1200;

/**
 * 이 브라우저에서 홈 화면에 추가를 어떻게 안내할지.
 * - 'installed' 홈 화면 아이콘으로 연 앱 — 안내하지 않는다
 * - 'kakaotalk' 카카오톡 안의 브라우저 — 추가가 안 된다. 바깥 브라우저로 열게 한다
 * - 'in-app'    그 밖의 앱 안 브라우저(네이버 · 인스타그램 …) — 추가도, 바깥으로 여는 표준 방법도 없다
 * - 'ios'       아이폰 · 아이패드 — 공유 → 홈 화면에 추가 (코드로 설치 창을 띄울 수 없다)
 * - 'android'   안드로이드 브라우저 — 설치 창 버튼, 안 되면 메뉴 안내
 * - 'other'     PC 등 — 안내하지 않는다
 */
export const homeScreenEnvironment = (nav = globalThis.navigator, win = globalThis.window) => {
  const ua = String(nav?.userAgent || '');
  if (isStandalone(nav, win)) return 'installed';
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  // 안드로이드 웹뷰는 UA 에 "; wv)" 를 단다
  if (/Android/i.test(ua)) return /;\s*wv\)/.test(ua) ? 'in-app' : 'android';
  // iOS 의 사파리 · 크롬 · 파이어폭스는 UA 끝에 Safari/ 가 붙고, 앱 안 브라우저(WKWebView)는 안 붙는다
  if (isIos(nav)) return /Safari\//.test(ua) ? 'ios' : 'in-app';
  return 'other';
};

const OFFERED = new Set(['kakaotalk', 'ios', 'android']);

// 사파리 개인정보 보호 모드처럼 저장소가 막혀 있어도 앱은 깨지지 않아야 한다 —
// 그때는 기록을 못 남기니 그 탭에서 한 번 보여 주는 정도로 끝난다.
const storage = (name) => {
  try {
    return globalThis[name] || null;
  } catch {
    return null;
  }
};
const readFlag = (name, key) => {
  try {
    return storage(name)?.getItem(key) === '1';
  } catch {
    return false;
  }
};
const writeFlag = (name, key) => {
  try {
    storage(name)?.setItem(key, '1');
  } catch {
    // 기록하지 못해도 화면은 그대로 동작한다
  }
};

export const isHomeScreenHidden = () => readFlag('localStorage', HIDDEN_KEY);
/** 다시 보지 않기 */
export const hideHomeScreenPrompt = () => writeFlag('localStorage', HIDDEN_KEY);
export const isMarkedInstalled = () => readFlag('localStorage', INSTALLED_KEY);
export const markInstalled = () => writeFlag('localStorage', INSTALLED_KEY);
export const wasShownThisSession = () => readFlag('sessionStorage', SHOWN_KEY);
/** 이번 탭에서는 보여 줬다 — 닫고 나서 화면을 옮기거나 새로고침해도 다시 뜨지 않는다 */
export const markShownThisSession = () => writeFlag('sessionStorage', SHOWN_KEY);

/**
 * 다른 창(사진 뷰어 · 시트 · 메뉴 …)이 떠 있는지. 그 위에 겹쳐 띄우면 뷰어 뒤에 숨거나,
 * 닫는 순서에 따라 Modal 의 스크롤 잠금이 풀리지 않을 수 있어 그동안은 기다린다.
 */
export const isAnotherOverlayOpen = (doc = globalThis.document) => Boolean(doc?.querySelector?.('[role="dialog"]'));

/** 지금 이 기기에 안내 팝업을 띄울지 */
export const shouldOfferHomeScreen = ({ env, impersonating = false } = {}) =>
  OFFERED.has(env)
  && !impersonating
  && !isHomeScreenHidden()
  && !isMarkedInstalled()
  && !wasShownThisSession();

/* ------------------------------------------------------------------ *
 * 설치 창 (beforeinstallprompt) — 안드로이드 크롬 · 삼성 인터넷 · 엣지
 * 페이지가 열리고 한 번만 오므로 React 가 뜨기 전에 받아 둔다(index.jsx).
 * ------------------------------------------------------------------ */

let deferredPrompt = null;
const subscribers = new Set();
const notify = () => subscribers.forEach((fn) => fn(deferredPrompt));

export const getInstallPrompt = () => deferredPrompt;

/** 설치 창을 띄울 수 있게 되거나 없어질 때 알려 준다. 해지 함수를 돌려준다 */
export const subscribeInstallPrompt = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

/** 보관한 설치 이벤트를 버린다 */
export const forgetInstallPrompt = () => {
  deferredPrompt = null;
  notify();
};

/**
 * 설치 이벤트를 받아 둘 리스너를 단다. 해지 함수를 돌려준다.
 * shouldDefer() 가 참일 때만(로그인한 학부모) 크롬의 기본 설치 안내줄을 막는다 —
 * 학부모는 우리 팝업이 대신하고, 선생님은 크롬 기본 안내를 그대로 본다.
 */
export const listenForInstallPrompt = ({ win = globalThis.window, shouldDefer = () => true } = {}) => {
  if (!win?.addEventListener) return () => {};

  // 홈 화면 아이콘으로 열렸으면 기록해 둔다 — 안드로이드는 크롬 탭과 저장소를 같이 써서
  // 나중에 크롬 탭으로 들어와도 "이미 추가했다" 는 걸 안다
  if (isStandalone(win.navigator, win)) markInstalled();

  const onPrompt = (event) => {
    let defer = false;
    try {
      defer = Boolean(shouldDefer());
    } catch {
      defer = false;
    }
    if (defer) event.preventDefault();
    deferredPrompt = event;
    notify();
  };
  const onInstalled = () => {
    markInstalled();
    forgetInstallPrompt();
  };

  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
  };
};

/**
 * 브라우저의 설치 창을 띄운다. 버튼을 누른 그 자리에서 불러야 한다.
 * → 'accepted' | 'dismissed' | 'unavailable'(보관한 이벤트가 없거나 브라우저가 거절)
 * 이벤트 하나로 한 번만 띄울 수 있어서, 부르면 보관한 이벤트는 버린다.
 */
export const promptInstall = async () => {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  deferredPrompt = null;

  try {
    await event.prompt();
    const choice = await event.userChoice;
    const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    if (outcome === 'accepted') markInstalled();
    return outcome;
  } catch {
    return 'unavailable';
  } finally {
    notify();
  }
};
