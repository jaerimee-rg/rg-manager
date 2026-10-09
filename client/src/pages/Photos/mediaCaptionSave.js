import { fetchWithAuth } from '../../utils/api';

/**
 * 사진·영상 설명 저장 — PATCH /api/events/:eventId/media/:mediaId {caption}. 앨범 화면과 전체 사진 화면이 같이 쓴다.
 * 앱 안의 글이라 Google 연결이 끊겨도 된다. → 저장된 설명(지웠으면 null).
 * 실패하면 화면에 보여 줄 글로 Error 를 던진다 — 뷰어의 입력 창이 그 글을 보여 주고 열어 둔다.
 */
export const saveMediaCaption = async (eventId, mediaId, caption) => {
  let response;
  try {
    response = await fetchWithAuth(`/api/events/${eventId}/media/${mediaId}`, { method: 'PATCH', body: JSON.stringify({ caption }) });
  } catch (saveError) {
    console.error('사진 설명 저장 실패:', saveError);
    throw new Error('설명을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '설명을 저장하지 못했어요.');
  return payload.caption ?? null;
};

export default saveMediaCaption;
