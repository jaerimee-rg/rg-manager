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

export default { DRIVE_PLAYER_MIN_WIDTH, drivePlayerFrame };
