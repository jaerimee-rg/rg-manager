jest.mock('../visitorStorage', () => ({ getVisitorKey: () => 'visitor-1' }));

import { trackClick, trackViewOnce } from '../shopTracking';

const CLICK_URL = '/api/shop/public/pub123/products/12/click?visitorKey=visitor-1';

beforeEach(() => {
  sessionStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  navigator.sendBeacon = jest.fn(() => true);
});

afterEach(() => {
  delete navigator.sendBeacon;
});

describe('trackClick (FR-440)', () => {
  it('sendBeacon 이 받아 주면 그것으로 끝낸다 — 값은 쿼리스트링에만', () => {
    trackClick('pub123', 12);
    expect(navigator.sendBeacon).toHaveBeenCalledWith(CLICK_URL);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sendBeacon 이 false 면 fetch keepalive 로 한 번 더', () => {
    navigator.sendBeacon.mockReturnValue(false);
    trackClick('pub123', 12);
    expect(global.fetch).toHaveBeenCalledWith(CLICK_URL, { method: 'POST', keepalive: true });
  });

  it('sendBeacon 이 없어도 fetch 로 보낸다', () => {
    delete navigator.sendBeacon;
    trackClick('pub123', 12);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('기록이 실패해도 예외가 밖으로 나가지 않는다 (이동을 막지 않는다)', () => {
    navigator.sendBeacon.mockImplementation(() => { throw new Error('blocked'); });
    global.fetch.mockImplementation(() => { throw new Error('offline'); });
    expect(() => trackClick('pub123', 12)).not.toThrow();
  });
});

describe('trackViewOnce (FR-443)', () => {
  it('브라우저 세션당 한 번만 보낸다', () => {
    expect(trackViewOnce('pub123')).toBe(true);
    expect(trackViewOnce('pub123')).toBe(false);
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    expect(navigator.sendBeacon).toHaveBeenCalledWith('/api/shop/public/pub123/view?visitorKey=visitor-1');
  });

  it('상점이 다르면 따로 센다', () => {
    trackViewOnce('a');
    trackViewOnce('b');
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(2);
  });
});
