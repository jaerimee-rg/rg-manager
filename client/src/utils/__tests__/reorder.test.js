import { moveItem } from '../reorder';

describe('moveItem', () => {
  it('항목을 앞에서 뒤로 이동한다', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('항목을 뒤에서 앞으로 이동한다', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('인접한 항목을 교환한다', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('같은 위치로 이동하면 원본 배열을 그대로 반환한다', () => {
    const arr = ['a', 'b', 'c'];
    expect(moveItem(arr, 1, 1)).toBe(arr);
  });

  it('범위를 벗어난 인덱스는 원본 배열을 그대로 반환한다', () => {
    const arr = ['a', 'b', 'c'];
    expect(moveItem(arr, -1, 2)).toBe(arr);
    expect(moveItem(arr, 0, 3)).toBe(arr);
    expect(moveItem(arr, 3, 0)).toBe(arr);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const arr = ['a', 'b', 'c'];
    moveItem(arr, 0, 2);
    expect(arr).toEqual(['a', 'b', 'c']);
  });
});
