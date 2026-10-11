jest.mock('../api', () => ({ fetchWithAuth: jest.fn() }));

import {
  homeScreenEnvironment, shouldOfferHomeScreen, hideHomeScreenPrompt, isHomeScreenHidden,
  markInstalled, isMarkedInstalled, markShownThisSession, wasShownThisSession,
  listenForInstallPrompt, getInstallPrompt, subscribeInstallPrompt, forgetInstallPrompt, promptInstall,
  HIDDEN_KEY, INSTALLED_KEY, SHOWN_KEY
} from '../homeScreen';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  samsungInternet: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  androidNaver: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.0)',
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 KAKAOTALK 10.9.0',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.9.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
  iphoneNaver: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.8.0)',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  desktopChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
};

const navWith = (userAgent, extra = {}) => ({ userAgent, maxTouchPoints: 0, ...extra });
const winWith = (standalone = false) => ({ matchMedia: () => ({ matches: standalone }) });

/** 크롬이 주는 BeforeInstallPromptEvent 흉내 */
const installEvent = (outcome = 'accepted') => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  forgetInstallPrompt();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('homeScreenEnvironment', () => {
  it('홈 화면 아이콘으로 연 앱은 이미 추가한 것이다 (안드로이드 display-mode · 아이폰 navigator.standalone)', () => {
    expect(homeScreenEnvironment(navWith(UA.androidChrome), winWith(true))).toBe('installed');
    expect(homeScreenEnvironment(navWith(UA.iphoneSafari, { standalone: true }), winWith())).toBe('installed');
  });

  it('카카오톡 안의 브라우저는 안드로이드 · 아이폰 모두 kakaotalk', () => {
    expect(homeScreenEnvironment(navWith(UA.kakaoAndroid), winWith())).toBe('kakaotalk');
    expect(homeScreenEnvironment(navWith(UA.kakaoIos), winWith())).toBe('kakaotalk');
  });

  it('안드로이드 크롬 · 삼성 인터넷은 android', () => {
    expect(homeScreenEnvironment(navWith(UA.androidChrome), winWith())).toBe('android');
    expect(homeScreenEnvironment(navWith(UA.samsungInternet), winWith())).toBe('android');
  });

  it('그 밖의 앱 안 브라우저(안드로이드 웹뷰 · Safari/ 가 없는 iOS 앱)는 안내할 방법이 없다', () => {
    expect(homeScreenEnvironment(navWith(UA.androidNaver), winWith())).toBe('in-app');
    expect(homeScreenEnvironment(navWith(UA.iphoneNaver), winWith())).toBe('in-app');
  });

  it('아이폰 사파리 · iOS 크롬 · 맥으로 소개하는 아이패드는 ios', () => {
    expect(homeScreenEnvironment(navWith(UA.iphoneSafari), winWith())).toBe('ios');
    expect(homeScreenEnvironment(navWith(UA.iphoneChrome), winWith())).toBe('ios');
    expect(homeScreenEnvironment(navWith(UA.ipadSafari, { maxTouchPoints: 5 }), winWith())).toBe('ios');
  });

  it('PC 는 other — 터치 없는 맥도 아이패드가 아니다', () => {
    expect(homeScreenEnvironment(navWith(UA.desktopChrome), winWith())).toBe('other');
    expect(homeScreenEnvironment(navWith(UA.ipadSafari), winWith())).toBe('other');
  });

  it('navigator 를 모르는 환경에서도 던지지 않는다', () => {
    expect(homeScreenEnvironment(undefined, {})).toBe('other');
  });
});

describe('shouldOfferHomeScreen', () => {
  it.each(['android', 'ios', 'kakaotalk'])('%s 는 아무 기록이 없으면 띄운다', (env) => {
    expect(shouldOfferHomeScreen({ env })).toBe(true);
  });

  it.each(['installed', 'in-app', 'other', undefined])('%s 는 띄우지 않는다', (env) => {
    expect(shouldOfferHomeScreen({ env })).toBe(false);
  });

  it('다시 보지 않기를 누른 기기에는 띄우지 않는다', () => {
    hideHomeScreenPrompt();
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1');
    expect(isHomeScreenHidden()).toBe(true);
    expect(shouldOfferHomeScreen({ env: 'android' })).toBe(false);
  });

  it('설치한 기록이 있으면 띄우지 않는다', () => {
    markInstalled();
    expect(localStorage.getItem(INSTALLED_KEY)).toBe('1');
    expect(isMarkedInstalled()).toBe(true);
    expect(shouldOfferHomeScreen({ env: 'ios' })).toBe(false);
  });

  it('이번 탭에서 이미 보여 줬으면 띄우지 않는다 (탭 단위 — sessionStorage)', () => {
    markShownThisSession();
    expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
    expect(wasShownThisSession()).toBe(true);
    expect(localStorage.getItem(SHOWN_KEY)).toBeNull();
    expect(shouldOfferHomeScreen({ env: 'android' })).toBe(false);
  });

  it('관리자가 학부모 계정으로 들어와 본 화면에는 띄우지 않는다', () => {
    expect(shouldOfferHomeScreen({ env: 'android', impersonating: true })).toBe(false);
  });

  it('저장소가 막힌 브라우저에서도 던지지 않는다 — 기록이 없는 것으로 보고 띄운다', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });

    expect(() => hideHomeScreenPrompt()).not.toThrow();
    expect(() => markShownThisSession()).not.toThrow();
    expect(shouldOfferHomeScreen({ env: 'android' })).toBe(true);
  });
});

