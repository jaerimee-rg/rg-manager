import pool from '../database.js';

// 앱 전역 설정을 담는 key/value 저장소.
// 행이 없으면 "설정한 적 없음"이므로 호출한 쪽이 기본값을 정한다.
class AppSetting {
  static async getValue(key) {
    const result = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      [key]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].value;
  }

  // 여러 키를 한 번에 읽는다. 없는 키는 결과에서 빠지므로 호출한 쪽이 기본값을 채운다.
  static async getMany(keys) {
    if (!keys?.length) return {};
    const result = await pool.query('SELECT key, value FROM app_settings WHERE key = ANY($1::text[])', [keys]);
    return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  }

  static async setValue(key, value, updatedBy = null) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO app_settings (key, value, "updatedAt", "updatedBy")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value,
                     "updatedAt" = EXCLUDED."updatedAt",
                     "updatedBy" = EXCLUDED."updatedBy"
       RETURNING *`,
      [key, value, now, updatedBy]
    );
    return result.rows[0];
  }
}

export default AppSetting;
