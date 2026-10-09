/**
 * Drive 영상 플레이어(iframe)를 어떤 크기로 그릴지 정한다 (순수 함수).
 *
 * Drive 플레이어는 **자기 폭**을 보고 컨트롤 배치를 고른다(2026-10-08 Chrome·WebKit 실측):
 *   - 480px 이하: 일시정지·10초 버튼·진행 막대가 영상 한가운데에 크게 떠서 재생 내내 영상을 가린다
 *   - 500px 이상: 맨 아래 얇은 막대 한 줄
 * 다른 출처의 iframe 이라 안쪽 컨트롤은 우리가 못 건드린다. 그래서 좁은 화면에서는 iframe 을
 * 넓게(DRIVE_PLAYER_MIN_WIDTH) 그린 뒤 transform 으로 줄여 보여 준다 — 플레이어는 자기가 넓다고 보고
 * 아래 막대 배치를 쓴다.
 */

/** 아래 막대 배치가 나오는 폭. 경계(500px)에서 여유를 둔 값 */
export const DRIVE_PLAYER_MIN_WIDTH = 520;

/**
 * @param {number} width  플레이어가 들어갈 칸의 폭(px)
 * @param {number} height 칸의 높이(px)
 * @returns {{ scale: number, width: number|null, height: number|null }}
 *   scale 이 1 이면 칸을 그대로 채우면 된다(width·height 는 null).
 *   1 보다 작으면 iframe 을 width×height 로 그리고 scale 만큼 줄인다 — 줄인 결과가 칸과 같은 크기다.
 */
export const drivePlayerFrame = (width, height, minWidth = DRIVE_PLAYER_MIN_WIDTH) => {
  const fits = !(width > 0) || !(height > 0) || width >= minWidth;
  if (fits) return { scale: 1, width: null, height: null };

  const scale = width / minWidth;
  return { scale, width: minWidth, height: Math.round(height / scale) };
};

/*
 * ── 누르는 즉시 재생 ───────────────────────────────────────────────────────────
 * Drive 플레이어는 가운데 재생 버튼을 누른 **뒤에야** 영상을 불러오기 시작한다. 휴대폰에서는 그동안
 * (1~3초) 버튼이 그대로 남아 "눌렀는데 안 없어진다" 로 보인다.
 *
 * 주소에 autoplay=1 을 붙이면 플레이어가 뜨자마자 재생을 시도하고, 브라우저가 소리 나는 자동 재생을
 * 막으므로(자동 재생 권한을 넘겨주지 않는다) **준비만 끝낸 채 검은 화면으로 기다린다.** 이 상태에서는
 * 화면 아무 데나 한 번 누르면 0.2초 안에 밝게 재생되고 가운데 버튼 없이 아래 컨트롤만 나온다
 * (2026-10-08 Chrome·WebKit 의 Pixel 7 / iPhone 14 설정으로 실측).
 *
 * 검은 화면에는 누를 표시가 없으므로 우리 미리보기 사진과 재생 표시를 겹쳐 두고(터치는 그대로
 * 플레이어로 지나간다), 플레이어 안을 누른 순간 치운다. 그 순간은 "포커스가 iframe 으로 넘어갔다" 로
 * 안다 — 다른 출처의 iframe 이라 그 안의 터치 이벤트는 우리에게 오지 않는다.
 *
 * 이 신호가 오지 않는 기기에서 겹친 사진을 못 치우면 영상이 가려진 채 재생된다. 그래서 그 기기에서
 * 신호를 **한 번이라도 본 뒤에만** 이 방식을 켠다. 못 본 기기는 예전 그대로(Drive 의 재생 버튼)다.
 */

/** 준비만 해 두는 주소 */
export const readyPreviewUrl = (previewUrl) => {
  if (!previewUrl) return previewUrl;
  return `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}autoplay=1`;
};

const TAP_SIGNAL_KEY = 'rg.drivePlayer.tapSignal';

const browserStorage = () => {
  try { return window.localStorage; } catch (error) { return null; }
};

/** 이 기기에서 "플레이어 안을 눌렀다" 는 신호를 본 적이 있는가 */
export const hasSeenFrameTap = (storage = browserStorage()) => {
  try { return storage?.getItem(TAP_SIGNAL_KEY) === '1'; } catch (error) { return false; }
};

export const rememberFrameTap = (storage = browserStorage()) => {
  try { storage?.setItem(TAP_SIGNAL_KEY, '1'); } catch (error) { /* 저장을 막아 둔 브라우저 — 다음에도 예전 방식 */ }
};

