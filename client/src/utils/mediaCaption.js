/**
 * 사진·영상 설명(선생님이 쓰고 학부모가 뷰어 아래쪽에서 본다).
 * 규칙은 서버 server/utils/mediaValidation.js normalizeCaption 과 같다 — 화면은 보낼 값과 저장할 게 있는지를 미리 본다.
 */
export const CAPTION_MAX = 500;

/** 보낼 값 — 앞뒤 공백을 지우고, 비었으면 null(설명 지우기) */
export const cleanCaption = (text) => {
  const value = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  return value || null;
};

/** 고친 글이 저장된 설명과 다른가 — 같으면 [저장] 을 막는다 */
export const captionChanged = (draft, saved) => cleanCaption(draft) !== cleanCaption(saved);

/**
 * 휴대폰 키보드가 가린 높이. 화면(레이아웃) 아래쪽 중 보이는 영역(visualViewport) 밖에 있는 만큼이다.
 * 키보드가 올라오면 화면 자체가 줄어드는 브라우저에서는 0 이다.
 */
export const keyboardInset = ({ innerHeight, height, offsetTop = 0 } = {}) => {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(height)) return 0;
  return Math.max(0, Math.round(innerHeight - height - (Number(offsetTop) || 0)));
};

export default { CAPTION_MAX, cleanCaption, captionChanged, keyboardInset };
