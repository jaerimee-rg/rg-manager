import { userLabel } from '../userName';

describe('userLabel — 화면에 보여줄 계정 이름', () => {
  it('표시 이름이 있으면 그것을 쓴다', () => {
    expect(userLabel({ username: '카카오_1788076610466', displayName: '최재웅' })).toBe('최재웅');
  });

  it('표시 이름이 없거나 비어 있으면 username 으로 되돌린다 (옛 계정)', () => {
    expect(userLabel({ username: '이재림' })).toBe('이재림');
    expect(userLabel({ username: '이재림', displayName: null })).toBe('이재림');
    expect(userLabel({ username: '이재림', displayName: '   ' })).toBe('이재림');
  });

  it('앞뒤 공백은 잘라 준다', () => {
    expect(userLabel({ username: 'x', displayName: '  최재웅 ' })).toBe('최재웅');
  });

  it('사용자가 없으면 빈 문자열', () => {
    expect(userLabel(null)).toBe('');
    expect(userLabel(undefined)).toBe('');
    expect(userLabel({})).toBe('');
  });
});
