import {
  dayKeyOf, formatDayLabel, formatTime, groupByDay,
  applyTypeFilter, countsOf, uploaderLabel, albumSummaryText
} from '../albumFilter';

const media = (overrides) => ({ id: 1, kind: 'image', uploader: 'teacher', takenAt: '2026-09-12T10:24:00', ...overrides });

describe('dayKeyOf / formatDayLabel', () => {
  it('찍은 날짜를 하루 단위로 묶는 열쇠를 만든다', () => {
    expect(dayKeyOf('2026-09-12T23:59:00')).toBe('2026-09-12');
  });

  it('보기 좋은 날짜 이름을 만든다', () => {
    expect(formatDayLabel('2026-09-12')).toBe('9/12(토)');
  });

  it('이상한 값에도 터지지 않는다', () => {
    expect(dayKeyOf('언젠가')).toBe('');
    expect(formatDayLabel('언젠가')).toBe('언젠가');
    expect(formatTime(null)).toBe('');
  });
});

describe('groupByDay', () => {
  it('날짜별로 묶고 최신을 위에 둔다', () => {
    const groups = groupByDay([
      media({ id: 1, takenAt: '2026-08-10T09:00:00' }),
      media({ id: 2, takenAt: '2026-09-12T10:00:00' }),
      media({ id: 3, takenAt: '2026-09-12T14:00:00' })
    ]);

    expect(groups.map((g) => g.dayKey)).toEqual(['2026-09-12', '2026-08-10']);
    expect(groups[0].items.map((m) => m.id)).toEqual([2, 3]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(groupByDay(null)).toEqual([]);
  });
});

describe('applyTypeFilter', () => {
  const items = [
    media({ id: 1, kind: 'image', uploader: 'teacher' }),
    media({ id: 2, kind: 'video', uploader: 'me' }),
    media({ id: 3, kind: 'image', uploader: 'me' })
  ];

  it('사진만', () => expect(applyTypeFilter(items, 'photo').map((m) => m.id)).toEqual([1, 3]));
  it('영상만', () => expect(applyTypeFilter(items, 'video').map((m) => m.id)).toEqual([2]));
  it('내가 올린 것만', () => expect(applyTypeFilter(items, 'uploaded').map((m) => m.id)).toEqual([2, 3]));
  it('전체는 그대로', () => expect(applyTypeFilter(items, 'all')).toHaveLength(3));
  it('빈 입력에도 터지지 않는다', () => expect(applyTypeFilter(null, 'all')).toEqual([]));
});

describe('countsOf', () => {
  it('칩에 붙일 개수를 센다', () => {
    expect(countsOf([
      media({ kind: 'image' }),
      media({ kind: 'video', uploader: 'me' })
    ])).toEqual({ all: 2, photo: 1, video: 1, uploaded: 1 });
  });
});

describe('uploaderLabel', () => {
  it('다른 학부모의 이름은 드러내지 않는다', () => {
    expect(uploaderLabel('teacher')).toBe('선생님');
    expect(uploaderLabel('me')).toBe('내가 올림');
    expect(uploaderLabel('parent')).toBe('학부모');
  });
});

describe('albumSummaryText', () => {
  it('영상이 없으면 사진만 적는다', () => {
    expect(albumSummaryText({ images: 27, videos: 0 })).toBe('사진 27');
    expect(albumSummaryText({ images: 27, videos: 3 })).toBe('사진 27 · 영상 3');
  });
});
