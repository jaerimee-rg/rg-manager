// 복사해 둔 사진(스크린샷, 웹에서 "이미지 복사", 파인더에서 복사한 사진 파일)을 붙여 넣으면 상품 사진으로 쓴다.
import { isAllowedImageName } from './imageResize';

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const isImageFile = (file) => Boolean(file) && (String(file.type).startsWith('image/') || isAllowedImageName(file.name));

/**
 * 붙여 넣은 사진은 이름이 "image.png" 이거나 아예 없다 — 형식에 맞는 확장자를 붙여 둔다.
 * 허용하지 않는 형식(svg, heic …)은 그대로 돌려줘서 파일을 고를 때와 같은 안내로 막히게 한다.
 */
export const withImageName = (file) => {
  if (isAllowedImageName(file.name)) return file;
  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension) return file;
  return new File([file], `pasted-image.${extension}`, { type: file.type });
};

/** 클립보드에서 첫 번째 사진 파일을 꺼낸다. 사진이 없으면 null */
export const imageFromClipboard = (clipboardData) => {
  if (!clipboardData) return null;
  const fromItems = Array.from(clipboardData.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .find(isImageFile);
  const file = fromItems || Array.from(clipboardData.files || []).find(isImageFile);
  return file ? withImageName(file) : null;
};

export const hasClipboardText = (clipboardData) => {
  try {
    return Boolean(clipboardData?.getData?.('text/plain')?.trim());
  } catch {
    return false;
  }
};

const NON_TEXT_INPUTS = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];

/** 글자를 넣는 칸인가 */
export const isTextEntry = (element) => {
  if (!element || element.nodeType !== 1) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && !NON_TEXT_INPUTS.includes(String(element.type).toLowerCase());
};

/**
 * 이 붙여넣기에서 사진을 가져갈지. 사진이 없으면 null.
 * 글자 칸에 글자까지 함께 붙여 넣는 경우(엑셀 셀·워드 문단은 사진 렌더링도 같이 실린다)는
 * 글자가 먼저다 — 그때는 브라우저 기본 붙여넣기에 맡긴다.
 */
export const pastedProductImage = (event) => {
  const file = imageFromClipboard(event?.clipboardData);
  if (!file) return null;
  if (isTextEntry(event.target) && hasClipboardText(event.clipboardData)) return null;
  return file;
};
