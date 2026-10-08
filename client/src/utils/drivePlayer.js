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

export default {
  DRIVE_PLAYER_MIN_WIDTH, drivePlayerFrame, readyPreviewUrl, hasSeenFrameTap, rememberFrameTap, isTouchDevice, shouldPrewarm
};
