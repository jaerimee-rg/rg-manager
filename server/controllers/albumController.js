import Event from '../models/Event.js';
import EventMedia from '../models/EventMedia.js';
import MediaFace from '../models/MediaFace.js';
import MediaTag from '../models/MediaTag.js';
import Student from '../models/Student.js';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import albumService from '../services/albumService.js';
import { DriveError, isDriveConfigured, getStorageQuota } from '../utils/googleDrive.js';
import { getAccessToken } from '../services/driveAccess.js';
import {
  sanitizeFolderName, folderNameFromEvent, normalizeCaption, normalizeCoverCrop, MAX_FILES_PER_UPLOAD, MAX_ALBUM_COVERS
} from '../utils/mediaValidation.js';
import { canUpload, canManageAlbum, canDeleteMedia, reasonMessage, isValidAudience, isPhotoFolder } from '../utils/albumAccess.js';
import { toTeacherMedia, thumbnailUrl } from '../utils/mediaSerializer.js';
import { sharePathFor } from '../services/albumShare.js';
import { albumPeople, findPerson, removePerson, toPersonView } from '../services/albumPeople.js';
import AlbumView from '../models/AlbumView.js';

/**
 * 선생님의 앨범 관리. 이벤트 소유자만 들어온다.
 */

const notFound = (res) => res.status(404).json({ error: '이벤트를 찾을 수 없습니다.' });

/** 이벤트를 찾고 소유를 확인한다. 남의 이벤트는 존재 여부도 알려주지 않는다. */
const loadEvent = async (req) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return null;
  return Event.getById(id, req.user.id, req.user.role);
};

/** 앨범을 만들 계정(=이벤트 소유 선생님). 관리자가 대신 볼 때도 소유자의 Drive 를 쓴다. */
const ownerOf = (event) => event.userId;

const driveStatusOf = async (event) => {
  const account = await GoogleDriveAccount.getByUserId(ownerOf(event));
  return {
    account,
    driveStatus: account ? account.status : 'none',
    foreignAccount: Boolean(event.driveFolderId && account && event.driveAccountId && event.driveAccountId !== account.id)
  };
};

const driveErrorResponse = (res, error, fallback) => {
  if (error instanceof DriveError) {
    const messages = {
      not_connected: '먼저 설정에서 Google Drive 를 연결해 주세요.',
      not_configured: 'Google Drive 연동이 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      invalid_grant: 'Google Drive 연결이 끊어졌습니다. 설정에서 다시 연결해 주세요.',
      unauthorized: 'Google Drive 연결이 끊어졌습니다. 설정에서 다시 연결해 주세요.',
      quota: 'Google Drive 용량이 부족합니다. 저장 공간을 확보해 주세요.',
      not_found: 'Google Drive 에서 폴더나 파일을 찾을 수 없습니다.',
      forbidden: 'Google Drive 권한이 없습니다.'
    };
    console.error('Drive 오류:', error.code, error.message);
    return res.status(400).json({ error: messages[error.code] || fallback, reason: error.code });
  }
  console.error('앨범 처리 오류:', error);
  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
};

