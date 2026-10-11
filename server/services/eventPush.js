import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import EventMedia from '../models/EventMedia.js';
import { APP_URL } from '../utils/appUrl.js';
import { pushConfig, eventPushMessage, photoFolderPushMessage } from '../utils/webPush.js';

// 푸시 서비스 한 곳이 느려도 선생님의 저장이 오래 묶이지 않게 하는 상한
export const SEND_TIMEOUT_MS = 5000;
// 꺼져 있던 휴대폰은 켜질 때 받는다 — 사흘이 지난 일정 알림은 버린다
export const PUSH_TTL_SECONDS = 3 * 24 * 60 * 60;

// 푸시 서비스가 "이 구독은 이제 없다" 고 답하는 코드 — 알림을 끄거나 앱·브라우저 데이터를 지운 기기
const GONE = new Set([404, 410]);

/**
 * 선생님(teacherId)과 연결된 학부모 중 브라우저 알림을 켠 기기마다 message 를 보낸다.
 * topic 이 같은 알림은 아직 전달 못 했으면 새 것으로 바뀐다(다시 보내도 쌓이지 않는다).
 * → { recipients(사람), sent(기기), failed, removed(없어진 구독을 지운 수) }
 */
const sendToTeacherParents = async (teacherId, message, { topic, config, what }) => {
  const subscriptions = await PushSubscription.listForTeacherParents(teacherId);
  if (!subscriptions.length) return { recipients: 0, sent: 0, failed: 0, removed: 0 };

  const payload = JSON.stringify(message);
  const options = {
    TTL: PUSH_TTL_SECONDS,
    urgency: 'normal',
    topic,
    timeout: SEND_TIMEOUT_MS,
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }
  };

  const results = await Promise.allSettled(subscriptions.map((s) => webpush.sendNotification(
    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
    payload,
    options
  )));

  const reached = new Set();
  const gone = [];
  let sent = 0;
  let failed = 0;

  results.forEach((result, index) => {
    const subscription = subscriptions[index];
    if (result.status === 'fulfilled') {
      sent += 1;
      reached.add(subscription.userId);
      return;
    }
    const status = result.reason?.statusCode;
    if (GONE.has(status)) {
      gone.push(subscription.id);
      return;
    }
    failed += 1;
    console.error(`${what} 알림 발송 실패:`, status || result.reason?.message || result.reason);
  });

  const removed = gone.length ? await PushSubscription.deleteByIds(gone).catch(() => 0) : 0;
  return { recipients: reached.size, sent, failed, removed };
};

/**
 * 선생님이 [학부모에게 알림 보내기] 를 체크하고 저장한 이벤트를, 그 선생님과 연결된 학부모 중
 * 브라우저 알림을 켠 기기로 보낸다.
 *
 * **응답을 보내기 전에 끝까지 기다려야 한다** — Vercel 은 응답 직후 인스턴스를 얼려서, 뒤로 미룬 발송은 나가지 않는다.
 * 어떤 실패도 던지지 않는다(이벤트 저장은 이미 끝났다). 결과는 선생님 화면의 안내 문구가 된다.
 */
export const notifyParentsOfEvent = async (event, { env = process.env } = {}) => {
  try {
    if (!event || event.type === 'folder') return { skipped: 'not_event' };
    // 비공개 이벤트는 학부모에게 404 다 — 알림을 눌러도 열리지 않는다
    if (event.isPublished === false) return { skipped: 'private' };

    const config = pushConfig(env);
    if (!config.configured) return { skipped: 'not_configured' };

    return await sendToTeacherParents(event.userId, eventPushMessage(event, { appUrl: APP_URL }), {
      topic: `event-${event.id}`, config, what: '이벤트'
    });
  } catch (error) {
    console.error('이벤트 알림 발송 오류:', error);
    return { skipped: 'error' };
  }
};

/**
 * 사진 전용 폴더(type='folder')를 **처음 공개**했을 때 학부모에게 "새 사진" 알림을 보낸다.
 * 폴더는 언제나 '모든 학부모' 공개라, 받는 사람은 이벤트 알림과 같다(폴더 주인 선생님과 연결된 학부모).
 * 처음 공개인지는 부르는 쪽(albumController.updateAlbum)이 정한다 — 비공개로 돌렸다가 다시 공개하면 부르지 않는다.
 *
 * notifyParentsOfEvent 처럼 응답 전에 끝까지 기다리고, 어떤 실패도 던지지 않는다(공개는 이미 저장됐다).
 */
export const notifyParentsOfPhotoFolder = async (event, { env = process.env } = {}) => {
  try {
    if (!event || event.type !== 'folder') return { skipped: 'not_folder' };
    // 폴더를 학부모가 열 수 있을 때만 — 눌러도 열리지 않는 알림은 보내지 않는다
    if (event.isPublished === false || event.albumPublished !== true) return { skipped: 'private' };

    const config = pushConfig(env);
    if (!config.configured) return { skipped: 'not_configured' };

    // 학부모에게 보이는 사진·영상(올라간 것 중 숨기지 않은 것)만 센다. 하나도 없으면 "새 사진" 이 아니다
    const { images = 0, videos = 0 } = await EventMedia.stats(event.id);
    if (!images && !videos) return { skipped: 'empty' };

    return await sendToTeacherParents(event.userId, photoFolderPushMessage(event, { images, videos }, { appUrl: APP_URL }), {
      topic: `album-${event.id}`, config, what: '사진'
    });
  } catch (error) {
    console.error('사진 알림 발송 오류:', error);
    return { skipped: 'error' };
  }
};

export default { notifyParentsOfEvent, notifyParentsOfPhotoFolder };
