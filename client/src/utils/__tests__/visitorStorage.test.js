import { getVisitorKey, clearVisitorKey } from '../visitorStorage';

const COOKIE_NAME = 'faqChatVisitorKey';

const readRawCookie = () => {
  const match = document.cookie.match(new RegExp(`(^| )${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
};

describe('visitorStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
    jest.restoreAllMocks();
  });

  it('처음이면 키를 만들어 localStorage 와 쿠키 양쪽에 저장한다', () => {
    const key = getVisitorKey();

    expect(key).toBeTruthy();
    expect(localStorage.getItem(COOKIE_NAME)).toBe(key);
    expect(readRawCookie()).toBe(key);
  });

  it('다시 부르면 같은 키를 돌려준다 (대화가 이어져야 한다)', () => {
    const first = getVisitorKey();
    const second = getVisitorKey();

    expect(second).toBe(first);
  });

  it('localStorage 가 비워져도 쿠키로 대화를 이어간다 (iOS 사이트 데이터 삭제)', () => {
    const original = getVisitorKey();

    localStorage.clear();

    const recovered = getVisitorKey();
    expect(recovered).toBe(original);
    // 지워진 쪽을 다시 채워 다음 방문에 더 잘 살아남게 한다
    expect(localStorage.getItem(COOKIE_NAME)).toBe(original);
  });

  it('쿠키가 지워져도 localStorage 로 대화를 이어간다', () => {
    const original = getVisitorKey();

    document.cookie = `${COOKIE_NAME}=;path=/;max-age=0`;
    expect(readRawCookie()).toBeNull();

    const recovered = getVisitorKey();
    expect(recovered).toBe(original);
    expect(readRawCookie()).toBe(original);
  });

  it('localStorage 를 못 쓰는 환경(시크릿 모드)에서도 키를 돌려준다', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const key = getVisitorKey();

    expect(key).toBeTruthy();
    // 쿠키에는 남아 다음 방문에 이어진다
    expect(readRawCookie()).toBe(key);
  });

  it('양쪽 모두 비어 있으면 서로 다른 키가 만들어진다', () => {
    const first = getVisitorKey();

    clearVisitorKey();
    const second = getVisitorKey();

    expect(second).not.toBe(first);
  });

  it('clearVisitorKey 는 양쪽을 모두 지운다', () => {
    getVisitorKey();

    clearVisitorKey();

    expect(localStorage.getItem(COOKIE_NAME)).toBeNull();
    expect(readRawCookie()).toBeNull();
  });
});
