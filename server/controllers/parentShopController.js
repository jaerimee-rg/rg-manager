// 학부모 [추천 상품] 탭 (docs/recommended-shop) — 연결된 선생님의 공개 상점을 알려 준다.
// 상품 화면은 선생님이 보내는 공유 링크 /shop/:publicId 를 그대로 연다. 여기서는 그 링크의 공개 id 만 준다.
import Shop from '../models/Shop.js';
import { teachersOf } from '../services/parentScope.js';

export const listShops = async (req, res) => {
  try {
    const teachers = await teachersOf(req.user.id);
    const shops = await Shop.listActiveByUserIds(teachers.map((t) => t.id));
    const byTeacher = new Map(shops.map((shop) => [Number(shop.userId), shop]));

    // 먼저 연결한 선생님 순서. 상점을 연 적이 없거나 닫아 둔 선생님은 빠진다
    res.json({
      shops: teachers
        .filter((t) => byTeacher.has(Number(t.id)))
        .map((t) => {
          const shop = byTeacher.get(Number(t.id));
          return { publicId: shop.publicId, title: shop.title, teacherName: t.name };
        })
    });
  } catch (error) {
    console.error('학부모 추천 상품 조회 오류:', error?.message || error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { listShops };
