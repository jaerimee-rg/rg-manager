import {
  kindOf, extensionOf, checkFile, partitionFiles, batchRanges, parseExifDate, sameFileKey, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
  MAX_FILES, TEACHER_MAX_FILES, MAX_FILES_PER_REQUEST
} from '../imagePrep';

const file = (name, size) => ({ name, size });

describe('extensionOf / kindOf', () => {
  it('대소문자를 가리지 않는다', () => {
    expect(extensionOf('IMG_1.JPG')).toBe('jpg');
    expect(kindOf('IMG_1.JPG')).toBe('image');
    expect(kindOf('VID.MOV')).toBe('video');
  });

  it('아이폰 HEIC 도 사진으로 본다', () => {
    expect(kindOf('IMG_4821.HEIC')).toBe('image');
  });

  it('그 밖의 형식은 모른다', () => {
    expect(kindOf('문서.pdf')).toBeNull();
    expect(kindOf('noext')).toBeNull();
  });
});

describe('checkFile — 서버와 같은 규칙으로 미리 거른다', () => {
  it('사진 25MB · 영상 500MB 를 넘으면 막는다', () => {
    expect(checkFile(file('a.jpg', MAX_IMAGE_BYTES + 1)).message).toContain('25MB');
    expect(checkFile(file('a.mov', MAX_VIDEO_BYTES + 1)).message).toContain('500MB');
  });

  it('사진 한도를 넘는 크기도 영상이면 통과한다', () => {
    expect(checkFile(file('a.mp4', MAX_IMAGE_BYTES + 1)).ok).toBe(true);
  });

  it('사진·영상이 아니면 막는다', () => {
    expect(checkFile(file('문서.pdf', 100)).message).toContain('사진·영상');
  });

  it('크기를 알 수 없으면 막는다', () => {
    expect(checkFile(file('a.jpg', 0)).ok).toBe(false);
  });
});

describe('sameFileKey — 서버(mediaValidation.js)와 같은 규칙', () => {
  it('이름과 크기가 둘 다 같아야 같은 파일이다', () => {
    expect(sameFileKey('a.jpg', 1000)).toBe(sameFileKey('a.jpg', 1000));
    expect(sameFileKey('a.jpg', 1000)).not.toBe(sameFileKey('a.jpg', 1001));
    expect(sameFileKey('a.jpg', 1000)).not.toBe(sameFileKey('b.jpg', 1000));
  });

  it('자모가 나뉜(NFD) 한글 이름도 같게 본다', () => {
    expect(sameFileKey('대회.jpg'.normalize('NFD'), 5)).toBe(sameFileKey('대회.jpg', 5));
  });
});

describe('partitionFiles', () => {
  it('통과와 거절을 나눈다', () => {
    const { accepted, rejected } = partitionFiles([
      file('a.jpg', 1000), file('문서.pdf', 100), file('v.mov', 2000)
    ]);

    expect(accepted.map((entry) => entry.file.name)).toEqual(['a.jpg', 'v.mov']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].message).toContain('사진·영상');
  });

  it('같은 파일(이름·크기)을 두 번 고르면 두 번째는 거절한다 — 이름만 같거나 크기만 같으면 다른 파일', () => {
    const { accepted, rejected } = partitionFiles([
      file('a.jpg', 1000), file('a.jpg', 1000), file('a.jpg', 999), file('b.jpg', 1000)
    ]);

    expect(accepted.map((entry) => [entry.file.name, entry.file.size])).toEqual([['a.jpg', 1000], ['a.jpg', 999], ['b.jpg', 1000]]);
    expect(rejected).toEqual([{ file: file('a.jpg', 1000), message: '같은 파일을 두 번 골랐어요' }]);
  });

  it('기본(학부모)은 한 번에 30개까지만 받고, 넘친 수를 센다', () => {
    const many = Array.from({ length: 40 }, (_, i) => file(`${i}.jpg`, 100));
    const { accepted, rejected, overflow } = partitionFiles(many);

    expect(MAX_FILES).toBe(30);
    expect(accepted).toHaveLength(30);
    expect(accepted[29].file.name).toBe('29.jpg');
    expect(rejected).toEqual([]);
    expect(overflow).toBe(10);
  });

  it('선생님은 한 번에 500개까지 받는다', () => {
    const many = Array.from({ length: 520 }, (_, i) => file(`${i}.jpg`, 100));
    const { accepted, overflow } = partitionFiles(many, TEACHER_MAX_FILES);

    expect(TEACHER_MAX_FILES).toBe(500);
    expect(accepted).toHaveLength(500);
    expect(overflow).toBe(20);
  });

  it('거절된 파일(형식·같은 파일)은 한도를 차지하지 않는다', () => {
    const { accepted, rejected, overflow } = partitionFiles([
      file('문서.pdf', 1), file('a.jpg', 1), file('a.jpg', 1), file('b.jpg', 1), file('c.jpg', 1), file('메모.txt', 1)
    ], 2);

    expect(accepted.map((entry) => entry.file.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(rejected.map((entry) => entry.file.name)).toEqual(['문서.pdf', 'a.jpg', '메모.txt']);
    expect(overflow).toBe(1);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(partitionFiles(null)).toEqual({ accepted: [], rejected: [], overflow: 0 });
  });
});

describe('batchRanges', () => {
  it('세션 요청 하나에 서버 한도(30)만큼씩 나눈다', () => {
    expect(MAX_FILES_PER_REQUEST).toBe(30);
    expect(batchRanges(65)).toEqual([[0, 30], [30, 60], [60, 65]]);
    expect(batchRanges(30)).toEqual([[0, 30]]);
    expect(batchRanges(1)).toEqual([[0, 1]]);
  });

  it('선생님 한도(500)도 빠짐없이 나눈다', () => {
    const ranges = batchRanges(TEACHER_MAX_FILES);
    expect(ranges).toHaveLength(17);
    expect(ranges.every(([from, to]) => to - from <= MAX_FILES_PER_REQUEST)).toBe(true);
    expect(ranges.reduce((sum, [from, to]) => sum + (to - from), 0)).toBe(TEACHER_MAX_FILES);
  });

  it('0개면 요청하지 않는다', () => {
    expect(batchRanges(0)).toEqual([]);
  });
});

describe('parseExifDate', () => {
  it('EXIF 형식을 ISO 로 바꾼다', () => {
    const iso = parseExifDate('2026:09:12 10:24:31');
    expect(new Date(iso).getFullYear()).toBe(2026);
    expect(new Date(iso).getMonth()).toBe(8);
    expect(new Date(iso).getDate()).toBe(12);
  });

  it('형식이 아니면 null', () => {
    expect(parseExifDate('2026-09-12')).toBeNull();
    expect(parseExifDate(null)).toBeNull();
    expect(parseExifDate('')).toBeNull();
  });
});
