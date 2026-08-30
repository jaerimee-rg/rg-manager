import { homePathFor, roleLabel, afterCreatePath, ROLE_ORDER } from '../roleRoutes';

describe('roleLabel', () => {
  it('역할을 한국어 이름으로 바꾼다', () => {
    expect(roleLabel('admin')).toBe('관리자');
    expect(roleLabel('user')).toBe('선생님');
    expect(roleLabel('parent')).toBe('학부모');
  });

  it('모르는 값은 그대로 둔다', () => {
    expect(roleLabel('other')).toBe('other');
    expect(roleLabel(undefined)).toBe('');
  });
});

describe('homePathFor', () => {
  it('역할마다 시작 화면이 다르다', () => {
    expect(homePathFor('admin')).toBe('/admin');
    expect(homePathFor('user')).toBe('/');
    expect(homePathFor('parent')).toBe('/parent/schedule');
  });

  it('모르는 역할은 선생님 화면으로 (기존 동작)', () => {
    expect(homePathFor(undefined)).toBe('/');
  });
});

describe('afterCreatePath', () => {
  it('새 선생님 계정은 이름부터 정한다', () => {
    expect(afterCreatePath('user', { isNewUser: true })).toBe('/register-name');
  });

  it('새 학부모 계정은 아이부터 등록한다', () => {
    expect(afterCreatePath('parent', { needsOnboarding: true })).toBe('/parent/onboarding');
  });

  it('연결만 추가된 학부모는 바로 일정으로 간다', () => {
    expect(afterCreatePath('parent', { needsOnboarding: false })).toBe('/parent/schedule');
  });

  it('이름이 이미 있는 선생님은 홈으로', () => {
    expect(afterCreatePath('user', { isNewUser: false })).toBe('/');
  });
});

describe('ROLE_ORDER', () => {
  it('메뉴 정렬은 관리자 > 선생님 > 학부모', () => {
    expect(ROLE_ORDER).toEqual(['admin', 'user', 'parent']);
  });
});
