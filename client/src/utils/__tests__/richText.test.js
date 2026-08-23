import {
  parseRichText,
  displayNameForUrl,
  fileKindForUrl,
  buildFileMarkdown
} from '../richText';

const BASE = 'https://vrzsommyxtvdqlpoufes.supabase.co/storage/v1/object/public/faq-files';
const PDF = `${BASE}/3/8f1c-uuid/%EC%88%98%EC%97%85%EC%95%88%EB%82%B4.pdf`;
const HTML = `${BASE}/3/9a2d-uuid/notice.html`;

describe('displayNameForUrl', () => {
  it('업로드한 파일은 원래 파일 이름으로 보여준다', () => {
    expect(displayNameForUrl(PDF)).toBe('수업안내.pdf');
    expect(displayNameForUrl(HTML)).toBe('notice.html');
  });

  it('업로드한 파일이 아니면 주소를 그대로 보여준다 (이름을 지어내지 않는다)', () => {
    expect(displayNameForUrl('https://example.com/a/b')).toBe('https://example.com/a/b');
  });
});

describe('fileKindForUrl', () => {
  it('확장자로 종류를 가른다', () => {
    expect(fileKindForUrl(HTML)).toBe('html');
    expect(fileKindForUrl(PDF)).toBe('pdf');
    expect(fileKindForUrl(`${BASE}/1/x/a.png`)).toBe('image');
    expect(fileKindForUrl(`${BASE}/1/x/a.docx`)).toBe('file');
  });

  it('우리 파일이 아니면 종류가 없다', () => {
    expect(fileKindForUrl('https://example.com/a.pdf')).toBeNull();
  });
});

describe('parseRichText', () => {
  it('[이름](주소) 를 이름이 보이는 링크로 바꾼다', () => {
    const segments = parseRichText(`안내문은 [수업안내.pdf](${PDF}) 를 봐주세요.`);

    expect(segments).toEqual([
      { type: 'text', value: '안내문은 ' },
      { type: 'link', label: '수업안내.pdf', url: PDF, kind: 'pdf' },
      { type: 'text', value: ' 를 봐주세요.' }
    ]);
  });

  it('주소만 붙여넣어도 파일 이름으로 보여준다', () => {
    const segments = parseRichText(`안내문: ${PDF}`);

    expect(segments[1]).toEqual({
      type: 'link',
      label: '수업안내.pdf',
      url: PDF,
      kind: 'pdf'
    });
  });

  it('주소 끝의 문장부호는 링크에 넣지 않는다', () => {
    const segments = parseRichText(`여기 있습니다: ${PDF}.`);
    const link = segments.find((s) => s.type === 'link');

    expect(link.url).toBe(PDF);
    expect(segments[segments.length - 1]).toEqual({ type: 'text', value: '.' });
  });

  it('[이름](주소) 안의 주소를 또 링크로 만들지 않는다', () => {
    const segments = parseRichText(`[수업안내.pdf](${PDF})`);

    expect(segments.filter((s) => s.type === 'link')).toHaveLength(1);
  });

  it('링크가 여러 개면 순서를 지킨다', () => {
    const text = `[안내](${PDF}) 와 [공지](${HTML}) 입니다`;
    const links = parseRichText(text).filter((s) => s.type === 'link');

    expect(links.map((l) => l.label)).toEqual(['안내', '공지']);
    expect(links.map((l) => l.kind)).toEqual(['pdf', 'html']);
  });

  it('줄바꿈을 포함한 원문을 그대로 보존한다', () => {
    const text = `수업 안내\n\n- 월요일\n- 수요일`;
    const segments = parseRichText(text);

    expect(segments.map((s) => s.value).join('')).toBe(text);
  });

  it('javascript: 주소는 링크로 만들지 않는다', () => {
    // eslint-disable-next-line no-script-url
    const text = '[누르세요](javascript:alert(1))';
    const segments = parseRichText(text);

    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('data: 주소도 링크로 만들지 않는다', () => {
    const segments = parseRichText('[열기](data:text/html;base64,PHNjcmlwdD4=)');

    expect(segments.every((s) => s.type === 'text')).toBe(true);
  });

  it('링크가 없으면 글자 조각 하나만 돌려준다', () => {
    expect(parseRichText('평일 오후 3시부터입니다.')).toEqual([
      { type: 'text', value: '평일 오후 3시부터입니다.' }
    ]);
  });

  it('빈 값은 빈 목록을 돌려준다', () => {
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText(null)).toEqual([]);
    expect(parseRichText(undefined)).toEqual([]);
  });
});

describe('buildFileMarkdown', () => {
  it('FAQ 답변에 붙여넣을 형식을 만든다', () => {
    expect(buildFileMarkdown('수업안내.pdf', PDF)).toBe(`[수업안내.pdf](${PDF})`);
  });

  it('만든 형식은 다시 파싱하면 파일 이름으로 보인다', () => {
    const markdown = buildFileMarkdown('수업안내.pdf', PDF);
    const [link] = parseRichText(markdown);

    expect(link).toEqual({ type: 'link', label: '수업안내.pdf', url: PDF, kind: 'pdf' });
  });
});

describe('우리 서버를 거치는 HTML 링크 (상대 경로)', () => {
  const VIEW = `/api/faq-files/5/view?name=${encodeURIComponent('수업 안내.html')}`;

  it('상대 경로 링크도 파일로 알아본다', () => {
    const [seg] = parseRichText(`[수업 안내.html](${VIEW})`);

    expect(seg).toEqual({
      type: 'link',
      label: '수업 안내.html',
      url: VIEW,
      kind: 'html'
    });
  });

  it('주소만 붙여넣어도 ?name= 에서 원래 이름을 읽는다', () => {
    expect(displayNameForUrl(VIEW)).toBe('수업 안내.html');
    expect(fileKindForUrl(VIEW)).toBe('html');
  });

  it('저장소 주소의 ?name= 도 원래 한글 이름을 보여준다', () => {
    const url = `${BASE}/1/uuid/file.pdf?name=${encodeURIComponent('참가신청서.pdf')}`;

    expect(displayNameForUrl(url)).toBe('참가신청서.pdf');
    expect(fileKindForUrl(url)).toBe('pdf');
  });

  it('/api 로 시작해도 우리 파일 경로가 아니면 링크로 만들지 않는다', () => {
    expect(parseRichText('/api/students/3 을 보세요').every((s) => s.type === 'text')).toBe(true);
  });
});