/** GET /api/events/:id/album */
export const getAlbum = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    // 자동 태그가 예전 규칙으로 계산된 앨범이면 여기서 다시 매칭한다 (개수·후보 수가 맞게)
    await albumService.ensureAlbumsMatched(event);
    const coverRows = await EventMedia.coverRows(event.id, event.albumCoverMediaIds);

    const [{ account, driveStatus, foreignAccount }, sharePath] = await Promise.all([
      driveStatusOf(event),
      sharePathFor(event)
    ]);
    const payload = {
      eventId: event.id,
      eventType: event.type,
      eventTitle: event.title,
      eventDate: event.date,
      albumStatus: event.driveFolderId ? event.albumStatus : 'none',
      driveFolderId: event.driveFolderId || null,
      driveFolderName: event.driveFolderName || null,
      folderUrl: event.driveFolderId ? `https://drive.google.com/drive/folders/${event.driveFolderId}` : null,
      albumUploadOpen: event.albumUploadOpen !== false,
      // 공개 단계 (docs/photo-menu 3.3) — 앨범은 비공개로 시작한다
      published: event.albumPublished === true,
      audience: event.albumAudience || 'participants',
      publishedAt: event.albumPublishedAt || null,
      // 대표 사진(사진 목록 카드의 표지)으로 고른 사진 id 들, 고른 순서. 숨겼거나 지운 것은 빠진 지금 목록이다.
      // covers 는 같은 순서의 썸네일 — 대표 사진 칸이 순서를 바꿀 때 그린다(지금 불러온 사진 칸에 없을 수도 있다).
      // crop 은 선생님이 고른 보일 부분(없으면 null), driveFileId 는 카드 표지 미리 보기가 자르지 않은 사진을 받는 데 쓴다
      coverMediaIds: coverRows.map((row) => row.id),
      covers: coverRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        driveFileId: row.driveFileId,
        thumbnailUrl: thumbnailUrl(row.driveFileId, 400),
        crop: row.coverCrop || null
      })),
      maxCovers: MAX_ALBUM_COVERS,
      // 학부모에게 보낼 링크 (FR-518) — 앨범 주소 + 이 선생님의 학부모 초대 토큰 (services/albumShare)
      sharePath,
      defaultFolderName: folderNameFromEvent(event),
      expectedFolderName: folderNameFromEvent(event),
      viewerCounts: { participants: 0, all: 0 },
      foreignAccount,
      drive: {
        configured: isDriveConfigured(),
        connected: Boolean(account),
        status: driveStatus,
        email: account?.googleEmail || null,
        rootFolderName: account?.rootFolderName || 'RG Manager'
      },
      counts: { images: 0, videos: 0, hidden: 0, untagged: 0, candidates: 0, unanalyzed: 0 },
      totalSize: 0
    };

    if (event.driveFolderId) {
      const [stats, viewers] = await Promise.all([
        EventMedia.stats(event.id),
        albumService.countViewers(event)
      ]);
      payload.counts = {
        images: stats.images, videos: stats.videos, hidden: stats.hidden,
        fromParents: stats.fromParents || 0, fromTeacher: stats.fromTeacher || 0,
        untagged: stats.untagged, candidates: stats.candidates, unanalyzed: stats.unanalyzed
      };
      payload.totalSize = stats.totalSize;
      payload.viewerCounts = viewers;
    }

    if (account && account.status === 'connected') {
      try {
        const token = await getAccessToken(ownerOf(event));
        if (token.ok) payload.drive.quota = await getStorageQuota(token.accessToken);
      } catch (error) {
        console.error('Drive 용량 조회 실패:', error?.message || error);
      }
    }

    res.json(payload);
  } catch (error) {
    console.error('앨범 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/events/:id/album — 폴더 만들기 */
export const createAlbum = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    if (event.type === 'closure') return res.status(400).json({ error: reasonMessage('closure_event'), reason: 'closure_event' });
    if (event.driveFolderId) return res.status(400).json({ error: '이미 앨범이 있습니다.', reason: 'already_exists' });

    // 이름은 이벤트에서 나온다(docs/photo-menu 3.2). 예전 화면처럼 이름을 보내는 호출도 받는다.
    const name = sanitizeFolderName(req.body?.folderName ?? folderNameFromEvent(event));
    if (!name.ok) return res.status(400).json({ error: name.message, reason: name.reason });

    const result = await albumService.createAlbumFolder(ownerOf(event), event, name.name);

    res.status(201).json({
      driveFolderId: result.event.driveFolderId,
      driveFolderName: result.event.driveFolderName,
      albumStatus: result.event.albumStatus,
      folderUrl: `https://drive.google.com/drive/folders/${result.event.driveFolderId}`,
      shared: result.shared,
      published: result.event.albumPublished === true
    });
  } catch (error) {
    driveErrorResponse(res, error, '앨범 폴더를 만들지 못했습니다.');
  }
};

