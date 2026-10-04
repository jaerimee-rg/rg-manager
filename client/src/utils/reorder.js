// 배열에서 항목을 from 위치에서 to 위치로 이동한 새 배열을 반환 (드래그 앤 드롭 순서 변경용)
export const moveItem = (array, from, to) => {
  if (
    !Array.isArray(array) ||
    from === to ||
    from < 0 || from >= array.length ||
    to < 0 || to >= array.length
  ) {
    return array;
  }
  const result = [...array];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
};

/**
 * 끌어서 놓을 자리. midpoints 는 끌고 있는 행을 **뺀** 나머지 행들의 세로 가운데(위에서부터),
 * y 는 손가락·마우스 높이. 돌려주는 값은 moveItem 의 to — 옮긴 뒤 목록에서의 자리(0…나머지 수).
 */
export const dropIndex = (midpoints, y) => midpoints.filter((mid) => mid < y).length;

/**
 * 놓일 자리를 보여 줄 선 — 원래 목록의 몇 번째 행 앞(before)·뒤(after)에 그릴지. 제자리면 null.
 */
export const dropMarker = (from, to, count) => {
  if (to === from || count < 2) return null;
  const others = count - 1;
  if (to < others) return { index: to < from ? to : to + 1, edge: 'before' };
  return { index: from === count - 1 ? count - 2 : count - 1, edge: 'after' };
};
