import pool from '../database.js';
import EventMedia from '../models/EventMedia.js';
import MediaFace from '../models/MediaFace.js';
import MediaTag from '../models/MediaTag.js';
import FaceExclusion from '../models/FaceExclusion.js';
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
export const albumPeople = async (eventId, { includeHidden = false } = {}) => (
  peopleOf(await loadScope(eventId, { includeHidden }))
);

/**
 * 여러 앨범의 얼굴을 **함께** 묶는다 — 사진 메뉴의 "전체 사진"(모든 폴더, 선생님 · 학부모). 앨범마다 따로 묶으면 같은 아이가
 * 폴더 수만큼 나오므로 한 번에 묶어 한 아이 = 얼굴 하나로 만든다. 묶는 규칙·key 는 albumPeople 과 같다.
 * mediaIds 는 여러 앨범에 걸친다(사진 id 는 앨범을 넘어 하나뿐이다).
 */
export const peopleAcross = async (eventIds, { includeHidden = false } = {}) => {
  if (!eventIds?.length) return [];
  return peopleOf(await loadScope(eventIds, { includeHidden }));
};

/**
 * 묶는 데 필요한 것을 한 번에 읽는다 — 얼굴 · 태그 · "이 얼굴 아님" 쌍(face_exclusions).
 * scope 가 숫자면 앨범 하나, 배열이면 여러 앨범.
 */
const loadScope = async (scope, { includeHidden }) => {
  const many = Array.isArray(scope);
  const [faces, tags, cannotLink] = await Promise.all([
    many ? MediaFace.listForAlbums(scope, { includeHidden }) : MediaFace.listForAlbum(scope, { includeHidden }),
    many ? MediaTag.listForAlbums(scope, { includeHidden }) : MediaTag.listForAlbum(scope, { includeHidden }),
    FaceExclusion.listForAlbums(many ? scope : [scope])
  ]);
  return { faces, tags, cannotLink };
};

/**
 * 묶고 나서 사람마다 표지 주소와 **뺀 사진**(removedMediaIds)을 붙인다. 뺀 사진 = 선생님이 얼굴 목록에서 "이 얼굴 아님" 으로 뺀 것 —
 * 등록된 아이면 그 아이의 'excluded' 태그(학부모의 [아니에요] 도 같은 뜻이라 함께 든다), 그 밖에는 이 사람의 얼굴과 쌍으로 적힌
 * 얼굴의 사진. 지금 이 사람에게 든 사진은 빼고 센다.
 */
