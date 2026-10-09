jest.mock('../api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../api';
import { createViewTracker } from '../albumViews';

describe('createViewTracker — 학부모 앨범 화면의 본 기록', () => {
  beforeEach(() => { fetchWithAuth.mockReset(); fetchWithAuth.mockResolvedValue({ ok: true }); });

  it('앨범은 한 번, 사진은 사진마다 한 번 — 기다리지 않게 keepalive 로', () => {
    const views = createViewTracker(3);
    views.album();
    views.album();
    views.media(41);
    views.media(41);
    views.media(42);

    expect(fetchWithAuth.mock.calls).toEqual([
      ['/api/parent/events/3/views', { method: 'POST', body: '{}', keepalive: true }],
      ['/api/parent/events/3/views', { method: 'POST', body: '{"mediaId":41}', keepalive: true }],
      ['/api/parent/events/3/views', { method: 'POST', body: '{"mediaId":42}', keepalive: true }]
    ]);
  });

  it('숫자가 아닌 id 는 보내지 않는다', () => {
    createViewTracker(3).media('41');
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('보내지 못했으면 다음에 다시 보낸다 — 화면에는 아무 일도 없다', async () => {
    fetchWithAuth.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const views = createViewTracker(3);
    views.media(41);
    await Promise.resolve();
    await Promise.resolve();
    views.media(41);
    expect(fetchWithAuth).toHaveBeenCalledTimes(2);
  });
});