const isId = (value) => Number.isInteger(value) && value > 0;

const INVALID_COVER = { status: 400, body: { error: '이 앨범의 사진만 대표 사진으로 고를 수 있어요.', reason: 'invalid_cover' } };
const HIDDEN_COVER = {
  status: 400, body: { error: '숨긴 사진은 대표 사진으로 고를 수 없어요. 먼저 다시 보이게 해 주세요.', reason: 'hidden_cover' }
};

/**
 * { coverMediaIds: [...] } — 대표 사진을 통째로 바꾼다(고르기에서 한 번에 정하기 · 대표 사진 칸에서 순서 바꾸기).
 * 빈 목록이면 모두 푼다. 전부 이 앨범의 준비된·숨기지 않은 사진이어야 하고, 같은 것이 두 번 오면 안 되며, MAX_ALBUM_COVERS 장까지.
 */
const replaceCovers = async (event, list) => {
  if (!Array.isArray(list) || !list.every(isId) || new Set(list).size !== list.length) return INVALID_COVER;
  if (list.length > MAX_ALBUM_COVERS) {
    return { status: 400, body: { error: `대표 사진은 ${MAX_ALBUM_COVERS}장까지 고를 수 있어요.`, reason: 'too_many_covers' } };
  }
  if (!list.length) return { ids: [] };
  const usable = await EventMedia.coverableIds(event.id, list);
  if (usable.length === list.length) return { ids: list };
  // 쓸 수 없는 것이 섞였다 — 숨긴 사진 때문이면 그렇게 알린다(다시 보이게 하면 된다)
  for (const id of list.filter((one) => !usable.includes(one))) {
    const media = await EventMedia.getById(id);
    if (media && Number(media.eventId) === Number(event.id) && media.isHidden) return HIDDEN_COVER;
  }
  return INVALID_COVER;
};

/**
 * 대표 사진 고치기 — { coverMediaIds } 는 통째로 바꾸고(replaceCovers), { removeCoverMediaId } 는 빼고,
 * { addCoverMediaId } 는 끝에 붙인다(고른 순서가 카드 표지의 순서). 통째로 바꾸기는 더하기·빼기와 함께 오면 안 된다.
 * "지금 목록" 은 저장된 것 중 아직 쓸 수 있는 것만 친다 — 숨겼거나 지운 것은 여기서 저절로 빠진다.
 * 붙일 것은 이 앨범의 준비된(ready) 사진·영상이어야 하고(영상은 Drive 가 만든 장면이 표지), 숨긴 것은 안 되며
 * (표지는 학부모 카드에도 쓰인다), 이미 MAX_ALBUM_COVERS 장이면 409. → { ids } | { status, body } | null(바꿀 것 없음)
 */
const nextCovers = async (event, body) => {
  const { addCoverMediaId: add, removeCoverMediaId: remove, coverMediaIds: list } = body;
  if (list !== undefined) {
    if (add !== undefined || remove !== undefined) return INVALID_COVER;
    return replaceCovers(event, list);
  }
  if (add === undefined && remove === undefined) return null;
  if ((add !== undefined && !isId(add)) || (remove !== undefined && !isId(remove))) return INVALID_COVER;

  let ids = await EventMedia.coverableIds(event.id, event.albumCoverMediaIds);
  if (remove !== undefined) ids = ids.filter((id) => id !== remove);
  if (add === undefined || ids.includes(add)) return { ids };

  const media = await EventMedia.getById(add);
  if (!media || Number(media.eventId) !== Number(event.id) || media.status !== 'ready' || !media.driveFileId) return INVALID_COVER;
  if (media.isHidden) return HIDDEN_COVER;
  if (ids.length >= MAX_ALBUM_COVERS) {
    return {
      status: 409,
      body: { error: `대표 사진은 ${MAX_ALBUM_COVERS}장까지 고를 수 있어요. 하나를 먼저 풀어 주세요.`, reason: 'covers_full' }
    };
  }
  return { ids: [...ids, media.id] };
};

