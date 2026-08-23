import {
  MAX_FILE_BYTES,
  ALLOWED_EXTENSIONS,
  getExtension,
  lookupType,
  isAllowedFilename,
  sanitizeFilename
} from '../faqFileTypes.js';

describe('getExtension', () => {
  it('마지막 점 뒤를 소문자로 돌려준다', () => {
    expect(getExtension('수업안내.PDF')).toBe('pdf');
    expect(getExtension('a.b.c.html')).toBe('html');
  });

  it('확장자가 없으면 빈 문자열이다', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('')).toBe('');
  });
});

describe('isAllowedFilename', () => {
  it('요청하신 html, pdf 를 허용한다', () => {
    expect(isAllowedFilename('공지.html')).toBe(true);
    expect(isAllowedFilename('공지.htm')).toBe(true);
    expect(isAllowedFilename('수업안내.pdf')).toBe(true);
  });

  it('이미지와 문서도 허용한다', () => {
    ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.docx', 'a.xlsx', 'a.txt'].forEach((f) =>
      expect(isAllowedFilename(f)).toBe(true)
    );
  });

  it('실행될 수 있는 형식은 막는다', () => {
    ['a.js', 'a.mjs', 'a.exe', 'a.sh', 'a.php', 'a.jsp'].forEach((f) =>
      expect(isAllowedFilename(f)).toBe(false)
    );
  });

  it('svg 는 막는다 (이미지처럼 보이지만 스크립트를 품을 수 있다)', () => {
    expect(isAllowedFilename('logo.svg')).toBe(false);
    expect(ALLOWED_EXTENSIONS).not.toContain('svg');
  });

  it('확장자가 없으면 막는다', () => {
    expect(isAllowedFilename('안내문')).toBe(false);
  });
});

describe('lookupType', () => {
  it('확장자에서 MIME 과 종류를 정한다 (브라우저가 보낸 타입은 믿지 않는다)', () => {
    expect(lookupType('a.html')).toMatchObject({ mime: 'text/html', kind: 'html' });
    expect(lookupType('a.pdf')).toMatchObject({ mime: 'application/pdf', kind: 'pdf' });
    expect(lookupType('a.jpg')).toMatchObject({ mime: 'image/jpeg', kind: 'image' });
  });
});

describe('sanitizeFilename', () => {
  it('경로를 벗어나려는 이름에서 파일 이름만 남긴다', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/tmp/a.pdf')).toBe('a.pdf');
    expect(sanitizeFilename('..\\..\\windows\\b.pdf')).toBe('b.pdf');
  });

  it('한글 파일 이름은 그대로 둔다', () => {
    expect(sanitizeFilename('수업 안내문.pdf')).toBe('수업 안내문.pdf');
  });

  it('제어문자와 경로에 쓸 수 없는 글자를 없앤다', () => {
    expect(sanitizeFilename('a\u0000b\u001fc<>:"|?*.pdf')).toBe('abc.pdf');
  });

  it('점만 있는 이름은 거부한다', () => {
    expect(sanitizeFilename('..')).toBe('');
    expect(sanitizeFilename('.')).toBe('');
    expect(sanitizeFilename('')).toBe('');
  });

  it('아주 긴 이름은 잘라낸다', () => {
    expect(sanitizeFilename('a'.repeat(300)).length).toBe(120);
  });
});

describe('MAX_FILE_BYTES', () => {
  it('Vercel 요청 본문 한도(4.5MB)보다 작다', () => {
    expect(MAX_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});
