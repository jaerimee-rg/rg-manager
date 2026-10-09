import { fetchWithAuth } from './api';

/**
 * 학부모 앨범 화면의 보기 기록 — 앨범을 열면 한 번, 사진·영상을 크게 볼 때마다(같은 것은 이 화면에 있는 동안 한 번).
 * 서버도 같은 사람이 잠깐 사이 다시 본 것은 세지 않는다(앨범 30분 · 사진 10분, server/models/AlbumView.js).
 * 기록은 기다리지 않는다 — 실패해도 사진 보기는 그대로다.
 */
export const createViewTracker = (eventId) => {
  const sent = new Set();
  const send = (key, body) => {
    if (sent.has(key)) return;
    sent.add(key);
    fetchWithAuth(`/api/parent/events/${eventId}/views`, { method: 'POST', body: JSON.stringify(body), keepalive: true })
      .catch(() => { sent.delete(key); });
  };
  return {
    album: () => send('album', {}),
    media: (mediaId) => { if (Number.isInteger(mediaId)) send(`m${mediaId}`, { mediaId }); }
  };
};

export default { createViewTracker };
