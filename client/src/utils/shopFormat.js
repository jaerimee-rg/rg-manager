import { extractChosung } from './koreanSearch';

// 추천 상품 화면 규칙 (docs/recommended-shop). 주소·가격 규칙은 서버 utils/shopValidation.js 와 같고,
// 두 쪽 테스트가 같은 표로 확인한다 — 공유 패키지가 없는 이 저장소의 기존 방식이다.

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const URL_MAX = 2000;
export const PRICE_MAX = 100000000;
export const CATEGORY_NAME_MAX = 20;
export const SHOP_TITLE_MAX = 40;
export const SHOP_TEXT_MAX = 300;

export const URL_ERROR = '웹 주소(https://…)를 입력해 주세요';
export const TITLE_ERROR = '타이틀을 입력해 주세요';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOOKS_LIKE_HOST = /^[^\s/?#:@]+\.[^\s/?#:@]{2,}(?::\d+)?(?:[/?#]|$)/u;

/** 상품 주소 정리 — 비우면 null, http/https 만 통과 */
export const normalizeUrl = (raw) => {
  if (raw == null) return { value: null };
  let text = String(raw).trim();
  if (!text) return { value: null };
  if (text.length > URL_MAX) return { error: URL_ERROR };

  // "coupang.com:8080/x" 도 스킴처럼 보이므로(coupang.com:) 호스트 모양을 먼저 본다
  if (!HAS_SCHEME.test(text) || (!/^https?:/i.test(text) && LOOKS_LIKE_HOST.test(text))) {
    if (!LOOKS_LIKE_HOST.test(text)) return { error: URL_ERROR };
    text = `https://${text}`;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: URL_ERROR };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: URL_ERROR };
  if (!url.hostname) return { error: URL_ERROR };
  if (url.href.length > URL_MAX) return { error: URL_ERROR };
  return { value: url.href };
};

/** 화면에 걸어도 되는 주소인지 — 저장 때 걸렀어도 그릴 때 한 번 더 본다(FR-462) */
export const safeHref = (url) => {
  if (!url) return null;
  return normalizeUrl(url).value ?? null;
};

/** "coupang.com" — www. 는 뗀다. 주소가 아니면 빈 문자열 */
export const hostnameOf = (url) => {
  const href = safeHref(url);
  if (!href) return '';
  return new URL(href).hostname.replace(/^www\./, '');
};

/** 32000 → "32,000원". 가격이 없으면 빈 문자열(표시 안 함) */
export const formatPrice = (price) => {
  if (price == null || price === '') return '';
  const n = Number(price);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('ko-KR')}원`;
};

/** 가격 입력칸 — 숫자만 남기고 콤마를 붙여 보여 준다 ("32000" → "32,000") */
export const formatPriceInput = (text) => {
  const digits = String(text ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
};

/** 가격 입력칸 → 숫자(원). 비면 null */
export const parsePriceInput = (text) => {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return { value: null };
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value > PRICE_MAX) {
    return { error: '가격은 1억 원까지 입력할 수 있어요' };
  }
  return { value };
};

/** 등록 모달 검사 — 서버와 같은 규칙. 통과하면 errors 가 null */
/** 상세 설명 — 서버 parseDescription 과 같은 규칙. 비우면 null, 줄바꿈은 지킨다 */
export const parseDescriptionInput = (raw) => {
  if (raw == null) return { value: null };
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return { value: null };
  if (text.length > DESCRIPTION_MAX) return { error: `상세 설명은 ${DESCRIPTION_MAX}자까지 입력할 수 있어요` };
  return { value: text };
};

export const validateProductForm = ({ title, description, url, price }) => {
  const errors = {};
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) errors.title = TITLE_ERROR;
  else if (cleanTitle.length > TITLE_MAX) errors.title = `타이틀은 ${TITLE_MAX}자까지 입력할 수 있어요`;

  const cleanDescription = parseDescriptionInput(description);
  if (cleanDescription.error) errors.description = cleanDescription.error;

  const cleanUrl = normalizeUrl(url);
  if (cleanUrl.error) errors.url = cleanUrl.error;

  const cleanPrice = parsePriceInput(price);
  if (cleanPrice.error) errors.price = cleanPrice.error;

  return {
    value: {
      title: cleanTitle,
      description: cleanDescription.value ?? null,
      url: cleanUrl.value ?? null,
      price: cleanPrice.value ?? null
    },
    errors: Object.keys(errors).length ? errors : null
  };
};

/**
 * 상품 이름 검색 — 글자 포함, 또는 초성만 친 경우 초성 포함("ㄹㅂ" → 리본).
 * koreanSearch 의 혼합 매칭은 "리본" 이 "발레복"(ㅂㄹㅂ)에도 걸려 상품 목록에는 너무 넓다.
 */
export const matchProductTitle = (query, title) => {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const t = String(title ?? '').toLowerCase();
  if (t.includes(q)) return true;
  return /^[ㄱ-ㅎ]+$/.test(q) && extractChosung(t).includes(q);
};

/** 칩에 올릴 카테고리 — 상품이 하나라도 있는 것만, 카테고리 순서대로 */
export const usedCategories = (categories = [], products = []) => {
  const used = new Set(products.map((p) => p.categoryId).filter((id) => id != null));
  return categories.filter((c) => used.has(c.id));
};

/** 카테고리 필터. 'none' 은 카테고리 없는 상품, null 은 전체 */
export const filterByCategory = (products = [], categoryId) => {
  if (categoryId == null) return products;
  if (categoryId === 'none') return products.filter((p) => p.categoryId == null);
  return products.filter((p) => p.categoryId === categoryId);
};

/** 공개 상점 주소 */
export const shopPublicUrl = (publicId, origin = window.location.origin) =>
  publicId ? `${origin}/shop/${publicId}` : '';

const KST_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

/** 마지막 클릭 시각 — "10/3 20:20" (한국 시간) */
export const formatClickTime = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(KST_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
};

/** 통계 기간 안내 — "9월 4일부터" / "전체 기간" */
export const formatPeriod = (since) => {
  if (!since) return '전체 기간';
  const date = new Date(since);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(KST_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.month}월 ${parts.day}일부터`;
};

/** 클릭한 방문자 비율 — 방문자가 없으면 빈 문자열 */
export const clickRateText = (clickVisitors, visitors) => {
  if (!visitors) return '';
  return `방문자의 ${Math.min(100, Math.round((clickVisitors / visitors) * 100))}%`;
};