const INVALID_COVER_CROP = (error = '보일 부분을 다시 골라 주세요.') => ({ status: 400, body: { error, reason: 'invalid_cover_crop' } });

/**
 * 대표 사진마다 보일 부분 — { coverCrops: { [mediaId]: { x, y, zoom } | null } }. 대표 사진을 통째로 바꿀 때(coverMediaIds)만
 * 함께 받고, 그 목록에 든 사진의 것만 받는다(앨범 화면의 [저장하기] 가 목록과 보일 부분을 한 번에 보낸다).
 * → null(안 왔다) | { crops } | { status, body }
 */
const parseCoverCrops = (body, covers) => {
  if (body.coverCrops === undefined) return null;
  if (body.coverMediaIds === undefined || !covers?.ids) return INVALID_COVER_CROP('보일 부분은 대표 사진 목록과 함께 보내 주세요.');
  const raw = body.coverCrops;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return INVALID_COVER_CROP();
  const crops = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    if (!covers.ids.includes(id)) return INVALID_COVER_CROP('대표 사진으로 고른 사진의 보일 부분만 정할 수 있어요.');
    const result = normalizeCoverCrop(value);
    if (!result.ok) return INVALID_COVER_CROP(result.message);
    crops[id] = result.crop;
  }
  return { crops };
};

/** PATCH /api/events/:id/album — 이름 변경 · 업로드 받기 토글 · 공개 · 공개 범위 · 대표 사진(더하기·빼기·통째로 바꾸기, 보일 부분) */
export const updateAlbum = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    if (!event.driveFolderId) return res.status(400).json({ error: '아직 앨범이 없습니다.', reason: 'no_album' });

    const body = req.body || {};
    // 대표 사진은 앱 안의 값이라 Google 연결이 끊겨도 바꿀 수 있다. Drive 를 건드리는 폴더 이름 바꾸기보다 먼저 확인한다
    const covers = await nextCovers(event, body);
    if (covers?.status) return res.status(covers.status).json(covers.body);
    const coverCrops = parseCoverCrops(body, covers);
    if (coverCrops?.status) return res.status(coverCrops.status).json(coverCrops.body);
    if (body.audience !== undefined && !isValidAudience(body.audience)) {
      return res.status(400).json({ error: '공개 범위를 다시 골라 주세요.', reason: 'invalid_audience' });
    }
    // 사진 전용 폴더에는 신청한 학생이 없다 — "참가 확정" 범위로는 아무도 못 본다 (FR-517)
    if (body.audience !== undefined && body.audience !== 'all' && isPhotoFolder(event)) {
      return res.status(400).json({ error: '사진 폴더는 연결된 모든 학부모에게 공개돼요.', reason: 'folder_audience' });
    }
    if (body.published === true && event.albumStatus === 'missing') {
      return res.status(400).json({ error: reasonMessage('album_missing'), reason: 'album_missing' });
    }

    let updated = event;

    if (req.body?.folderName !== undefined) {
      const name = sanitizeFolderName(req.body.folderName);
      if (!name.ok) return res.status(400).json({ error: name.message, reason: name.reason });
      updated = await albumService.renameAlbumFolder(ownerOf(event), event, name.name);
    }

    const fields = {};
    if (body.albumUploadOpen !== undefined) fields.albumUploadOpen = Boolean(body.albumUploadOpen);
    if (body.audience !== undefined) fields.albumAudience = body.audience;
    if (body.published !== undefined) {
      fields.albumPublished = Boolean(body.published);
      // "몇 월 며칠 공개" 는 처음 공개한 날을 남긴다
      if (fields.albumPublished && !event.albumPublishedAt) fields.albumPublishedAt = new Date().toISOString();
    }
    if (covers) fields.albumCoverMediaIds = covers.ids.length ? covers.ids : null;
    if (Object.keys(fields).length) {
      updated = (await Event.updateAlbum(event.id, fields)) || updated;
    }
    if (coverCrops) await EventMedia.setCoverCrops(event.id, coverCrops.crops);

    res.json({
      driveFolderName: updated.driveFolderName,
      albumUploadOpen: updated.albumUploadOpen !== false,
      albumStatus: updated.albumStatus,
      published: updated.albumPublished === true,
      audience: updated.albumAudience || 'participants',
      publishedAt: updated.albumPublishedAt || null,
      coverMediaIds: covers ? covers.ids : await EventMedia.coverableIds(updated.id, updated.albumCoverMediaIds)
    });
  } catch (error) {
    driveErrorResponse(res, error, '앨범을 수정하지 못했습니다.');
  }
};