const peopleOf = ({ faces, tags, cannotLink = [] }) => {
  const fileOf = new Map(faces.map((face) => [face.mediaId, face.driveFileId]));
  const mediaOfFace = new Map(faces.map((face) => [face.id, face.mediaId]));
  return groupFaces(faces, tags, { cannotLink }).map((person) => {
    const own = new Set(person.mediaIds);
    const faceIds = new Set(person.faceIds);
    const removed = new Set();
    if (person.studentId != null) {
      tags.forEach((tag) => {
        if (tag.source === 'excluded' && Number(tag.studentId) === Number(person.studentId)) removed.add(Number(tag.mediaId));
      });
    }
    cannotLink.forEach((pair) => {
      const mediaId = mediaOfFace.get(Number(pair.faceId));
      if (mediaId != null && faceIds.has(Number(pair.otherFaceId))) removed.add(mediaId);
    });
    return {
      ...person,
      coverUrl: faceCoverUrl(fileOf.get(person.cover.mediaId), person.cover.box),
      removedMediaIds: [...removed].filter((mediaId) => !own.has(mediaId)).sort((a, b) => a - b)
    };
  });
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

/** 사진 id 목록을 정수로 고르고 겹친 것은 하나로 */
const cleanIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

/**
 * 다시 묶은 뒤 같은 사람의 key — 얼굴을 빼거나 넣으면 무리에서 가장 작은 얼굴 id(key)가 바뀔 수 있다.
 * 등록된 아이면 그 아이의 무리, 아니면 anchorFaceId 가 든 무리. 없으면 null.
 */
const keyAfter = async (scope, { studentId, anchorFaceId }) => {
  const people = peopleOf(await loadScope(scope, { includeHidden: true }));
  const found = studentId != null
    ? people.find((one) => one.studentId === studentId)
    : people.find((one) => one.faceIds.includes(anchorFaceId));
  return found?.key || null;
};

/**
 * 얼굴 목록에서 고른 사람의 사진 중 **잘못 묶인 사진을 뺀다**("이 얼굴 아님", 선생님). 사진은 그대로다.
 * - 등록된 아이로 묶인 사람: 그 사진에 그 아이의 'excluded' 태그(학부모의 [아니에요] 와 같다) — "우리 아이만 보기" 에서도 빠지고,
 *   다시 매칭해도 되살아나지 않는다.
 * - 그 밖의 사람: 그 사진의 얼굴 모두와 이 사람의 (남는) 얼굴 모두를 "같은 사람 아님" 쌍으로 적는다(face_exclusions) — 그래야 같은
 *   사진의 다른 얼굴이 대신 묶여 들어오지 않고, 앨범 하나만 볼 때도(그 앨범에 든 이 사람의 얼굴과) 떨어진다.
 * scope: 앨범 하나(eventId) 또는 여러 앨범(eventIds). 선생님 화면이라 숨긴 사진까지 본다.
 * → null(그 사이 없어진 사람) · { blocked: 'not_in_person' | 'all_photos' } · { removed, key }
 */
export const excludePhotos = async (scope, key, mediaIds, { userId = null } = {}) => {
  const data = await loadScope(scope, { includeHidden: true });
  const person = findPerson(peopleOf(data), key);
  if (!person) return null;
  const wanted = cleanIds(mediaIds).filter((id) => person.mediaIds.includes(id));
  if (!wanted.length) return { blocked: 'not_in_person' };
  if (wanted.length >= person.mediaIds.length) return { blocked: 'all_photos' };

  const wantedSet = new Set(wanted);
  const mediaOfFace = new Map(data.faces.map((face) => [face.id, face.mediaId]));
  const keepFaceIds = person.faceIds.filter((id) => !wantedSet.has(mediaOfFace.get(id)));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (person.studentId != null) {
      for (const mediaId of wanted) {
        const faceId = person.faceIds.find((id) => mediaOfFace.get(id) === mediaId) ?? null;
        await MediaTag.upsert({ mediaId, studentId: person.studentId, source: 'excluded', faceId, createdByUserId: userId }, client);
      }
    } else {
      const pairs = [];
      data.faces.filter((face) => wantedSet.has(face.mediaId)).forEach((face) => {
        keepFaceIds.forEach((otherFaceId) => pairs.push({ faceId: face.id, otherFaceId }));
      });
      await FaceExclusion.addPairs(pairs, userId, client);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { removed: wanted.length, key: await keyAfter(scope, { studentId: person.studentId, anchorFaceId: keepFaceIds[0] }) };
};

/**
 * 뺀 사진을 **다시 넣는다**(선생님). 등록된 아이면 'excluded' 를 선생님이 붙인 태그(manual)로 바꾼다 — 선생님이 "이 아이 맞아요" 라고
 * 한 것이라 다시 매칭에도 남는다. 그 밖에는 이 사람의 얼굴과 적어 둔 쌍을 지운다(그 사진이 이 사람으로 다시 묶인다).
 * → null · { blocked: 'not_removed' } · { restored, key }
 */
export const restorePhotos = async (scope, key, mediaIds, { userId = null } = {}) => {
  const data = await loadScope(scope, { includeHidden: true });
  const person = findPerson(peopleOf(data), key);
  if (!person) return null;
  const wanted = cleanIds(mediaIds).filter((id) => person.removedMediaIds.includes(id));
  if (!wanted.length) return { blocked: 'not_removed' };

  const wantedSet = new Set(wanted);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (person.studentId != null) {
      const excludedTags = data.tags.filter((tag) => (
        tag.source === 'excluded' && Number(tag.studentId) === Number(person.studentId) && wantedSet.has(Number(tag.mediaId))
      ));
      for (const tag of excludedTags) {
        await MediaTag.upsert({
          mediaId: Number(tag.mediaId), studentId: person.studentId, source: 'manual', faceId: tag.faceId ?? null, createdByUserId: userId
        }, client);
      }
    }
    const removedFaceIds = data.faces.filter((face) => wantedSet.has(face.mediaId)).map((face) => face.id);
    await FaceExclusion.removePairs(removedFaceIds, person.faceIds, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { restored: wanted.length, key: await keyAfter(scope, { studentId: person.studentId, anchorFaceId: person.faceIds[0] }) };
};

/**
 * 화면으로 내보내는 한 사람 — **화이트리스트**. 선생님과 학부모가 같은 모양을 받는다.
 * 얼굴을 잘라 그릴 사진 주소와 상자, 사진 수만 — 이름·학생 id·특징값·사진 id 목록은 보내지 않는다
 * (학부모에게 다른 아이를 가리키는 값이 나가지 않게, 2026-10-09 앨범의 모든 얼굴을 학부모에게도 보여 주기로 하면서 정한 선).
 * mine 은 학부모 화면에서 "우리 아이" 를 앞에 세우는 데만 쓴다.
 * removable 은 선생님 화면에만(teacher: true) — 등록된 아이로 묶인 사람은 목록에서 뺄 수 없다(removePerson).
 * removedCount 도 선생님만 — 그 사람에게서 "이 얼굴 아님" 으로 뺀 사진 수(뺀 사진 보기·다시 넣기).
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
  ...(teacher ? { removable: person.studentId == null, removedCount: (person.removedMediaIds || []).length } : {})
});

/** 학부모 목록 순서 — 우리 아이 먼저, 그다음 사진 많은 사람부터(groupFaces 순서 그대로) */
export const parentPeopleOrder = (views) => [...views].sort((a, b) => Number(b.mine) - Number(a.mine));

export default {
  albumPeople, peopleAcross, findPerson, removePerson, excludePhotos, restorePhotos, toPersonView, parentPeopleOrder
};
