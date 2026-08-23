// FAQ 답변 안의 링크를 찾아 화면에 보여줄 조각으로 나눈다.
//
// 답변 원문은 절대 바꾸지 않는다는 것이 이 앱의 규칙이라, 저장된 글자는 그대로 두고
// 보여줄 때만 링크로 바꾼다. 선생님이 파일 링크를 복사해 붙여넣는 형식은 두 가지다.
//   1. [수업안내.pdf](https://.../수업안내.pdf)  ← 파일 이름으로 보인다
//   2. https://.../수업안내.pdf                  ← 주소만 붙여넣어도 파일 이름으로 보인다

// [보이는 이름](주소) 형식. 우리 서버 경유 링크는 상대 경로라 /api/... 도 받는다.
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/api\/faq-files\/)[^\s)]+)\)/g;
// 주소만 있는 경우
const BARE_URL = /(?:https?:\/\/|\/api\/faq-files\/)[^\s<>[\]()]+/g;

// 주소 끝에 붙은 문장부호는 링크에서 뺀다 ("...pdf 를 봐주세요." 같은 문장 때문에)
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

// 업로드한 파일 주소인지.
// 저장소 공개 주소(.../faq-files/...)와 우리 서버 경유 주소(/api/faq-files/..) 모두 해당한다.
const isUploadedFileUrl = (url) => url.includes('/faq-files/');

/**
 * 주소에서 보여줄 이름을 뽑는다.
 * 업로드한 파일이면 마지막 경로 조각이 원래 파일 이름이다.
 * 그 외 주소는 주소를 그대로 보여준다 (엉뚱한 이름을 지어내지 않는다).
 */
export const displayNameForUrl = (url) => {
  if (!isUploadedFileUrl(url)) return url;

  try {
    // 상대 경로도 파싱할 수 있게 기준 주소를 준다.
    const parsed = new URL(url, 'https://placeholder.invalid');

    // 저장소 키에는 ASCII 만 넣을 수 있어(Supabase 제약) 한글 이름은 ?name= 에 담아 둔다.
    const original = parsed.searchParams.get('name');
    if (original) return original;

    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (!last) return url;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
};

// 파일 종류를 주소의 확장자로 판단한다 (채팅에서 HTML 만 바로 펼쳐 보여주기 위함).
export const fileKindForUrl = (url) => {
  if (!isUploadedFileUrl(url)) return null;

  const name = displayNameForUrl(url).toLowerCase();
  if (/\.(html?|htm)$/.test(name)) return 'html';
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
  return 'file';
};

/**
 * 글을 { type: 'text' } 와 { type: 'link' } 조각으로 나눈다.
 * http/https 만 링크로 만든다 (javascript: 같은 주소는 글자 그대로 남긴다).
 */
export const parseRichText = (text) => {
  if (typeof text !== 'string' || !text) return [];

  const found = [];

  // 1) [이름](주소) 를 먼저 찾는다. 안에 있는 주소가 2)에 또 잡히면 안 된다.
  for (const m of text.matchAll(MARKDOWN_LINK)) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      label: m[1],
      url: m[2]
    });
  }

  // 2) 남은 자리에서 주소만 있는 것을 찾는다.
  for (const m of text.matchAll(BARE_URL)) {
    const start = m.index;
    const overlaps = found.some((f) => start < f.end && start + m[0].length > f.start);
    if (overlaps) continue;

    const url = m[0].replace(TRAILING_PUNCTUATION, '');
    if (!url) continue;

    found.push({
      start,
      end: start + url.length,
      label: displayNameForUrl(url),
      url
    });
  }

  found.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;

  for (const link of found) {
    if (link.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, link.start) });
    }
    segments.push({
      type: 'link',
      label: link.label,
      url: link.url,
      kind: fileKindForUrl(link.url)
    });
    cursor = link.end;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  return segments;
};

// FAQ 답변에 붙여넣을 형식. 파일 이름으로 보이게 하려면 이 형식이어야 한다.
export const buildFileMarkdown = (filename, url) => `[${filename}](${url})`;
