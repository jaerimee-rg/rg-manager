import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import HomeScreenPrompt from '../HomeScreenPrompt';
import {
  listenForInstallPrompt, forgetInstallPrompt, getInstallPrompt, HIDDEN_KEY, INSTALLED_KEY, SHOWN_KEY, PROMPT_DELAY_MS
} from '../../../utils/homeScreen';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.9.0',
  desktopChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
};

const originalUserAgent = window.navigator.userAgent;
const setUserAgent = (value) => {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
};

const installEvent = (outcome = 'accepted') => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
};

const renderPrompt = () => render(<HomeScreenPrompt />);
const waitForDelay = () => act(() => { jest.advanceTimersByTime(PROMPT_DELAY_MS); });
const dialog = () => screen.queryByTestId('home-screen-prompt');
// 제목 줄의 X 도 "닫기" 라서 아래 버튼 줄에서 찾는다
const footerClose = () => within(dialog().querySelector('.ui-overlay__footer')).getByRole('button', { name: '닫기' });

let stopListening;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  forgetInstallPrompt();
  setUserAgent(UA.androidChrome);
  stopListening = listenForInstallPrompt({ win: window, shouldDefer: () => true });
});

afterEach(() => {
  stopListening();
  jest.useRealTimers();
});

afterAll(() => {
  setUserAgent(originalUserAgent);
});

describe('HomeScreenPrompt', () => {
  it('첫 화면이 그려지고 잠시 뒤에 뜬다 — 이번 탭에서 보여 줬다고 기록한다', () => {
    renderPrompt();
    expect(dialog()).not.toBeInTheDocument();

    waitForDelay();

    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /홈 화면에 .* 추가하기/ })).toBeInTheDocument();
    expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
  });

  it('안드로이드에서 설치 이벤트가 없으면 메뉴로 추가하는 순서를 안내한다', () => {
    renderPrompt();
    waitForDelay();

    expect(dialog()).toHaveAttribute('data-env', 'android');
    expect(screen.getByText(/앱 설치/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홈 화면에 추가' })).not.toBeInTheDocument();
  });

  it('다시 보지 않기를 체크하고 닫으면 이 기기에서는 다시 띄우지 않는다', () => {
    const { unmount } = renderPrompt();
    waitForDelay();

    fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
    fireEvent.click(footerClose());

    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1');

    // 새 탭(새 세션)에서 앱을 다시 열어도 안 뜬다
    unmount();
    sessionStorage.clear();
    renderPrompt();
    waitForDelay();
    expect(dialog()).not.toBeInTheDocument();
  });

  it('체크하지 않고 닫으면 이번 탭에서만 안 뜨고, 다음에 앱을 열면 다시 뜬다', () => {
    const { unmount } = renderPrompt();
    waitForDelay();

    fireEvent.click(footerClose());
    expect(localStorage.getItem(HIDDEN_KEY)).toBeNull();

    // 같은 탭에서 화면을 옮기거나 새로고침해도 안 뜬다
    unmount();
    const again = renderPrompt();
    waitForDelay();
    expect(dialog()).not.toBeInTheDocument();

    // 탭을 닫고 앱을 새로 열면(새 세션) 다시 뜬다
    again.unmount();
    sessionStorage.clear();
    renderPrompt();
    waitForDelay();
    expect(dialog()).toBeInTheDocument();
  });

  it('제목 줄 X 로 닫아도 다시 보지 않기 체크를 지킨다', () => {
    renderPrompt();
    waitForDelay();

    fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
    const headerClose = dialog().querySelector('.ui-overlay__header button[aria-label="닫기"]');
    fireEvent.click(headerClose);

    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1');
  });

  it('Esc 로 닫아도 다시 보지 않기 체크를 지킨다', () => {
    renderPrompt();
    waitForDelay();

    fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1');
  });

  it('설치 이벤트가 있으면 [홈 화면에 추가] 로 설치 창을 열고, 수락하면 닫고 다시는 안 띄운다', async () => {
    const event = installEvent('accepted');
    window.dispatchEvent(event);
    renderPrompt();
    waitForDelay();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }));
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALLED_KEY)).toBe('1');
    expect(getInstallPrompt()).toBeNull();
  });

  it('설치 창을 그냥 닫으면 팝업도 닫는다 — 설치 기록은 없고, 체크했으면 다시 보지 않기는 지킨다', async () => {
    window.dispatchEvent(installEvent('dismissed'));
    renderPrompt();
    waitForDelay();

    fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '홈 화면에 추가' }));
    });

    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALLED_KEY)).toBeNull();
    expect(localStorage.getItem(HIDDEN_KEY)).toBe('1');
  });

  it('메뉴 안내로 떠 있는 사이에 설치 이벤트가 오면 그 자리에서 버튼이 생긴다', () => {
    renderPrompt();
    waitForDelay();
    expect(screen.queryByRole('button', { name: '홈 화면에 추가' })).not.toBeInTheDocument();

    act(() => { window.dispatchEvent(installEvent()); });

    expect(screen.getByRole('button', { name: '홈 화면에 추가' })).toBeInTheDocument();
  });

  it('아이폰은 공유 → 홈 화면에 추가 순서를 안내한다 (설치 버튼 없음)', () => {
    setUserAgent(UA.iphoneSafari);
    renderPrompt();
    waitForDelay();

    expect(dialog()).toHaveAttribute('data-env', 'ios');
    expect(screen.getByRole('img', { name: '공유' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '홈 화면에 추가' })).toBeInTheDocument();
    expect(screen.getByText(/새 일정 알림/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홈 화면에 추가' })).not.toBeInTheDocument();
  });

  it('카카오톡 안에서는 바깥 브라우저로 여는 링크를 준다', () => {
    setUserAgent(UA.kakaoIos);
    renderPrompt();
    waitForDelay();

    const link = screen.getByRole('link', { name: /브라우저로 열기/ });
    expect(link.getAttribute('href')).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`);
  });

  it('PC 에서는 띄우지 않는다', () => {
    setUserAgent(UA.desktopChrome);
    renderPrompt();
    waitForDelay();

    expect(dialog()).not.toBeInTheDocument();
    expect(sessionStorage.getItem(SHOWN_KEY)).toBeNull();
  });

  it('관리자가 학부모 계정으로 들어와 본 화면에서는 띄우지 않는다', () => {
    localStorage.setItem('impersonator', JSON.stringify({ id: 1, username: 'admin', token: 't', user: {} }));
    renderPrompt();
    waitForDelay();

    expect(dialog()).not.toBeInTheDocument();
  });

  it('기다리는 사이 다른 탭에서 다시 보지 않기를 눌렀으면 띄우지 않는다', () => {
    renderPrompt();
    localStorage.setItem(HIDDEN_KEY, '1');
    waitForDelay();

    expect(dialog()).not.toBeInTheDocument();
  });
});

