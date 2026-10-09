jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import { editPersonPhotos, excludeBlock, personPhotosToast } from '../personPhotos';

const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

beforeEach(() => jest.clearAllMocks());

describe('editPersonPhotos — 얼굴 사진 빼기 · 다시 넣기 요청', () => {
  it('앨범 화면 · 전체 사진의 주소로 고른 사진 id 를 보내고, 바뀐 key 와 처리한 수를 돌려준다', async () => {
    fetchWithAuth.mockReturnValue(respond({ removed: 2, key: 'p12' }));

    await expect(editPersonPhotos('/api/events/31/album', 'p11', 'exclude', [4, 5])).resolves.toEqual({ ok: true, key: 'p12', count: 2 });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album/people/p11/exclude', { method: 'POST', body: JSON.stringify({ mediaIds: [4, 5] }) });

    fetchWithAuth.mockReturnValue(respond({ restored: 1, key: 'p11' }));
    await expect(editPersonPhotos('/api/albums', 'p11', 'restore', [9])).resolves.toEqual({ ok: true, key: 'p11', count: 1 });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/albums/people/p11/restore', expect.anything());
  });

  it('거절이면 서버의 안내 — 그 사이 묶음이 바뀐 것(person_changed · personMissing)이면 changed', async () => {
    fetchWithAuth.mockReturnValue(respond({ error: '바뀌었어요', reason: 'person_changed' }, 409));
    await expect(editPersonPhotos('/api/albums', 'p11', 'exclude', [4])).resolves.toEqual({ ok: false, message: '바뀌었어요', changed: true });

    fetchWithAuth.mockReturnValue(respond({ error: '없어요', personMissing: true }, 404));
    await expect(editPersonPhotos('/api/albums', 'p11', 'exclude', [4])).resolves.toMatchObject({ changed: true });

    fetchWithAuth.mockReturnValue(respond({ error: '다 뺄 수는 없어요', reason: 'all_photos' }, 409));
    await expect(editPersonPhotos('/api/albums', 'p11', 'exclude', [4])).resolves.toEqual({ ok: false, message: '다 뺄 수는 없어요', changed: false });
  });

  it('네트워크가 끊기면 다시 해 달라고', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchWithAuth.mockRejectedValue(new Error('offline'));
    await expect(editPersonPhotos('/api/albums', 'p 1', 'exclude', [4])).resolves.toMatchObject({ ok: false, changed: false });
    expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/albums/people/p%201/exclude');
  });
});

describe('excludeBlock · personPhotosToast', () => {
  it('고른 게 없거나 그 얼굴의 사진을 다 고르면 빼기를 막는다', () => {
    expect(excludeBlock(0, 3)).toBe('빼려는 사진을 골라 주세요');
    expect(excludeBlock(3, 3)).toBe('이 얼굴의 사진을 모두 뺄 수는 없어요');
    expect(excludeBlock(2, 3)).toBe('');
  });

  it('알림 문구', () => {
    expect(personPhotosToast('exclude', 2)).toBe('2장을 이 얼굴에서 뺐어요 · 사진은 그대로 있어요');
    expect(personPhotosToast('restore', 1)).toBe('1장을 이 얼굴에 다시 넣었어요');
  });
});
