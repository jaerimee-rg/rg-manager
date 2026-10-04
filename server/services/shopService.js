import pool from '../database.js';
import Shop from '../models/Shop.js';
import { DEFAULT_CATEGORIES, defaultShopTitle } from '../utils/shopValidation.js';
import { displayNameOf } from '../utils/usernames.js';

/**
 * 선생님의 상점. 처음 들어오면 기본 이름·기본 카테고리와 함께 만든다(FR-400 · 420).
 * 이름은 선생님 표시 이름을 쓴다 — 초대로 생긴 계정의 username 은 "카카오_…" 자리표시라 쓰지 않는다.
 */
export const getOrCreateShop = async (userId) => {
  const existing = await Shop.getByUserId(userId);
  if (existing) return existing;

  const result = await pool.query('SELECT username, "displayName" FROM users WHERE id = $1', [userId]);
  const title = defaultShopTitle(displayNameOf(result.rows[0]));
  return Shop.createWithDefaults(userId, title, DEFAULT_CATEGORIES);
};

export default { getOrCreateShop };
