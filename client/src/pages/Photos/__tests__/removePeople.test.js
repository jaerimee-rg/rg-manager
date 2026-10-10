jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import { removePeople } from '../removePeople';

const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const PEOPLE = [{ key: 'p11', photoCount: 3 }, { key: 'p42', photoCount: 1 }, { key: 'p57', photoCount: 2 }];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('removePeople — 여러 얼굴 한 번에 빼기 요청', () => {
  it('앨범 화면 · 전체 사진의 주소로 고른 얼굴마다 화면이 본 사진 수를 함께 보내고, 뺀 사람 수를 돌려준다', async () => {
    fetchWithAuth.mockReturnValue(respond({ removedPeople: 2, removedFaces: 3, photos: 3, removedTags: 0 }));

    await expect(removePeople('/api/events/31/album', PEOPLE, ['p42', 'p57'])).resolves.toEqual({ ok: true, count: 2 });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album/people/remove', {
      method: 'POST',
      body: JSON.stringify({ people: [{ key: 'p42', photoCount: 1 }, { key: 'p57', photoCount: 2 }] })
    });

    await removePeople('/api/albums', PEOPLE, ['p11']);
    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/albums/people/remove', expect.anything());
  });

  it('그 사이 묶음이 바뀌었으면(person_changed · personMissing) changed — 화면이 목록을 다시 읽는다', async () => {
    fetchWithAuth.mockReturnValue(respond({ error: '얼굴 목록이 바뀌었어요.', reason: 'person_changed' }, 409));
    await expect(removePeople('/api/albums', PEOPLE, ['p42'])).resolves.toEqual({
      ok: false, message: '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.', changed: true
    });

    fetchWithAuth.mockReturnValue(respond({ error: '없어요', personMissing: true }, 404));
    await expect(removePeople('/api/albums', PEOPLE, ['p42'])).resolves.toMatchObject({ ok: false, changed: true });
  });

  it('그 밖의 거절은 서버의 안내 그대로, 네트워크 오류는 다시 해 달라고', async () => {
    fetchWithAuth.mockReturnValue(respond({ error: '등록된 아이 얼굴은 목록에서 뺄 수 없어요.', reason: 'student_person' }, 409));
    await expect(removePeople('/api/albums', PEOPLE, ['p11'])).resolves.toEqual({
      ok: false, message: '등록된 아이 얼굴은 목록에서 뺄 수 없어요.', changed: false
    });

    fetchWithAuth.mockReturnValue(respond({}, 500));
    await expect(removePeople('/api/albums', PEOPLE, ['p11'])).resolves.toEqual({ ok: false, message: '얼굴을 빼지 못했어요.', changed: false });

    fetchWithAuth.mockRejectedValue(new Error('offline'));
    await expect(removePeople('/api/albums', PEOPLE, ['p11'])).resolves.toEqual({
      ok: false, message: '얼굴을 빼지 못했어요. 잠시 뒤 다시 해 주세요.', changed: false
    });
  });
});
