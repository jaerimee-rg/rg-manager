import {
  isSafeReturnPath, saveReturnTo, peekReturnTo, consumeReturnTo, clearReturnTo, returnPathFor, isEventSharePath
} from '../returnTo';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

describe('isSafeReturnPath — 앱 안의 상대 경로만', () => {
  it.each([
    ['/parent/events/12', true],
    ['/parent/events/12?from=kakao', true],
    ['/events', true],
    ['/admin/users', true]
  ])('%s → %s', (path, expected) => {
    expect(isSafeReturnPath(path)).toBe(expected);
  });

  it.each([
    ['/', '루트는 기억할 이유가 없다'],
    ['', '빈 값'],
    [null, 'null'],
    ['//evil.com/x', '프로토콜 상대 주소(오픈 리다이렉트)'],
    ['https://evil.com', '절대 URL'],
    ['/\\evil.com', '역슬래시로 위장'],
    ['/parent/ events', '공백'],
    ['/login', '로그인 화면'],
    ['/login?outcome=needsInvite', '로그인 화면(쿼리)'],
    ['/oauth/kakao/callback?code=x', '카카오 콜백'],
    ['/register-name', '이름 등록'],
    ['/invite/abc', '초대 랜딩'],
    ['/teacher-invite/abc', '선생님 초대 랜딩']
  ])('%s 는 거른다 (%s)', (path) => {
    expect(isSafeReturnPath(path)).toBe(false);
  });
});

describe('save / peek / consume', () => {
  it('저장한 경로를 그대로 돌려주고, consume 은 한 번만 준다', () => {
    expect(saveReturnTo('/parent/events/12', NOW)).toBe(true);

    expect(peekReturnTo(NOW)).toBe('/parent/events/12');
    expect(peekReturnTo(NOW)).toBe('/parent/events/12'); // peek 은 지우지 않는다
    expect(consumeReturnTo(NOW)).toBe('/parent/events/12');
    expect(peekReturnTo(NOW)).toBeNull();
  });

  it('안전하지 않은 경로는 저장하지 않는다', () => {
    expect(saveReturnTo('//evil.com', NOW)).toBe(false);
    expect(saveReturnTo('/login', NOW)).toBe(false);
    expect(localStorage.getItem('returnTo')).toBeNull();
  });

  it('한 시간이 지나면 버린다', () => {
    saveReturnTo('/parent/events/12', NOW);

    expect(peekReturnTo(NOW + 59 * 60 * 1000)).toBe('/parent/events/12');
    expect(peekReturnTo(NOW + 61 * 60 * 1000)).toBeNull();
    // 오래된 값은 읽는 김에 지운다
    expect(localStorage.getItem('returnTo')).toBeNull();
  });

  it('저장소에 이상한 값이 있어도 터지지 않고 지운다', () => {
    localStorage.setItem('returnTo', 'not json');
    expect(peekReturnTo(NOW)).toBeNull();
    expect(localStorage.getItem('returnTo')).toBeNull();

    localStorage.setItem('returnTo', JSON.stringify({ path: 'https://evil.com', at: NOW }));
    expect(peekReturnTo(NOW)).toBeNull();
  });

  it('clear 는 값이 없어도 조용하다', () => {
    expect(() => clearReturnTo()).not.toThrow();
  });
});

describe('returnPathFor — 그 역할이 열 수 있는 트리로만', () => {
  it('학부모는 학부모 트리만', () => {
    expect(returnPathFor('parent', '/parent/events/12')).toBe('/parent/events/12');
    expect(returnPathFor('parent', '/events')).toBeNull();
    expect(returnPathFor('parent', '/admin/users')).toBeNull();
  });

  it('선생님은 선생님 화면만 (관리자·학부모 트리는 홈으로)', () => {
    expect(returnPathFor('user', '/events')).toBe('/events');
    expect(returnPathFor('user', '/parent/events/12')).toBeNull();
    expect(returnPathFor('user', '/admin')).toBeNull();
    expect(returnPathFor('user', '/admin/users')).toBeNull();
  });

  it('관리자는 학부모 트리 말고는 어디든', () => {
    expect(returnPathFor('admin', '/admin/users')).toBe('/admin/users');
    expect(returnPathFor('admin', '/events')).toBe('/events');
    expect(returnPathFor('admin', '/parent/events/12')).toBeNull();
  });

  it('모르는 역할·빈 경로는 null', () => {
    expect(returnPathFor(undefined, '/events')).toBeNull();
    expect(returnPathFor('parent', null)).toBeNull();
    expect(returnPathFor('parent', '//evil.com')).toBeNull();
  });
});

describe('isEventSharePath', () => {
  it('학부모 이벤트 주소만 참', () => {
    expect(isEventSharePath('/parent/events/12')).toBe(true);
    expect(isEventSharePath('/parent/events/12?x=1')).toBe(true);
    expect(isEventSharePath('/parent/schedule')).toBe(false);
    expect(isEventSharePath('/parent/events/abc')).toBe(false);
    expect(isEventSharePath(null)).toBe(false);
  });
});
