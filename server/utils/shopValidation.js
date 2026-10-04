// 추천 상품 입력 규칙 (docs/recommended-shop/02-data-model-api.md §2).
// DB·요청을 모르는 순수 함수만 둔다. 클라이언트 utils/shopFormat.js 가 같은 규칙을 같은 표로 테스트한다.
import { lookupType } from './faqFileTypes.js';

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const URL_MAX = 2000;
export const PRICE_MAX = 100_000_000;
export const CATEGORY_NAME_MAX = 20;
export const SHOP_TITLE_MAX = 40;
export const SHOP_TEXT_MAX = 300;
export const MAX_PRODUCTS = 200;
export const MAX_CATEGORIES = 20;
export const MAX_PRODUCT_IMAGES = 10;
export const VISITOR_KEY_MAX = 100;

// 같은 사람이 짧은 시간에 다시 누른 것은 한 번으로 센다
export const CLICK_DEDUP_MS = 10 * 1000;
export const VIEW_DEDUP_MS = 30 * 60 * 1000;

export const DEFAULT_CATEGORIES = ['발레복', '레오타드', '기구', '슈즈', '용품'];

export const URL_ERROR = '웹 주소(https://…)를 입력해 주세요';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// 스킴 없이 붙여 넣은 주소(coupang.com/…). 점이 있는 호스트로 시작해야 한다.
const LOOKS_LIKE_HOST = /^[^\s/?#:@]+\.[^\s/?#:@]{2,}(?::\d+)?(?:[/?#]|$)/u;

/**
 * 상품 주소를 정리한다. 비어 있으면 null(링크 없는 상품).
 * http/https 만 받는다 — javascript:, data: 같은 주소는 카드에 걸리면 위험하다.
 */
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

/** 가격(원). 비우면 null(표시 안 함). "32,000" · "32000원" 도 받는다. */
export const parsePrice = (raw) => {
  if (raw == null || raw === '') return { value: null };

  const text = typeof raw === 'number' ? String(raw) : String(raw).replace(/[,\s]/g, '').replace(/원$/, '');
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: '가격은 숫자로만 입력해 주세요' };

  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > PRICE_MAX) {
    return { error: '가격은 1억 원까지 입력할 수 있어요' };
  }
  return { value };
};

