import { fetchWithAuth } from '../../utils/api';

/**
 * 얼굴 목록에서 고른 사람의 사진 빼기("이 얼굴 아님") · 다시 넣기 — 선생님 앨범 화면과 전체 사진이 같이 쓴다.
 * base = 앨범 화면 `/api/events/<id>/album`, 전체 사진 `/api/albums`. action = 'exclude' | 'restore'.
 * 사진은 지우지 않는다 — 그 사람의 얼굴 묶음에서만 빠지거나 다시 든다(server services/albumPeople.js).
 * → { ok: true, key, count } — key 는 다시 묶은 뒤 같은 사람의 key(가장 작은 얼굴이 빠지면 바뀐다)
 *   | { ok: false, message, changed } — changed 면 그 사이 얼굴 목록이 바뀐 것이라 화면이 목록을 다시 읽는다
 */
export const editPersonPhotos = async (base, key, action, mediaIds) => {
  let response;
  try {
    response = await fetchWithAuth(`${base}/people/${encodeURIComponent(key)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ mediaIds })
    });
  } catch (error) {
    console.error('얼굴 사진 빼기·되돌리기 실패:', error);
    return { ok: false, message: '처리하지 못했어요. 잠시 뒤 다시 해 주세요.', changed: false };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      message: payload.error || '처리하지 못했어요.',
      changed: Boolean(payload.personMissing) || payload.reason === 'person_changed'
    };
  }
  return { ok: true, key: payload.key ?? null, count: payload.removed ?? payload.restored ?? mediaIds.length };
};

/** 됐을 때 알림 */
export const personPhotosToast = (action, count) => (
  action === 'exclude'
    ? `${count}장을 이 얼굴에서 뺐어요 · 사진은 그대로 있어요`
    : `${count}장을 이 얼굴에 다시 넣었어요`
);

/**
 * [이 얼굴에서 빼기] 를 막을 이유 — 고른 게 없거나, 그 얼굴의 사진을 다 고르면(얼굴이 없어진다 — 그럴 땐 얼굴을 통째로 뺀다).
 * → '' | 안내 문구
 */
export const excludeBlock = (selectedCount, photoCount) => {
  if (!selectedCount) return '빼려는 사진을 골라 주세요';
  if (selectedCount >= photoCount) return '이 얼굴의 사진을 모두 뺄 수는 없어요';
  return '';
};

export default { editPersonPhotos, personPhotosToast, excludeBlock };
