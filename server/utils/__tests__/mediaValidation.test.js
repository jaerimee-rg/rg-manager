import {
  validateUpload,
  buildDriveName,
  sanitizeFolderName,
  defaultFolderName,
  kindFromMime,
  lookupType,
  getExtension,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES
} from '../mediaValidation.js';

describe('getExtension / lookupType', () => {
  it('대소문자를 가리지 않는다', () => {
    expect(getExtension('IMG_1234.JPG')).toBe('jpg');
    expect(lookupType('IMG_1234.JPG')).toEqual({ kind: 'image', mime: 'image/jpeg' });
  });

  it('확장자가 없으면 모르는 것으로 본다', () => {
    expect(getExtension('noext')).toBe('');
    expect(lookupType('noext')).toBeNull();
  });

  it('이름에 점이 여러 개면 마지막 것을 쓴다', () => {
    expect(getExtension('2026.09.12 대회.mp4')).toBe('mp4');
  });
});

describe('validateUpload', () => {
  it('사진을 통과시킨다', () => {
    expect(validateUpload({ name: 'IMG_1.jpg', size: 3 * 1024 * 1024 }))
      .toEqual({ ok: true, kind: 'image', mimeType: 'image/jpeg' });
  });

  it('영상을 통과시킨다', () => {
    expect(validateUpload({ name: 'VID.mov', size: 180 * 1024 * 1024 }))
      .toEqual({ ok: true, kind: 'video', mimeType: 'video/quicktime' });
  });

  it('iPhone HEIC 도 받는다', () => {
    expect(validateUpload({ name: 'IMG_4821.HEIC', size: 3 * 1024 * 1024 }).ok).toBe(true);
  });

  it('사진·영상이 아니면 이유를 준다', () => {
    expect(validateUpload({ name: '문서.pdf', size: 100 }))
      .toMatchObject({ ok: false, reason: 'type', message: '사진·영상만 올릴 수 있어요.' });
  });

  it('사진 25MB 를 넘으면 막는다', () => {
    expect(validateUpload({ name: 'big.jpg', size: MAX_IMAGE_BYTES + 1 }))
      .toMatchObject({ ok: false, reason: 'size', message: '사진은 25MB 까지예요.' });
  });

  it('영상 500MB 를 넘으면 막는다', () => {
    expect(validateUpload({ name: 'big.mov', size: MAX_VIDEO_BYTES + 1 }))
      .toMatchObject({ ok: false, reason: 'size', message: '영상은 500MB 까지예요.' });
  });

  it('사진 한도를 넘어도 영상 한도 안이면 영상은 통과한다', () => {
    expect(validateUpload({ name: 'v.mp4', size: MAX_IMAGE_BYTES + 1 }).ok).toBe(true);
  });

  it('크기를 알 수 없으면 막는다', () => {
    expect(validateUpload({ name: 'a.jpg', size: 0 }).reason).toBe('size');
    expect(validateUpload({ name: 'a.jpg' }).reason).toBe('size');
  });

  it('이름이 없거나 지나치게 길면 막는다', () => {
    expect(validateUpload({ name: '', size: 100 }).reason).toBe('name');
    expect(validateUpload({ name: `${'가'.repeat(300)}.jpg`, size: 100 }).reason).toBe('name');
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(validateUpload().ok).toBe(false);
  });
});

describe('buildDriveName', () => {
  it('날짜_올린사람_원본이름 으로 만든다', () => {
    expect(buildDriveName({ date: '2026-09-12', uploaderLabel: '하은', originalName: 'IMG_1234.jpg' }))
      .toBe('20260912_하은_IMG_1234.jpg');
  });

  it('Drive 가 싫어하는 문자를 지운다', () => {
    expect(buildDriveName({ date: '2026-09-12', uploaderLabel: 'a/b', originalName: 'x:y.jpg' }))
      .toBe('20260912_ab_x_y.jpg');
  });

  it('올린 사람을 모르면 학부모로 둔다', () => {
    expect(buildDriveName({ date: '2026-09-12', originalName: 'a.jpg' })).toBe('20260912_학부모_a.jpg');
  });

  it('빈 입력에도 이름을 만든다', () => {
    expect(buildDriveName({})).toBe('unknown_학부모_file');
  });
});

describe('sanitizeFolderName', () => {
  it('보통 이름은 통과한다', () => {
    expect(sanitizeFolderName('  2026-09-12 서울시 대회  ')).toEqual({ ok: true, name: '2026-09-12 서울시 대회' });
  });

  it('비어 있으면 막는다', () => {
    expect(sanitizeFolderName('   ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('100자를 넘으면 막는다', () => {
    expect(sanitizeFolderName('가'.repeat(101))).toMatchObject({ ok: false, reason: 'length' });
  });

  it('Drive 금지 문자를 막는다', () => {
    ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b'].forEach((name) => {
      expect(sanitizeFolderName(name)).toMatchObject({ ok: false, reason: 'chars' });
    });
  });

  it('눈에 보이지 않는 제어 문자를 막는다', () => {
    expect(sanitizeFolderName(`a${String.fromCharCode(7)}b`)).toMatchObject({ ok: false, reason: 'chars' });
  });
});

describe('defaultFolderName', () => {
  it('날짜와 이벤트 이름을 붙인다', () => {
    expect(defaultFolderName({ date: '2026-09-12', title: '2026 서울시 리듬체조 대회' }))
      .toBe('2026-09-12 2026 서울시 리듬체조 대회');
  });

  it('100자를 넘지 않는다', () => {
    expect(defaultFolderName({ date: '2026-09-12', title: '가'.repeat(200) })).toHaveLength(100);
  });
});

describe('kindFromMime', () => {
  it('MIME 으로도 종류를 안다', () => {
    expect(kindFromMime('image/jpeg')).toBe('image');
    expect(kindFromMime('video/mp4')).toBe('video');
    expect(kindFromMime('application/pdf')).toBeNull();
    expect(kindFromMime(null)).toBeNull();
  });
});
