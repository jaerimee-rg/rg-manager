import { fetchWithAuth } from '../../utils/api';

/**
 * 얼굴 목록에서 고른 여러 사람을 한 번에 뺀다 — 선생님 앨범 화면과 전체 사진이 같이 쓴다(FacePeoplePicker).
 * base = 앨범 화면 `/api/events/<id>/album`, 전체 사진 `/api/albums`. keys = 고른 얼굴의 key.
 * 화면이 본 사진 수를 함께 보내 서버가 "같은 사람" 인지 확인한다 — 그 사이 묶음이 바뀌었거나 하나라도 뺄 수 없으면
 * 아무것도 지우지 않는다(server services/albumPeople.js removePeople). 사진은 지우지 않는다 — 얼굴과 그 얼굴로 붙은 자동 태그만.
 * → { ok: true, count } | { ok: false, message, changed } — changed 면 그 사이 얼굴 목록이 바뀐 것이라 화면이 목록을 다시 읽는다
 */
export const removePeople = async (base, people, keys) => {
  const seen = new Map(people.map((one) => [one.key, one.photoCount]));
  let response;
  try {
    response = await fetchWithAuth(`${base}/people/remove`, {
      method: 'POST',
      body: JSON.stringify({ people: keys.map((key) => ({ key, photoCount: seen.get(key) })) })
    });
  } catch (error) {
    console.error('여러 얼굴 빼기 실패:', error);
    return { ok: false, message: '얼굴을 빼지 못했어요. 잠시 뒤 다시 해 주세요.', changed: false };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const changed = Boolean(payload.personMissing) || payload.reason === 'person_changed';
    return {
      ok: false,
      message: changed ? '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.' : (payload.error || '얼굴을 빼지 못했어요.'),
      changed
    };
  }
  return { ok: true, count: payload.removedPeople ?? keys.length };
};

export default { removePeople };