/**
 * 손가락으로 쓰는 기기인가. 마우스가 있는 기기는 재생이 원래 빠르고, 자동 재생을 허용해 둔 PC 브라우저에서는
 * 준비 상태로 멈추지 않고 바로 재생돼 버리므로 켜지 않는다.
 */
export const isTouchDevice = (win = typeof window === 'undefined' ? null : window) => {
  try { return Boolean(win?.matchMedia?.('(hover: none) and (pointer: coarse)').matches); } catch (error) { return false; }
};

/** 이 영상을 준비 상태로 띄울지 */
export const shouldPrewarm = ({ src, touch, sawTap }) => Boolean(src && touch && sawTap);

/*
 * ── 영상 위에서도 옆으로 밀어 넘기기 ──────────────────────────────────────────────
 * 플레이어는 다른 출처의 iframe 이라 그 안의 터치는 우리에게 오지 않는다. 그래서 손가락으로 쓰는 기기에서는
 * 플레이어 위에 투명한 판을 덮어, 그 위에서 민 것을 뷰어가 받는다(hooks/useSwipeToPage).
 * 판이 Drive 의 버튼을 가리면 재생을 못 하므로 세 군데는 비운다 (2026-10-09 운영 영상, Chrome Pixel 7 설정 실측):
 *   - 가운데 SWIPE_HOLE px 정사각형 — Drive 의 재생 버튼(화면에서 약 47px), 준비 상태에서 누르면 바로 재생되는 자리,
 *     우리 재생 표시
 *   - 맨 아래 SWIPE_BOTTOM — 재생 중의 아래 막대. 진행 막대가 플레이어 바닥에서 약 102px(플레이어 자신의 px) 위에 있고
 *     그 아래 재생/일시정지 · 소리 · 자막 · 속도 · 설정 · 전체 화면 줄이 있다. 진행 막대를 손끝으로 잡을 여유를 더했다
 *   - 맨 위 SWIPE_TOP — 오른쪽 위 '새 창에서 열기' 버튼(약 51px)
 * 위·아래 값은 플레이어 자신의 px 이다 — 좁은 화면에서 플레이어를 줄여 보여 주므로(drivePlayerFrame) 같은 비율로 줄인다.
 * 판 위를 누르면 아무 일도 없다. 재생 중에 숨은 컨트롤을 다시 띄우려면 가운데나 아래쪽을 누른다.
 * 마우스 기기는 덮지 않는다 — 밀어 넘길 일이 없고, Drive 화면 어디를 눌러도 되어야 한다.
 */
export const SWIPE_TOP = 64;
export const SWIPE_BOTTOM = 132;
export const SWIPE_HOLE = 120;

/**
 * 판 네 조각 — 가운데 구멍 둘레. 플레이어 칸 기준 CSS 위치(top·bottom·left·right).
 * scale 은 플레이어를 줄여 보여 주는 비율(drivePlayerFrame().scale) — 위·아래 비울 높이에 곱한다.
 */
export const swipeBands = ({ scale = 1, top = SWIPE_TOP, bottom = SWIPE_BOTTOM, hole = SWIPE_HOLE } = {}) => {
  const half = hole / 2;
  const ratio = scale > 0 && scale < 1 ? scale : 1;
  const topPx = Math.round(top * ratio);
  const bottomPx = Math.round(bottom * ratio);
  return [
    { key: 'above', top: `${topPx}px`, bottom: `calc(50% + ${half}px)`, left: '0px', right: '0px' },
    { key: 'below', top: `calc(50% + ${half}px)`, bottom: `${bottomPx}px`, left: '0px', right: '0px' },
    { key: 'left', top: `calc(50% - ${half}px)`, bottom: `calc(50% - ${half}px)`, left: '0px', right: `calc(50% + ${half}px)` },
    { key: 'right', top: `calc(50% - ${half}px)`, bottom: `calc(50% - ${half}px)`, left: `calc(50% + ${half}px)`, right: '0px' }
  ];
};

/** 영상 위에 넘기기 판을 덮을지 — 손가락으로 쓰는 기기이고 넘길 다른 장이 있을 때만 */
export const shouldCoverForSwipe = ({ touch, canPage }) => Boolean(touch && canPage);

export default {
  DRIVE_PLAYER_MIN_WIDTH, drivePlayerFrame, readyPreviewUrl, hasSeenFrameTap, rememberFrameTap, isTouchDevice, shouldPrewarm,
  swipeBands, shouldCoverForSwipe
};