/** POST /api/events/:id/album/refresh */
export const refreshAlbum = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    if (!event.driveFolderId) return res.status(400).json({ error: '아직 앨범이 없습니다.', reason: 'no_album' });

    const result = await albumService.refreshAlbum(ownerOf(event), event);
    res.json({ albumStatus: result.albumStatus, checked: result.checked, missing: result.missing, remaining: result.remaining || 0 });
  } catch (error) {
    driveErrorResponse(res, error, '앨범을 새로고침하지 못했습니다.');
  }
};

/** 목록 응답에 태그·얼굴을 붙인다 (N+1 을 피해 한 번에 읽는다). */
const decorate = async (rows, userId, role) => {
  const ids = rows.map((row) => row.id);
  const [tagsByMedia, facesByMedia, views] = await Promise.all([
    MediaTag.listByMediaIds(ids),
    MediaFace.listByMediaIds(ids),
    AlbumView.viewsByMedia(ids)
  ]);

  const studentIds = [...new Set(Object.values(tagsByMedia).flat().map((tag) => tag.studentId))];
  const students = studentIds.length ? await Student.getByIds(studentIds, userId, role) : [];
  const studentNames = Object.fromEntries(students.map((student) => [student.id, student.name]));

  return rows.map((row) => toTeacherMedia(
    {
      ...row,
      viewCount: views[row.id] || 0,
      tags: tagsByMedia[row.id] || [],
      faces: facesByMedia[row.id] || []
    },
    { studentNames }
  ));
};

