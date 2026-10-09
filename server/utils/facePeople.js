/**
 * 앨범의 얼굴을 **사람별로** 묶는다 — 앨범 위 "얼굴 목록"(한 사람에 얼굴 하나)과 그 얼굴로 사진 거르기에 쓴다.
 * DB 를 모르는 순수 함수다. 데이터는 services/albumPeople.js 가 읽어 넘긴다.
 *
 * 묶는 순서:
 *   1) 학생 태그(manual · parent_confirmed · face)가 붙은 얼굴은 그 학생 무리로 — 기준 얼굴과 맞춰 본 결과라 가장 확실하다.
 *   2) 나머지 얼굴은 좋은 얼굴(크고 점수 높은 것)부터 하나씩, 가장 닮은 무리의 평균 얼굴과 코사인 거리가
 *      PERSON_JOIN_DISTANCE 이하면 그 무리로, 아니면 새 무리로.
 *   3) 평균이 서로 가까워진 무리끼리 합친다(먼저 온 얼굴 탓에 한 사람이 둘로 갈린 것을 잇는다).
 * 늘 지키는 것: **한 사진의 두 얼굴은 같은 무리가 될 수 없다**(한 사람이 한 사진에 두 번 나오지 않는다),
 * 학부모가 [아니에요] 로 뺀 사진(excluded)은 그 학생 무리에 들어가지 않는다, 서로 다른 학생 무리는 합치지 않는다.
 *
 * 임계값은 운영 사진(2026-10-09, 512차원 얼굴 38개)으로 정했다: 다른 사진의 얼굴 쌍 유사도는 0.4 아래(대부분)와
 * 0.5 위(같은 사람)로 갈렸고 0.4~0.5 에는 한 쌍도 없었다. 같은 사진 속 얼굴(확실히 다른 사람)은 0.4 를 넘지 않았다.
 * 그래서 유사도 0.5 = 거리 0.5 에서 가른다.
 */

export const PERSON_JOIN_DISTANCE = 0.5;

/** 같은 아이라고 믿을 수 있는 태그 — 후보(candidate)와 뺀 것(excluded)은 아니다 */
const PERSON_TAG_SOURCES = ['manual', 'parent_confirmed', 'face'];

const area = (box) => Math.max(0, Number(box?.w) || 0) * Math.max(0, Number(box?.h) || 0);

/** 표지·순서에 쓰는 얼굴 품질 — 크고 또렷한 얼굴일수록 높다 */
const quality = (face) => area(face.box) * (Number(face.score) || 0);

const toUnit = (descriptor) => {
  let norm = 0;
  for (let i = 0; i < descriptor.length; i += 1) norm += descriptor[i] * descriptor[i];
  norm = Math.sqrt(norm);
  if (!norm) return null;
  const unit = new Float64Array(descriptor.length);
  for (let i = 0; i < descriptor.length; i += 1) unit[i] = descriptor[i] / norm;
  return unit;
};

/** 무리의 평균 방향(합 벡터)과의 코사인 유사도 */
const similarityTo = (sum, unit) => {
  let dot = 0;
  let norm = 0;
  for (let i = 0; i < sum.length; i += 1) {
    dot += sum[i] * unit[i];
    norm += sum[i] * sum[i];
  }
  return norm ? dot / Math.sqrt(norm) : -1;
};

const byQuality = (a, b) => quality(b) - quality(a) || a.id - b.id;

/**
 * faces: [{ id, mediaId, box: {x,y,w,h}, score, descriptor: Float32Array | null }]
 * tags:  [{ mediaId, studentId, source, faceId }]
 * → [{ key, studentId, faceIds, mediaIds, photoCount, cover: { faceId, mediaId, box } }]
 *    사진 많은 사람부터. key = 'p' + 무리에서 가장 작은 얼굴 id — 같은 데이터면 늘 같은 값이라
 *    목록을 받은 뒤 그 key 로 거를 때 다시 묶어도 같은 사람을 가리킨다.
 *    mediaIds 에는 얼굴 없이 학생 태그만 붙은 사진(선생님이 손으로 붙인 것)도 들어간다.
 */
