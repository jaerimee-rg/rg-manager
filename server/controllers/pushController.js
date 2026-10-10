import PushSubscription from '../models/PushSubscription.js';
import { pushConfig, normalizeSubscription } from '../utils/webPush.js';

/* ─────────── 학부모 브라우저 알림 (내 정보 › 새 일정 알림) ─────────── */

/** 공개키만 내려준다 — 브라우저가 구독할 때 쓴다. 키가 없으면 화면이 알림 카드를 그리지 않는다. */
export const getPushConfig = (req, res) => {
  const { configured, publicKey } = pushConfig();
  res.json({ configured, publicKey });
};

export const saveSubscription = async (req, res) => {
  try {
    if (!pushConfig().configured) {
      return res.status(503).json({ error: '알림 기능이 아직 준비되지 않았어요.' });
    }

    const parsed = normalizeSubscription(req.body);
    if (parsed.error) {
      if (parsed.rejectedHost) console.warn('알림 구독 거절 — 목록에 없는 푸시 서비스:', parsed.rejectedHost);
      return res.status(400).json({ error: parsed.error });
    }

    await PushSubscription.upsert({ userId: req.user.id, ...parsed.value });
    res.json({ subscribed: true });
  } catch (error) {
    console.error('알림 구독 저장 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const deleteSubscription = async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: '알림 주소가 올바르지 않아요.' });
    }

    const removed = await PushSubscription.deleteOwned(req.user.id, endpoint);
    res.json({ removed });
  } catch (error) {
    console.error('알림 구독 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getPushConfig, saveSubscription, deleteSubscription };