/** GET /api/events/:id/media */
export const listMedia = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    await albumService.ensureAlbumsMatched(event);

    const filter = String(req.query.filter || 'all');
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
    const cursor = req.query.cursorTakenAt && req.query.cursorId
      ? { takenAt: req.query.cursorTakenAt, id: parseInt(req.query.cursorId, 10) }
      : null;

    // 얼굴 목록에서 한 사람을 골랐으면 그 사람이 나온 사진만. 그 사이 묶음이 바뀌어 없는 사람이면
    // 빈 목록 + personMissing (화면이 고른 것을 풀고 목록을 다시 읽는다)
    const personKey = req.query.person ? String(req.query.person) : null;
    const person = personKey ? findPerson(await albumPeople(event.id, { includeHidden: true }), personKey) : null;
    const mediaIds = personKey ? (person?.mediaIds || []) : null;

    const rows = await EventMedia.list(event.id, {
      filter, limit, cursor, includeHidden: true, uploaderUserId: req.user.id, mediaIds
    });
    const items = await decorate(rows, req.user.id, req.user.role);
    const last = rows[rows.length - 1];

    res.json({
      items,
      nextCursor: rows.length === limit && last ? { takenAt: last.takenAt, id: last.id } : null,
      ...(personKey && !person ? { personMissing: true } : {})
    });
  } catch (error) {
    console.error('앨범 목록 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** GET /api/events/:id/album/people — 앨범 위 얼굴 목록(한 사람에 얼굴 하나). 숨긴 사진까지 본다. */
export const listPeople = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    await albumService.ensureAlbumsMatched(event);

    const people = await albumPeople(event.id, { includeHidden: true });
    res.json({ people: people.map((person) => toPersonView(person, { teacher: true })) });
  } catch (error) {
    console.error('앨범 얼굴 목록 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * DELETE /api/events/:id/album/people/:key — 얼굴 목록에서 관계없는 사람을 뺀다(선생님만).
 * 사진은 지우지 않고 그 사람의 얼굴과 그 얼굴로 붙은 자동 태그만 지운다(services/albumPeople.js removePerson).
 * Drive 를 건드리지 않으므로 Google 연결이 끊겨도 된다. 그 사이 묶음이 바뀌어 없는 사람이면 404 + personMissing.
 * ?photoCount= 는 화면이 본 그 사람의 사진 수 — 지금 다시 묶은 것과 다르면 409 person_changed(아무것도 지우지 않는다).
 * 등록된 아이로 묶인 사람은 409 student_person.
 */
export const deletePerson = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const seenPhotoCount = req.query.photoCount === undefined ? undefined : Number(req.query.photoCount);
    const result = await removePerson(event.id, req.params.key, { seenPhotoCount });
    if (!result) return res.status(404).json({ error: '얼굴 목록이 바뀌었어요. 새로고침해 주세요.', personMissing: true });
    if (result.blocked === 'student_person') {
      return res.status(409).json({ error: '등록된 아이 얼굴은 목록에서 뺄 수 없어요.', reason: 'student_person' });
    }
    if (result.blocked === 'person_changed') {
      return res.status(409).json({ error: '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.', reason: 'person_changed' });
    }
    res.json(result);
  } catch (error) {
    console.error('얼굴 목록에서 빼기 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * POST /api/events/:id/media/uploads — 업로드 세션 발급
 *
 * 사진 메뉴의 [사진 올리기]는 이벤트를 고르는 것으로 사진을 그 이벤트에 연결한다(docs/photo-menu FR-514).
 * 고른 이벤트에 앨범이 없으면 여기서 이벤트 이름 폴더를 먼저 만든다(비공개로 시작).
 */
export const createUploads = async (req, res) => {
  try {
    let event = await loadEvent(req);
    if (!event) return notFound(res);
    if (event.type === 'closure') return res.status(400).json({ error: reasonMessage('closure_event'), reason: 'closure_event' });

    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: '올릴 파일이 없습니다.' });
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return res.status(400).json({ error: `한 번에 ${MAX_FILES_PER_UPLOAD}개까지 올릴 수 있습니다.` });
    }

    let created = false;
    if (!event.driveFolderId) {
      event = await albumService.ensureAlbum(ownerOf(event), event);
      created = Boolean(event.driveFolderId);
    }

    const { driveStatus, foreignAccount } = await driveStatusOf(event);
    const allowed = canUpload({
      isOwner: true,
      hasAlbum: Boolean(event.driveFolderId),
      albumUploadOpen: event.albumUploadOpen !== false,
      albumStatus: event.albumStatus,
      driveStatus: driveStatus === 'none' ? 'not_connected' : driveStatus,
      foreignAccount
    });
    if (!allowed.ok) return res.status(400).json({ error: reasonMessage(allowed.reason), reason: allowed.reason });

    const items = await albumService.createUploadSessions(ownerOf(event), event, files, {
      userId: req.user.id, role: 'teacher', label: '선생님'
    });

    res.status(201).json({
      items,
      album: {
        created,
        driveFolderName: event.driveFolderName || null,
        published: event.albumPublished === true
      }
    });
  } catch (error) {
    driveErrorResponse(res, error, '업로드를 시작하지 못했습니다.');
  }
};

/** POST /api/events/:id/media/:mediaId/complete */
export const completeUpload = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '업로드 정보를 찾을 수 없습니다.' });
    if (media.uploaderUserId !== req.user.id) return res.status(403).json({ error: '이 업로드를 완료할 권한이 없습니다.' });

    const driveFileId = String(req.body?.driveFileId || '').trim();
    if (!driveFileId) return res.status(400).json({ error: '업로드된 파일 정보가 없습니다.' });

    const result = await albumService.completeUpload(ownerOf(event), event, media, {
      driveFileId,
      takenAt: req.body?.takenAt,
      faces: req.body?.faces,
      analyzerVersion: req.body?.analyzerVersion
    });

    res.json({
      media: toTeacherMedia({ ...result.media, tags: result.tags || [] }),
      faceStatus: result.faceStatus,
      faceCount: result.faceCount
    });
  } catch (error) {
    driveErrorResponse(res, error, '업로드를 마치지 못했습니다.');
  }
};

