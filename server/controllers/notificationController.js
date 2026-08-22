import NotificationSetting, { isKnownEvent } from '../models/NotificationSetting.js';
import KakaoMessageLog from '../models/KakaoMessageLog.js';

const requireAdmin = (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '권한이 없습니다.' });
    return false;
  }
  return true;
};

/* ─────────── 이벤트별 알림 on/off ─────────── */

export const getNotificationSettings = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const settings = await NotificationSetting.getAll();
    res.json(settings);
  } catch (error) {
    console.error('알림 설정 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export const updateNotificationSetting = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { eventType } = req.params;
    const { enabled } = req.body;

    if (!isKnownEvent(eventType)) {
      return res.status(400).json({ error: '알 수 없는 알림 이벤트입니다.' });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    await NotificationSetting.setEnabled(eventType, enabled, req.user.id);

    // 목록 전체를 돌려줘 화면이 항상 최신 상태를 그리게 한다.
    const settings = await NotificationSetting.getAll();
    res.json(settings);
  } catch (error) {
    console.error('알림 설정 변경 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/* ─────────── 발송 이력 ─────────── */

export const getNotificationLogs = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { eventType } = req.query;

    const [logs, total] = await Promise.all([
      KakaoMessageLog.getAll(limit, offset, eventType),
      KakaoMessageLog.getCount(eventType)
    ]);

    res.json({ logs, total });
  } catch (error) {
    console.error('알림 이력 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
