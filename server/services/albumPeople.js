import pool from '../database.js';
import EventMedia from '../models/EventMedia.js';
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
  return peopleOf(faces, tags);
};

/**
 * 여러 앨범의 얼굴을 **함께** 묶는다 — 선생님 사진 메뉴의 "전체 사진"(모든 폴더). 앨범마다 따로 묶으면 같은 아이가
 * 폴더 수만큼 나오므로 한 번에 묶어 한 아이 = 얼굴 하나로 만든다. 묶는 규칙·key 는 albumPeople 과 같다.
 * mediaIds 는 여러 앨범에 걸친다(사진 id 는 앨범을 넘어 하나뿐이다).
 */
export const teacherPeople = async (eventIds, { includeHidden = false } = {}) => {
  if (!eventIds?.length) return [];
  const [faces, tags] = await Promise.all([
    MediaFace.listForAlbums(eventIds, { includeHidden }),
    MediaTag.listForAlbums(eventIds, { includeHidden })
  ]);
  return peopleOf(faces, tags);
};

const peopleOf = (faces, tags) => {
  const fileOf = new Map(faces.map((face) => [face.mediaId, face.driveFileId]));
  return groupFaces(faces, tags).map((person) => ({
    ...person,
    coverUrl: faceCoverUrl(fileOf.get(person.cover.mediaId), person.cover.box)
  }));
};

/** ?person=<key> → 그 사람(없으면 null — 그 사이 사진이 지워졌거나 다시 분석돼 묶음이 바뀌었다) */
export const findPerson = (people, key) => (key ? people.find((person) => person.key === String(key)) || null : null);

/**
 * 얼굴 목록에서 한 사람을 뺀다 — 앨범 사진에 찍힌 관계없는 사람(관중·다른 팀 등)을 선생님이 지울 때.
 * 그 사람의 얼굴(media_faces)과 그 얼굴로 붙은 자동 태그만 지운다. **사진은 그대로**, 선생님이 붙인 태그·학부모의
 * 맞아요/아니에요도 그대로다. 얼굴이 하나도 안 남은 사진은 'none' 이 되고 분석 버전은 남겨 자동 분석이 다시 찾지 않는다.
 * 분석 방식이 바뀌어(FACE_ANALYZER_VERSION 을 올려) 앨범을 다시 분석하면 그때는 이 얼굴들도 다시 나온다.
 *
 * **등록된 아이로 묶인 사람(studentId 가 있는 무리)은 빼지 않는다** — 빼면 그 아이의 "우리 아이만 보기" 가 말없이 줄고
 * 되돌릴 길이 없다(blocked: 'student_person'). 선생님이 본 그 사람인지도 확인한다: 화면이 본 사진 수(seenPhotoCount)가
 * 지금 다시 묶은 사진 수와 다르면 그 사이 묶음이 바뀐 것이라 아무것도 지우지 않는다(blocked: 'person_changed').
 *
 * 한 트랜잭션: 태그 → 얼굴 → 사진별 얼굴 수. 태그를 먼저 지운다(얼굴을 먼저 지우면 "faceId" 가 NULL 이 돼 못 찾는다).
 * → { removedFaces, photos, removedTags } · { blocked } · 그 사이 묶음이 바뀌어 없는 사람이면 null
 */
export const removePerson = async (eventId, key, { seenPhotoCount } = {}) => {
  const person = findPerson(await albumPeople(eventId, { includeHidden: true }), key);
  if (!person) return null;
  if (person.studentId != null) return { blocked: 'student_person' };
  if (!Number.isInteger(seenPhotoCount) || seenPhotoCount !== person.photoCount) return { blocked: 'person_changed' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removedTags = await MediaTag.removeAutoTagsForFaces(person.faceIds, client);
    const mediaIds = await MediaFace.deleteForAlbum(person.faceIds, eventId, client);
    const photos = [...new Set(mediaIds)];
    await EventMedia.refreshFaceCounts(photos, client);
    await client.query('COMMIT');
    return { removedFaces: mediaIds.length, photos: photos.length, removedTags };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

/**
 * 화면으로 내보내는 한 사람 — **화이트리스트**. 선생님과 학부모가 같은 모양을 받는다.
 * 얼굴을 잘라 그릴 사진 주소와 상자, 사진 수만 — 이름·학생 id·특징값·사진 id 목록은 보내지 않는다
 * (학부모에게 다른 아이를 가리키는 값이 나가지 않게, 2026-10-09 앨범의 모든 얼굴을 학부모에게도 보여 주기로 하면서 정한 선).
 * mine 은 학부모 화면에서 "우리 아이" 를 앞에 세우는 데만 쓴다.
 * removable 은 선생님 화면에만(teacher: true) — 등록된 아이로 묶인 사람은 목록에서 뺄 수 없다(removePerson).
 */
export const toPersonView = (person, { myStudentIds = null, teacher = false } = {}) => ({
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
  ...(myStudentIds ? { mine: person.studentId != null && myStudentIds.includes(person.studentId) } : {}),
  ...(teacher ? { removable: person.studentId == null } : {})
});

/** 학부모 목록 순서 — 우리 아이 먼저, 그다음 사진 많은 사람부터(groupFaces 순서 그대로) */
export const parentPeopleOrder = (views) => [...views].sort((a, b) => Number(b.mine) - Number(a.mine));

export default { albumPeople, teacherPeople, findPerson, removePerson, toPersonView, parentPeopleOrder };
