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