/** POST /api/events/:id/media/bulk — 숨김·보이기·삭제·태그 */
export const bulkAction = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const action = String(req.body?.action || '');
    const mediaIds = (Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : []).map(Number).filter(Boolean);
    if (!mediaIds.length) return res.status(400).json({ error: '대상을 선택해 주세요.' });

    if (action === 'hide' || action === 'show') {
      const affected = await EventMedia.setHidden(mediaIds, action === 'hide', event.id);
      return res.json({ affected });
    }

    if (action === 'delete') {
      let affected = 0;
      for (const id of mediaIds) {
        const media = await EventMedia.getById(id);
        if (!media || media.eventId !== event.id) continue;
        await albumService.deleteMedia(ownerOf(event), media);
        affected += 1;
      }
      return res.json({ affected });
    }

    if (action === 'tag' || action === 'untag') {
      const studentIds = (Array.isArray(req.body?.studentIds) ? req.body.studentIds : []).map(Number).filter(Boolean);
      if (!studentIds.length) return res.status(400).json({ error: '학생을 선택해 주세요.' });

      const students = await Student.getByIds(studentIds, req.user.id, req.user.role);
      if (students.length !== studentIds.length) return res.status(400).json({ error: '학생을 찾을 수 없습니다.' });

      let affected = 0;
      for (const mediaId of mediaIds) {
        const media = await EventMedia.getById(mediaId);
        if (!media || media.eventId !== event.id) continue;
        for (const studentId of studentIds) {
          await MediaTag.upsert({
            mediaId, studentId,
            source: action === 'tag' ? 'manual' : 'excluded',
            createdByUserId: req.user.id
          });
        }
        affected += 1;
      }
      return res.json({ affected });
    }

    res.status(400).json({ error: '알 수 없는 동작입니다.' });
  } catch (error) {
    driveErrorResponse(res, error, '작업을 마치지 못했습니다.');
  }
};

