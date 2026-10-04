import {
  hasClipboardText, imageFromClipboard, isTextEntry, pastedProductImage, withImageName
} from '../clipboardImage';

const clipboard = ({ files = [], text = '', items = true } = {}) => ({
  items: items ? files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })) : [],
  files,
  getData: (type) => (type === 'text/plain' ? text : '')
});

const png = (name = 'image.png') => new File(['img'], name, { type: 'image/png' });

describe('imageFromClipboard', () => {
  it('클립보드의 첫 사진 파일을 꺼낸다', () => {
    const photo = png('리본.png');
    expect(imageFromClipboard(clipboard({ files: [photo] }))).toBe(photo);
  });

  it('사진이 아닌 파일은 건너뛴다', () => {
    const pdf = new File(['%PDF'], '안내.pdf', { type: 'application/pdf' });
    const photo = png();
    expect(imageFromClipboard(clipboard({ files: [pdf, photo] }))).toBe(photo);
    expect(imageFromClipboard(clipboard({ files: [pdf] }))).toBeNull();
  });

  it('형식(type)이 비어 있어도 사진 확장자면 받는다', () => {
    const photo = new File(['img'], 'photo.JPG', { type: '' });
    expect(imageFromClipboard(clipboard({ files: [photo] }))).toBe(photo);
  });

  it('items 가 비어 있는 브라우저는 files 에서 찾는다', () => {
    const photo = png();
    expect(imageFromClipboard(clipboard({ files: [photo], items: false }))).toBe(photo);
  });

  it('글자만 있거나 클립보드가 없으면 null', () => {
    expect(imageFromClipboard(clipboard({ text: '리본' }))).toBeNull();
    expect(imageFromClipboard(undefined)).toBeNull();
  });
});

describe('withImageName', () => {
  it('이미 사진 확장자가 있으면 그대로 둔다', () => {
    const photo = png('image.png');
    expect(withImageName(photo)).toBe(photo);
  });

  it('이름이 없는 사진은 형식에 맞는 확장자를 붙인다', () => {
    const renamed = withImageName(new File(['img'], '', { type: 'image/webp' }));
    expect(renamed.name).toBe('pasted-image.webp');
    expect(renamed.type).toBe('image/webp');
  });

  it('허용하지 않는 형식(heic)은 이름을 붙이지 않아 고를 때와 같은 안내로 막힌다', () => {
    const heic = new File(['img'], 'image', { type: 'image/heic' });
    expect(withImageName(heic)).toBe(heic);
  });
});

describe('isTextEntry', () => {
  const el = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
  };

  it('글자 칸', () => {
    expect(isTextEntry(el('<input>'))).toBe(true);
    expect(isTextEntry(el('<input type="url">'))).toBe(true);
    expect(isTextEntry(el('<textarea></textarea>'))).toBe(true);
  });

  it('글자 칸이 아닌 것', () => {
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el('<input type="file">'))).toBe(false);
    expect(isTextEntry(el('<button>저장</button>'))).toBe(false);
    expect(isTextEntry(el('<select></select>'))).toBe(false);
    expect(isTextEntry(document.body)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('hasClipboardText', () => {
  it('공백뿐이면 글자가 없는 것으로 본다', () => {
    expect(hasClipboardText(clipboard({ text: '리본' }))).toBe(true);
    expect(hasClipboardText(clipboard({ text: '  ' }))).toBe(false);
    expect(hasClipboardText(undefined)).toBe(false);
  });
});

describe('pastedProductImage — 이 붙여넣기에서 사진을 가져갈지', () => {
  const input = () => document.createElement('input');

  it('글자 칸 밖에서는 사진을 가져간다 (글자가 같이 있어도)', () => {
    const photo = png();
    expect(pastedProductImage({ target: document.body, clipboardData: clipboard({ files: [photo], text: '셀' }) })).toBe(photo);
  });

  it('글자 칸에서도 사진만 있으면 가져간다 (스크린샷, 이미지 복사)', () => {
    const photo = png();
    expect(pastedProductImage({ target: input(), clipboardData: clipboard({ files: [photo] }) })).toBe(photo);
  });

  it('글자 칸에 글자와 사진이 함께 오면 글자가 먼저다 (엑셀 셀 등)', () => {
    expect(pastedProductImage({ target: input(), clipboardData: clipboard({ files: [png()], text: '리본 6m' }) })).toBeNull();
  });

  it('사진이 없으면 null', () => {
    expect(pastedProductImage({ target: document.body, clipboardData: clipboard({ text: '리본' }) })).toBeNull();
  });
});
