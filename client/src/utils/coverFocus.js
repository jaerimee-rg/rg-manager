/**
 * 대표 사진의 보일 부분 — { x, y } (0~100, CSS object-position 의 %). 서버 mediaValidation.normalizeCoverFocus 와 같은 범위다.
 * 카드 표지 칸은 object-fit: cover 라, 사진이 칸보다 넓으면 x 가, 높으면 y 가 어디를 보일지 정한다.
 */

export const CENTER = Object.freeze({ x: 50, y: 50 });

const clamp = (n) => Math.min(100, Math.max(0, n));
const round = (n) => Math.round(n * 10) / 10;

/** { x, y } → CSS object-position. 없으면 가운데 */
export const focusToPosition = (focus) => `${(focus || CENTER).x}% ${(focus || CENTER).y}%`;

/**
 * 표지에서 그 칸의 가로:세로 비율(가로 ÷ 세로). 표지 상자는 16:10 이고 장수에 따라 나눈다(ui.css .ui-album-card__cover[data-covers]):
 * 1장 = 16:10 · 2장 = 반씩(8:10) · 3장 = 첫 장은 왼쪽 반 전체(8:10), 나머지는 오른쪽 위아래(8:5) · 4장 = 2×2(8:5).
 */
export const coverCellAspect = (count, index) => {
  if (count <= 1) return 16 / 10;
  if (count === 2) return 8 / 10;
  if (count === 3) return index === 0 ? 8 / 10 : 8 / 5;
  return 8 / 5;
};

/**
 * 틀 안에서 사진을 손가락·마우스로 (dx, dy) 만큼 끌었을 때의 새 보일 부분. 사진을 오른쪽으로 끌면 왼쪽이 더 보인다(x 가 준다).
 * object-fit: cover 로 틀에 맞춘 크기에서 틀 밖으로 넘친 만큼이 움직일 수 있는 거리다 — 넘치지 않는 쪽은 그대로.
 * frame·natural = { width, height } (틀의 화면 크기 · 사진 원래 크기)
 */
export const panFocus = (focus, { dx = 0, dy = 0 }, frame, natural) => {
  const start = focus || CENTER;
  if (!frame?.width || !frame?.height || !natural?.width || !natural?.height) return start;
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height);
  const overflowX = natural.width * scale - frame.width;
  const overflowY = natural.height * scale - frame.height;
  return {
    x: overflowX > 0.5 ? round(clamp(start.x - (dx / overflowX) * 100)) : start.x,
    y: overflowY > 0.5 ? round(clamp(start.y - (dy / overflowY) * 100)) : start.y
  };
};

/** 화살표 키로 조금씩 — 사진을 그쪽으로 미는 것과 같은 방향(→ 는 왼쪽이 더 보인다). 다른 키면 null */
export const NUDGE = 5;
export const nudgeFocus = (focus, key) => {
  const start = focus || CENTER;
  const step = {
    ArrowLeft: { x: NUDGE, y: 0 },
    ArrowRight: { x: -NUDGE, y: 0 },
    ArrowUp: { x: 0, y: NUDGE },
    ArrowDown: { x: 0, y: -NUDGE }
  }[key];
  if (!step) return null;
  return { x: clamp(start.x + step.x), y: clamp(start.y + step.y) };
};

export const sameFocus = (a, b) => (a || CENTER).x === (b || CENTER).x && (a || CENTER).y === (b || CENTER).y;

export default { CENTER, focusToPosition, coverCellAspect, panFocus, nudgeFocus, sameFocus, NUDGE };