/** POST /api/events/:id/media/:mediaId/tags — 수동 태그 하나 */
export const addTag = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

    const studentId = parseInt(req.body?.studentId, 10);
    if (isNaN(studentId)) return res.status(400).json({ error: '학생을 선택해 주세요.' });

    const students = await Student.getByIds([studentId], req.user.id, req.user.role);
    if (!students.length) return res.status(400).json({ error: '학생을 찾을 수 없습니다.' });

    const tag = await MediaTag.upsert({
      mediaId: media.id, studentId, source: 'manual',
      faceId: req.body?.faceId ? parseInt(req.body.faceId, 10) : null,
      createdByUserId: req.user.id
    });

    res.json({ tag: { ...tag, name: students[0].name } });
  } catch (error) {
    console.error('앨범 태그 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** DELETE /api/events/:id/media/:mediaId/tags/:studentId — 태그 해제(제외로 남긴다) */
export const removeTag = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

    await MediaTag.upsert({
      mediaId: media.id,
      studentId: parseInt(req.params.studentId, 10),
      source: 'excluded',
      createdByUserId: req.user.id
    });

    res.json({ message: '태그를 해제했습니다.' });
  } catch (error) {
    console.error('앨범 태그 해제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 재분석용 사진 주소 — 긴 변 1920px(업로드 때 분석하는 축소본과 같은 크기), 회전이 적용된 JPEG.
 * drive.google.com/thumbnail 은 이 주소로 302 를 보내는데 그 302 에 CORS 헤더가 없어 브라우저가
 * 픽셀을 읽지 못한다(캔버스가 오염된다). 리다이렉트 끝인 이 주소는 Access-Control-Allow-Origin: * 다.
 * 앨범 폴더가 링크 공유 중이어야 열린다(갤러리 썸네일과 같은 조건).
 */
export const analysisImageUrl = (driveFileId) => (
  `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=s1920`
);

/** GET /api/events/:id/media/unanalyzed?afterId= — 브라우저가 다시 분석할 대상 */
export const listUnanalyzed = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const batch = Math.min(parseInt(req.body?.batch ?? req.query.batch, 10) || 5, 20);
    const afterId = Math.max(parseInt(req.query.afterId, 10) || 0, 0);
    const rows = await EventMedia.listUnanalyzed(event.id, batch, afterId);
    const stats = await EventMedia.stats(event.id);

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        driveFileId: row.driveFileId,
        largeUrl: analysisImageUrl(row.driveFileId)
      })),
      remaining: stats.unanalyzed
    });
  } catch (error) {
    console.error('재분석 대상 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/events/:id/media/:mediaId/faces — 재분석 결과 저장 */
export const saveFaces = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

    const manage = canManageAlbum({ isOwner: true, albumStatus: event.albumStatus });
    if (!manage.ok) return res.status(400).json({ error: reasonMessage(manage.reason), reason: manage.reason });

    const result = await albumService.indexFaces(event, media, req.body?.faces, {
      analyzerVersion: req.body?.analyzerVersion
    });
    res.json({ faceStatus: result.faceStatus, faceCount: result.faceCount });
  } catch (error) {
    console.error('얼굴 저장 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/events/:id/media/rematch */
export const rematch = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const result = await albumService.rematchAlbum(event);
    res.json(result);
  } catch (error) {
    console.error('앨범 재매칭 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * PATCH /api/events/:id/media/:mediaId — 사진·영상 설명 { caption } (빈 글 · null 이면 지운다)
 * 앱 안의 글이라 Google 연결이 끊겨도 고칠 수 있다(숨기기와 같다).
 */
export const updateMedia = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const mediaId = parseInt(req.params.mediaId, 10);
    if (isNaN(mediaId)) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });
    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'caption')) {
      return res.status(400).json({ error: '바꿀 내용이 없습니다.' });
    }

    const checked = normalizeCaption(req.body.caption);
    if (!checked.ok) return res.status(400).json({ error: checked.message, reason: 'caption' });

    const updated = await EventMedia.setCaption(mediaId, checked.caption, event.id);
    if (!updated) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });

    res.json({ id: updated.id, caption: updated.caption ?? null });
  } catch (error) {
    console.error('사진 설명 저장 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** DELETE /api/events/:id/media/:mediaId */
export const deleteMedia = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);

    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });
    if (!canDeleteMedia({ role: req.user.role, userId: req.user.id, media })) {
      return res.status(403).json({ error: '이 사진을 지울 권한이 없습니다.' });
    }

    await albumService.deleteMedia(ownerOf(event), media);
    res.json({ message: 'Drive 휴지통으로 옮겼습니다. 30일 안에 복구할 수 있어요.' });
  } catch (error) {
    driveErrorResponse(res, error, '사진을 지우지 못했습니다.');
  }
};

export default {
  getAlbum, listPeople, deletePerson, createAlbum, updateAlbum, refreshAlbum,
  listMedia, createUploads, completeUpload, bulkAction,
  addTag, removeTag, listUnanalyzed, saveFaces, rematch, updateMedia, deleteMedia
};
