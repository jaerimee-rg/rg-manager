import { encodeState, decodeState, pickAccount, extractInviteToken } from '../oauthState.js';

describe('encodeState / decodeState', () => {
  it('역할 힌트와 초대 토큰을 왕복시킨다', () => {
    const state = encodeState({ prefer: 'parent', invite: 'inv123', tinvite: 'tea456' });
    expect(decodeState(state)).toEqual({ prefer: 'parent', invite: 'inv123', tinvite: 'tea456' });
  });

  it('값이 하나도 없으면 state 를 만들지 않는다 (지금까지와 같은 인가 URL)', () => {
    expect(encodeState({})).toBeUndefined();
    expect(encodeState()).toBeUndefined();
    expect(encodeState({ prefer: '이상한역할' })).toBeUndefined();
  });

  it('빈 state 는 힌트도 초대도 없는 것으로 본다', () => {
    expect(decodeState('')).toEqual({});
    expect(decodeState(undefined)).toEqual({});
    expect(decodeState(null)).toEqual({});
  });

  it('허용되지 않은 역할 힌트는 무시한다', () => {
    const state = encodeState({ prefer: 'parent', invite: 'inv1' });
    const tampered = Buffer.from(JSON.stringify({ v: 1, p: 'superuser', i: 'inv1' })).toString('base64url');

    expect(decodeState(state).prefer).toBe('parent');
    expect(decodeState(tampered).prefer).toBeUndefined();
    expect(decodeState(tampered).invite).toBe('inv1');
  });

  it('옛 클라이언트가 보낸 초대 토큰 원문은 학부모 초대로 해석한다 (하위 호환)', () => {
    expect(decodeState('AbCd-legacy_token')).toEqual({ invite: 'AbCd-legacy_token', legacy: true });
  });

  it('base64 로 읽히지만 우리 포맷이 아니면 옛 토큰으로 본다', () => {
    const notOurs = Buffer.from(JSON.stringify({ v: 99, x: 1 })).toString('base64url');
    expect(decodeState(notOurs).legacy).toBe(true);
  });

  it('선생님 초대만 실을 수도 있다', () => {
    expect(decodeState(encodeState({ tinvite: 'T1' }))).toEqual({ tinvite: 'T1' });
  });
});

describe('pickAccount', () => {
  const admin = { id: 1, role: 'admin' };
  const teacher = { id: 2, role: 'user' };
  const parent = { id: 3, role: 'parent' };

  it('힌트가 가리키는 역할이 있으면 그 계정을 고른다', () => {
    expect(pickAccount([admin, teacher, parent], 'parent')).toBe(parent);
  });

  it('힌트가 없으면 관리자 > 선생님 > 학부모 순으로 고른다', () => {
    expect(pickAccount([parent, teacher, admin])).toBe(admin);
    expect(pickAccount([parent, teacher])).toBe(teacher);
    expect(pickAccount([parent])).toBe(parent);
  });

  it('힌트가 가리키는 계정이 없으면 우선순위로 떨어진다', () => {
    expect(pickAccount([teacher, parent], 'admin')).toBe(teacher);
  });

  it('계정이 없으면 null', () => {
    expect(pickAccount([], 'user')).toBeNull();
    expect(pickAccount(undefined)).toBeNull();
  });
});

describe('extractInviteToken', () => {
  it('토큰 원문은 그대로 둔다', () => {
    expect(extractInviteToken('abc123')).toBe('abc123');
  });

  it('초대 링크 전체를 붙여넣어도 토큰만 뽑는다', () => {
    expect(extractInviteToken('https://rg-manager.vercel.app/invite/abc123')).toBe('abc123');
    expect(extractInviteToken('https://rg-manager.vercel.app/teacher-invite/tok_9?x=1')).toBe('tok_9');
    expect(extractInviteToken('https://rg-manager.vercel.app/invite/abc123/')).toBe('abc123');
  });

  it('빈 값은 빈 문자열', () => {
    expect(extractInviteToken('')).toBe('');
    expect(extractInviteToken(undefined)).toBe('');
  });
});
