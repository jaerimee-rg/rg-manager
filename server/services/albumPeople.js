import MediaFace from '../models/MediaFace.js';
import MediaTag from '../models/MediaTag.js';
import { groupFaces } from '../utils/facePeople.js';
import { faceCoverUrl } from '../utils/mediaSerializer.js';

/**
 * 앨범 위 "얼굴 목록" — 앨범에 나온 사람마다 얼굴 하나, 누르면 그 사람이 나온 사진만.
 *
 * 묶음은 저장하지 않고 읽을 때마다 계산한다(utils/facePeople.js). 앨범 하나에 얼굴 수백 개라 수십 ms 이고,
 * 사진을 새로 분석하거나 태그가 바뀌면 다음 읽기에 바로 반영된다. 목록의 key 로 거를 때도 다시 묶는데,
 * 그 사이 데이터가 같으면 같은 key 가 같은 사람을 가리킨다(key = 무리에서 가장 작은 얼굴 id).
 *
 * includeHidden — 선생님은 숨긴 사진까지 본다. 학부모는 숨긴 사진의 얼굴을 묶음에도 표지에도 쓰지 않는다.
 */
export const albumPeople = async (eventId, { includeHidden = false } = {}) => {
  const [faces, tags] = await Promise.all([
    MediaFace.listForAlbum(eventId, { includeHidden }),
    MediaTag.listForAlbum(eventId, { includeHidden })
  ]);
  const fileOf = new Map(faces.map((face) => [face.mediaId, face.driveFileId]));
  return groupFaces(faces, tags).map((person) => ({
    ...person,
    coverUrl: faceCoverUrl(fileOf.get(person.cover.mediaId), person.cover.box)
  }));
};

/** ?person=<key> → 그 사람(없으면 null — 그 사이 사진이 지워졌거나 다시 분석돼 묶음이 바뀌었다) */
export const findPerson = (people, key) => (key ? people.find((person) => person.key === String(key)) || null : null);

/**
 * 화면으로 내보내는 한 사람 — **화이트리스트**. 선생님과 학부모가 같은 모양을 받는다.
 * 얼굴을 잘라 그릴 사진 주소와 상자, 사진 수만 — 이름·학생 id·특징값·사진 id 목록은 보내지 않는다
 * (학부모에게 다른 아이를 가리키는 값이 나가지 않게, 2026-10-09 앨범의 모든 얼굴을 학부모에게도 보여 주기로 하면서 정한 선).
 * mine 은 학부모 화면에서 "우리 아이" 를 앞에 세우는 데만 쓴다.
 */
export const toPersonView = (person, { myStudentIds = null } = {}) => ({
  key: person.key,
  photoCount: person.photoCount,
  cover: {
    url: person.coverUrl,
    box: {
      x: Number(person.cover.box?.x) || 0,
      y: Number(person.cover.box?.y) || 0,
      w: Number(person.cover.box?.w) || 0,
      h: Number(person.cover.box?.h) || 0
    }
  },
  ...(myStudentIds ? { mine: person.studentId != null && myStudentIds.includes(person.studentId) } : {})
});

/** 학부모 목록 순서 — 우리 아이 먼저, 그다음 사진 많은 사람부터(groupFaces 순서 그대로) */
export const parentPeopleOrder = (views) => [...views].sort((a, b) => Number(b.mine) - Number(a.mine));

export default { albumPeople, findPerson, toPersonView, parentPeopleOrder };
