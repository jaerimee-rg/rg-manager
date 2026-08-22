import pool from '../database.js';

// 카카오 알림을 보내는 이벤트 목록. 여기에 없는 값은 설정 API 에서 거부한다.
export const NOTIFICATION_EVENTS = [
  {
    eventType: 'ATTENDANCE',
    label: '출석 체크 알림',
    description: '출석 체크를 저장할 때 담당 선생님에게 출석 현황을 보냅니다.'
  },
  {
    eventType: 'FAQ_INQUIRY',
    label: '새 문의 알림',
    description: '학부모가 채팅으로 질문을 남기면 채널 주인에게 알립니다.'
  },
  {
    eventType: 'CUSTOM',
    label: '관리자 직접 발송',
    description: '이 화면에서 관리자가 직접 보내는 메시지입니다.'
  }
];

export const isKnownEvent = (eventType) =>
  NOTIFICATION_EVENTS.some((e) => e.eventType === eventType);

class NotificationSetting {
  // 설정 행이 없는 이벤트는 "켜짐"으로 본다 (새 이벤트를 추가해도 알림이 끊기지 않도록).
  static async getAll() {
    const result = await pool.query(
      'SELECT "eventType", enabled, "updatedAt", "updatedBy" FROM notification_settings'
    );
    const saved = new Map(result.rows.map((r) => [r.eventType, r]));

    return NOTIFICATION_EVENTS.map((event) => {
      const row = saved.get(event.eventType);
      return {
        ...event,
        enabled: row ? row.enabled !== false : true,
        updatedAt: row ? row.updatedAt : null
      };
    });
  }

  static async isEnabled(eventType) {
    const result = await pool.query(
      'SELECT enabled FROM notification_settings WHERE "eventType" = $1',
      [eventType]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].enabled !== false;
  }

  static async setEnabled(eventType, enabled, updatedBy = null) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO notification_settings ("eventType", enabled, "updatedAt", "updatedBy")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("eventType")
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     "updatedAt" = EXCLUDED."updatedAt",
                     "updatedBy" = EXCLUDED."updatedBy"
       RETURNING *`,
      [eventType, enabled !== false, now, updatedBy]
    );
    return result.rows[0];
  }
}

export default NotificationSetting;