describe('listenForInstallPrompt', () => {
  it('설치 이벤트를 보관하고, 학부모면 크롬 기본 안내줄을 막고, 구독자에게 알린다', () => {
    const seen = jest.fn();
    const unsubscribe = subscribeInstallPrompt(seen);
    const stop = listenForInstallPrompt({ win: window, shouldDefer: () => true });

    const event = installEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(getInstallPrompt()).toBe(event);
    expect(seen).toHaveBeenLastCalledWith(event);

    stop();
    unsubscribe();
  });

  it('선생님(shouldDefer 거짓)은 크롬 기본 안내를 그대로 둔다', () => {
    const stop = listenForInstallPrompt({ win: window, shouldDefer: () => false });

    const event = installEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('shouldDefer 가 던져도 이벤트는 받는다', () => {
    const stop = listenForInstallPrompt({ win: window, shouldDefer: () => { throw new Error('bad user json'); } });

    const event = installEvent();
    window.dispatchEvent(event);

    expect(getInstallPrompt()).toBe(event);
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('appinstalled 가 오면 설치 기록을 남기고 보관한 이벤트를 버린다', () => {
    const stop = listenForInstallPrompt({ win: window });
    window.dispatchEvent(installEvent());

    window.dispatchEvent(new Event('appinstalled'));

    expect(isMarkedInstalled()).toBe(true);
    expect(getInstallPrompt()).toBeNull();
    stop();
  });

  it('홈 화면 아이콘으로 열린 페이지면 시작하면서 설치 기록을 남긴다', () => {
    const win = { navigator: { standalone: true }, matchMedia: () => ({ matches: false }), addEventListener: jest.fn(), removeEventListener: jest.fn() };
    listenForInstallPrompt({ win });
    expect(isMarkedInstalled()).toBe(true);
  });

  it('해지하면 더는 받지 않는다', () => {
    const stop = listenForInstallPrompt({ win: window });
    stop();

    window.dispatchEvent(installEvent());
    expect(getInstallPrompt()).toBeNull();
  });
});

describe('promptInstall', () => {
  it('보관한 이벤트가 없으면 unavailable', async () => {
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('설치를 수락하면 기록을 남기고, 이벤트는 한 번 쓰고 버린다', async () => {
    const stop = listenForInstallPrompt({ win: window });
    const event = installEvent('accepted');
    window.dispatchEvent(event);
    const seen = jest.fn();
    const unsubscribe = subscribeInstallPrompt(seen);

    await expect(promptInstall()).resolves.toBe('accepted');

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(isMarkedInstalled()).toBe(true);
    expect(getInstallPrompt()).toBeNull();
    expect(seen).toHaveBeenLastCalledWith(null);
    await expect(promptInstall()).resolves.toBe('unavailable');

    unsubscribe();
    stop();
  });

  it('설치 창을 닫으면 dismissed — 설치 기록은 남기지 않는다', async () => {
    const stop = listenForInstallPrompt({ win: window });
    window.dispatchEvent(installEvent('dismissed'));

    await expect(promptInstall()).resolves.toBe('dismissed');
    expect(isMarkedInstalled()).toBe(false);
    stop();
  });

  it('브라우저가 설치 창을 거절하면 unavailable', async () => {
    const stop = listenForInstallPrompt({ win: window });
    const event = installEvent();
    event.prompt.mockRejectedValue(new DOMException('already shown', 'InvalidStateError'));
    window.dispatchEvent(event);

    await expect(promptInstall()).resolves.toBe('unavailable');
    expect(getInstallPrompt()).toBeNull();
    stop();
  });
});
