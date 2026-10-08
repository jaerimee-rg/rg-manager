import { fetchWithAuth } from './api';
import { FACE_ANALYZER_VERSION, detectFaces } from './faceClient';

/**
 * 앨범에서 얼굴을 (다시) 찾아야 하는 사진을 선생님 브라우저에서 한 바퀴 돈다.
 *
 * 대상은 서버가 정한다(models/EventMedia.js needsFaceAnalysisSql) — 아직 못 찾았거나, 예전 방식
 * (FACE_ANALYZER_VERSION 보다 낮은 버전)으로 찾은 사진. 몇 장씩 받아
 *   Drive 사진(긴 변 1920, largeUrl) → 얼굴 찾기 → POST .../media/:id/faces (저장 + 바로 매칭)
 * 을 반복한다. 못 읽은 사진은 저장하지 않으므로 서버 목록에 그대로 남는데, 받은 마지막 id 를
 * afterId 로 넘기기 때문에 이번 바퀴에서 같은 사진을 다시 받지는 않는다.
 *
 * onProgress({ done, total }) — 한 장 끝날 때마다
 * → { done, found, failed }  found = 얼굴을 찾은 사진, failed = 읽지 못했거나 저장하지 못한 사진
 */
export const reanalyzeAlbum = async (apiBase, { onProgress, batch = 5 } = {}) => {
  let afterId = 0;
  let total = null;
  const counts = { done: 0, found: 0, failed: 0 };

  for (;;) {
    const response = await fetchWithAuth(`${apiBase}/media/unanalyzed?batch=${batch}&afterId=${afterId}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '얼굴을 찾을 사진을 불러오지 못했어요.');

    const items = payload.items || [];
    if (total === null) total = payload.remaining || items.length;
    if (!items.length) break;

    for (const item of items) {
      afterId = item.id;
      const faces = await detectFaces(item.largeUrl);

      let saved = false;
      if (faces) {
        const result = await fetchWithAuth(`${apiBase}/media/${item.id}/faces`, {
          method: 'POST',
          body: JSON.stringify({ faces, analyzerVersion: FACE_ANALYZER_VERSION })
        }).catch(() => null);
        saved = Boolean(result?.ok);
      }

      counts.done += 1;
      if (!saved) counts.failed += 1;
      else if (faces.length) counts.found += 1;
      onProgress?.({ done: counts.done, total: Math.max(total, counts.done) });
    }
  }

  return counts;
};

export default { reanalyzeAlbum };