/** 상세 설명. 비우면 null. 줄바꿈은 그대로 두되 \r\n 은 \n 으로 맞춘다. */
export const parseDescription = (raw) => {
  if (raw == null) return { value: null };
  const text = String(raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return { value: null };
  if (text.length > DESCRIPTION_MAX) return { error: `상세 설명은 ${DESCRIPTION_MAX}자까지 입력할 수 있어요` };
  return { value: text };
};

/** 정수 id 또는 null. 그 외는 undefined(잘못된 값). */
export const parseId = (raw) => {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * 상품 등록·수정 본문. 필수는 타이틀뿐이다.
 * @returns {{ value: object, errors: object|null }}
 */
export const validateProductInput = (body = {}) => {
  const errors = {};

  const title = String(body.title ?? '').trim();
  if (!title) errors.title = '타이틀을 입력해 주세요';
  else if (title.length > TITLE_MAX) errors.title = `타이틀은 ${TITLE_MAX}자까지 입력할 수 있어요`;

  // 주지 않으면 undefined — 수정에서 기존 설명을 지킨다(설명 칸이 없던 화면이 저장해도 지워지지 않게)
  let description;
  if (body.description !== undefined) {
    description = parseDescription(body.description);
    if (description.error) errors.description = description.error;
  }

  const url = normalizeUrl(body.url);
  if (url.error) errors.url = url.error;

  const price = parsePrice(body.price);
  if (price.error) errors.price = price.error;

  const categoryId = parseId(body.categoryId);
  if (categoryId === undefined) errors.categoryId = '카테고리를 다시 골라 주세요';

  // 주지 않으면 undefined — 등록은 공개, 수정은 기존 값을 지킨다(숨긴 상품이 몰래 다시 보이지 않게)
  let isVisible;
  if (body.isVisible !== undefined) {
    if (typeof body.isVisible === 'boolean') isVisible = body.isVisible;
    else errors.isVisible = '공개 여부가 올바르지 않아요';
  }

  return {
    value: {
      title,
      description: description === undefined ? undefined : description.value ?? null,
      url: url.value ?? null,
      price: price.value ?? null,
      categoryId: categoryId ?? null,
      isVisible
    },
    errors: Object.keys(errors).length ? errors : null
  };
};

export const validateCategoryName = (raw) => {
  const name = String(raw ?? '').trim();
  if (!name) return { error: '카테고리 이름을 입력해 주세요' };
  if (name.length > CATEGORY_NAME_MAX) return { error: `카테고리 이름은 ${CATEGORY_NAME_MAX}자까지예요` };
  return { value: name };
};

const optionalText = (raw) => {
  const text = String(raw ?? '').trim();
  return text || null;
};

/** 상점 정보 — 이름(필수), 소개·하단 안내문(선택), 공개 여부 */
export const validateShopSettings = (body = {}) => {
  const errors = {};

  const title = String(body.title ?? '').trim();
  if (!title) errors.title = '상점 이름을 입력해 주세요';
  else if (title.length > SHOP_TITLE_MAX) errors.title = `상점 이름은 ${SHOP_TITLE_MAX}자까지예요`;

  const intro = optionalText(body.intro);
  if (intro && intro.length > SHOP_TEXT_MAX) errors.intro = `소개는 ${SHOP_TEXT_MAX}자까지예요`;

  const notice = optionalText(body.notice);
  if (notice && notice.length > SHOP_TEXT_MAX) errors.notice = `하단 안내문은 ${SHOP_TEXT_MAX}자까지예요`;

  let isActive = true;
  if (body.isActive !== undefined) {
    if (typeof body.isActive === 'boolean') isActive = body.isActive;
    else errors.isActive = '공개 여부가 올바르지 않아요';
  }

  return {
    value: { title, intro, notice, isActive },
    errors: Object.keys(errors).length ? errors : null
  };
};

export const STATS_RANGES = ['7', '30', '90', 'all'];

/** 통계 기간. 'all' 이면 since 가 null. 모르는 값은 30일. */
export const parseStatsRange = (days, now = Date.now()) => {
  const range = STATS_RANGES.includes(String(days)) ? String(days) : '30';
  if (range === 'all') return { range, since: null };
  return { range, since: new Date(now - Number(range) * 24 * 60 * 60 * 1000).toISOString() };
};

/** 상품 이미지로 받는 형식 — FAQ 파일 규칙에서 이미지만(svg 없음). 확장자로 판단한다. */
export const isAllowedImage = (filename) => lookupType(filename)?.kind === 'image';

export const normalizeVisitorKey = (raw) => {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().slice(0, VISITOR_KEY_MAX);
  return key || null;
};

/**
 * 순서 변경 요청이 "내 것 전부를 한 번씩" 담고 있는지.
 * 남의 id 가 섞이거나 빠진 것이 있으면 거절한다.
 */
export const isSameIdSet = (ids, ownedIds) => {
  if (!Array.isArray(ids) || ids.length !== ownedIds.length) return false;
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) return false;
  const seen = new Set(ids);
  if (seen.size !== ids.length) return false;
  return ownedIds.every((id) => seen.has(id));
};

/** 상점 기본 이름 — "{선생님 이름} 선생님 추천 상품" */
export const defaultShopTitle = (name) => {
  const base = String(name ?? '').trim();
  const title = base ? `${base} 선생님 추천 상품` : '선생님 추천 상품';
  return title.length > SHOP_TITLE_MAX ? '선생님 추천 상품' : title;
};
