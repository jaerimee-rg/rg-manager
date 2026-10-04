import { moveItem, dropIndex, dropMarker } from '../reorder';

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

describe('끌어서 놓을 자리 (dropIndex · dropMarker)', () => {
  // 행 높이 50, 끌고 있는 행을 뺀 나머지의 가운데
  it('손가락 높이보다 위에 있는 행 수가 놓일 자리다', () => {
    const mids = [25, 75, 125];
    expect(dropIndex(mids, 10)).toBe(0);
    expect(dropIndex(mids, 80)).toBe(2);
    expect(dropIndex(mids, 500)).toBe(3);
  });

  it('놓일 자리와 moveItem 결과가 맞고, 선은 그 자리 앞·뒤에 그린다', () => {
    const list = ['a', 'b', 'c'];
    // a 를 b 와 c 사이로
    expect(moveItem(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(dropMarker(0, 1, 3)).toEqual({ index: 2, edge: 'before' });
    // c 를 맨 앞으로
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(dropMarker(2, 0, 3)).toEqual({ index: 0, edge: 'before' });
    // a 를 맨 뒤로
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(dropMarker(0, 2, 3)).toEqual({ index: 2, edge: 'after' });
    // 마지막 행을 끌어 제자리 바로 앞으로
    expect(dropMarker(2, 1, 3)).toEqual({ index: 1, edge: 'before' });
  });

  it('제자리이거나 한 줄뿐이면 선이 없다', () => {
    expect(dropMarker(1, 1, 3)).toBeNull();
    expect(dropMarker(0, 0, 1)).toBeNull();
  });
});
