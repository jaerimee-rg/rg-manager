/**
 * 갤러리의 계산 로직 (순수 함수).
 * 화면과 떼어 두고 단위 테스트한다 (parentSchedule.js 와 같은 규칙).
 */

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * '2026-09-12T10:24:00.000Z' → '2026-09-12' (그 기기의 하루 기준)
 * new Date(null) 은 1970년이 되어 버리므로 빈 값은 먼저 걸러낸다.
 */
export const dayKeyOf = (takenAt) => {
  if (!takenAt) return '';
  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatDayLabel = (dayKey) => {
  const date = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return `${date.getMonth() + 1}/${date.getDate()}(${DOW[date.getDay()]})`;
};

export const formatTime = (takenAt) => {
  if (!takenAt) return '';
  const date = new Date(takenAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * 찍은 날짜별로 묶는다. 최신 날짜가 위로 온다.
 * → [{ dayKey, label, items }]
 */
export const groupByDay = (items) => {
  const groups = new Map();
  for (const item of items || []) {
    const key = dayKeyOf(item.takenAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, list]) => ({ dayKey, label: formatDayLabel(dayKey), items: list }));
};

/**
 * 화면 안에서 한 번 더 거르는 칩 (서버가 이미 우리 아이만은 걸러 준다).
 * filter: all | photo | video | uploaded
 */
export const applyTypeFilter = (items, filter) => {
  if (!items) return [];
  if (filter === 'photo') return items.filter((item) => item.kind === 'image');
  if (filter === 'video') return items.filter((item) => item.kind === 'video');
  if (filter === 'uploaded') return items.filter((item) => item.uploader === 'me');
  return items;
};

/** 칩에 붙일 개수 */
export const countsOf = (items) => ({
  all: items?.length || 0,
  photo: (items || []).filter((item) => item.kind === 'image').length,
  video: (items || []).filter((item) => item.kind === 'video').length,
  uploaded: (items || []).filter((item) => item.uploader === 'me').length
});

/** 뷰어에 보여줄 업로더 표기 */
export const uploaderLabel = (uploader) => {
  if (uploader === 'teacher') return '선생님';
  if (uploader === 'me') return '내가 올림';
  return '학부모';
};

/** 앨범 카드 부제: "사진 27 · 영상 3 · 우리 아이 11장" */
export const albumSummaryText = (counts = {}) => {
  const parts = [`사진 ${counts.images || 0}`];
  if (counts.videos) parts.push(`영상 ${counts.videos}`);
  return parts.join(' · ');
};

export default {
  dayKeyOf, formatDayLabel, formatTime, groupByDay,
  applyTypeFilter, countsOf, uploaderLabel, albumSummaryText
};
