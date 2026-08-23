// FAQ 답변에 붙일 수 있는 파일 종류와 크기 제한.
// Vercel 서버리스 요청 본문 한도가 4.5MB 라 그 아래로 잡는다.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// 확장자를 신뢰의 기준으로 삼는다. 브라우저가 보내는 Content-Type 은 위조하기 쉽다.
const TYPES = [
  { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' },
  { ext: 'html', mime: 'text/html', kind: 'html' },
  { ext: 'htm', mime: 'text/html', kind: 'html' },
  { ext: 'txt', mime: 'text/plain', kind: 'text' },
  { ext: 'png', mime: 'image/png', kind: 'image' },
  { ext: 'jpg', mime: 'image/jpeg', kind: 'image' },
  { ext: 'jpeg', mime: 'image/jpeg', kind: 'image' },
  { ext: 'gif', mime: 'image/gif', kind: 'image' },
  { ext: 'webp', mime: 'image/webp', kind: 'image' },
  { ext: 'doc', mime: 'application/msword', kind: 'doc' },
  {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'doc'
  },
  { ext: 'xls', mime: 'application/vnd.ms-excel', kind: 'doc' },
  {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'doc'
  }
];

// svg 는 받지 않는다. 이미지처럼 보이지만 스크립트를 품을 수 있다.

export const ALLOWED_EXTENSIONS = TYPES.map((t) => t.ext);

export const getExtension = (filename = '') => {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

export const lookupType = (filename) => TYPES.find((t) => t.ext === getExtension(filename)) || null;

export const isAllowedFilename = (filename) => Boolean(lookupType(filename));

/**
 * 저장소 경로에 쓸 수 있게 파일명을 다듬는다.
 * 경로 조작(../), 슬래시, 제어문자를 없애고 길이를 제한한다.
 * 한글은 그대로 남긴다 (선생님이 알아볼 수 있어야 한다).
 */
export const sanitizeFilename = (filename = '') => {
  const base = String(filename)
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim();

  if (!base || base === '.' || base === '..') return '';
  return base.slice(0, 120);
};

/**
 * 저장소 키로 쓸 ASCII 이름을 만든다.
 *
 * Supabase Storage 는 키에 ASCII 만 허용한다 (한글·% 는 InvalidKey 로 거절).
 * 그래서 저장할 때 쓰는 이름과 사람에게 보여줄 이름을 분리한다.
 * 원래 이름은 DB(faq_files.filename)와 주소의 ?name= 에 그대로 남는다.
 */
export const toStorageSafeName = (filename) => {
  const ext = getExtension(filename);
  const base = filename.slice(0, filename.length - (ext ? ext.length + 1 : 0));

  const asciiBase = base
    .replace(/[^\x20-\x7E]/g, '')   // ASCII 밖(한글 등) 제거
    .replace(/[^\w .-]/g, '')        // 키에 안전한 글자만 남긴다
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  // 한글만으로 된 이름은 위에서 다 지워진다. 그때는 확장자만 살린다.
  return asciiBase ? `${asciiBase}.${ext}` : `file.${ext}`;
};