export const groupFaces = (faces = [], tags = [], { joinDistance = PERSON_JOIN_DISTANCE } = {}) => {
  const usable = faces
    .map((face) => ({ ...face, unit: face.descriptor ? toUnit(face.descriptor) : null }))
    .filter((face) => face.unit);
  if (!usable.length) return [];
  // 길이가 다른 값(예전 모델)이 섞여도 가장 많은 길이로 — 맨 앞 얼굴 하나가 나머지를 다 빼 버리지 않게
  const lengths = new Map();
  usable.forEach((face) => lengths.set(face.unit.length, (lengths.get(face.unit.length) || 0) + 1));
  const dimension = [...lengths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const sameDimension = usable.filter((face) => face.unit.length === dimension);

  // 얼굴 → 학생 (manual > parent_confirmed > face), 사진 × 학생 → 뺐음
  const rank = (source) => PERSON_TAG_SOURCES.indexOf(source);
  const studentOfFace = new Map();
  const excluded = new Set();
  const taggedMedia = new Map();   // studentId → Set(mediaId)
  for (const tag of tags) {
    if (tag.source === 'excluded') { excluded.add(`${tag.mediaId}:${tag.studentId}`); continue; }
    if (rank(tag.source) < 0) continue;
    if (!taggedMedia.has(tag.studentId)) taggedMedia.set(tag.studentId, new Set());
    taggedMedia.get(tag.studentId).add(tag.mediaId);
    if (tag.faceId == null) continue;
    const previous = studentOfFace.get(tag.faceId);
    if (!previous || rank(tag.source) < rank(previous.source)) studentOfFace.set(tag.faceId, tag);
  }

  const groups = [];
  const newGroup = (studentId = null) => {
    const group = { studentId, faces: [], mediaIds: new Set(), sum: new Float64Array(dimension) };
    groups.push(group);
    return group;
  };
  const add = (group, face) => {
    group.faces.push(face);
    group.mediaIds.add(face.mediaId);
    for (let i = 0; i < dimension; i += 1) group.sum[i] += face.unit[i];
  };
  const blocked = (group, mediaIds) => [...mediaIds].some((mediaId) => (
    group.mediaIds.has(mediaId) || (group.studentId != null && excluded.has(`${mediaId}:${group.studentId}`))
  ));

  // 1) 학생 태그가 붙은 얼굴
  const ordered = [...sameDimension].sort(byQuality);
  const studentGroups = new Map();
  const rest = [];
  for (const face of ordered) {
    const tag = studentOfFace.get(face.id);
    if (!tag) { rest.push(face); continue; }
    const group = studentGroups.get(tag.studentId) || newGroup(tag.studentId);
    studentGroups.set(tag.studentId, group);
    // 한 사진에서 같은 학생으로 두 얼굴이 태그됐으면(손 태그 실수) 두 번째는 닮은 무리를 따로 찾는다
    if (group.mediaIds.has(face.mediaId)) rest.push(face);
    else add(group, face);
  }

  // 2) 나머지 — 가장 닮은 무리로, 아니면 새 무리
  for (const face of rest) {
    let best = null;
    for (const group of groups) {
      if (blocked(group, [face.mediaId])) continue;
      const similarity = similarityTo(group.sum, face.unit);
      if (1 - similarity <= joinDistance && (!best || similarity > best.similarity)) best = { group, similarity };
    }
    add(best ? best.group : newGroup(), face);
  }

  // 3) 가까워진 무리끼리 합치기 — 가장 가까운 쌍부터 하나씩.
  // 무리 합 벡터끼리의 내적을 표로 들고, 합칠 때는 그 줄만 더한다(dot(a+b, c) = dot(a,c) + dot(b,c)).
  // 매번 512차원을 다시 곱하면 무리가 수백 개일 때 수십 초가 걸렸다(얼굴 3,000개 실험: 19.6초 → 표로 1초 남짓).
  const count = groups.length;
  const dot = (a, b) => {
    let total = 0;
    for (let k = 0; k < dimension; k += 1) total += a[k] * b[k];
    return total;
  };
  const dots = Array.from({ length: count }, () => new Float64Array(count));
  for (let i = 0; i < count; i += 1) {
    for (let j = i; j < count; j += 1) {
      const value = dot(groups[i].sum, groups[j].sum);
      dots[i][j] = value;
      dots[j][i] = value;
    }
  }
  const alive = groups.map(() => true);
  for (;;) {
    let best = null;
    for (let i = 0; i < count; i += 1) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < count; j += 1) {
        if (!alive[j]) continue;
        const a = groups[i];
        const b = groups[j];
        if (a.studentId != null && b.studentId != null) continue;
        const norms = dots[i][i] * dots[j][j];
        const similarity = norms > 0 ? dots[i][j] / Math.sqrt(norms) : -1;
        if (1 - similarity > joinDistance || (best && similarity <= best.similarity)) continue;
        if (blocked(a, b.mediaIds) || blocked(b, a.mediaIds)) continue;
        best = { i, j, similarity };
      }
    }
    if (!best) break;
    const keepFirst = groups[best.i].studentId != null || groups[best.j].studentId == null;
    const into = keepFirst ? best.i : best.j;
    const from = keepFirst ? best.j : best.i;
    groups[from].faces.forEach((face) => add(groups[into], face));
    for (let k = 0; k < count; k += 1) {
      if (!alive[k] || k === into || k === from) continue;
      const value = dots[into][k] + dots[from][k];
      dots[into][k] = value;
      dots[k][into] = value;
    }
    dots[into][into] += 2 * dots[into][from] + dots[from][from];
    alive[from] = false;
  }
  const merged = groups.filter((_, index) => alive[index]);

  return merged
    .map((group) => {
      const faceIds = group.faces.map((face) => face.id).sort((a, b) => a - b);
      const mediaIds = new Set(group.mediaIds);
      if (group.studentId != null) (taggedMedia.get(group.studentId) || []).forEach((mediaId) => mediaIds.add(mediaId));
      const cover = [...group.faces].sort(byQuality)[0];
      return {
        key: `p${faceIds[0]}`,
        studentId: group.studentId,
        faceIds,
        mediaIds: [...mediaIds].sort((a, b) => a - b),
        photoCount: mediaIds.size,
        cover: { faceId: cover.id, mediaId: cover.mediaId, box: cover.box }
      };
    })
    .sort((a, b) => b.photoCount - a.photoCount || a.faceIds[0] - b.faceIds[0]);
};

export default { PERSON_JOIN_DISTANCE, groupFaces };
