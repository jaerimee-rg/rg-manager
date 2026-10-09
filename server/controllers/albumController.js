import Event from '../models/Event.js';
import EventMedia from '../models/EventMedia.js';
import MediaFace from '../models/MediaFace.js';
import MediaTag from '../models/MediaTag.js';
import Student from '../models/Student.js';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import albumService from '../services/albumService.js';
import { DriveError, isDriveConfigured, getStorageQuota } from '../utils/googleDrive.js';
import { getAccessToken } from '../services/driveAccess.js';
import { sanitizeFolderName, folderNameFromEvent, normalizeCaption, MAX_FILES_PER_UPLOAD } from '../utils/mediaValidation.js';
import { canUpload, canManageAlbum, canDeleteMedia, reasonMessage, isValidAudience, isPhotoFolder } from '../utils/albumAccess.js';
import { toTeacherMedia } from '../utils/mediaSerializer.js';
import { sharePathFor } from '../services/albumShare.js';

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
      const [stats, viewers] = await Promise.all([EventMedia.stats(event.id), albumService.countViewers(event)]);
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

/** PATCH /api/events/:id/album — 이름 변경 · 업로드 받기 토글 · 공개 · 공개 범위 */
export const updateAlbum = async (req, res) => {
  try {
    const event = await loadEvent(req);
    if (!event) return notFound(res);
    if (!event.driveFolderId) return res.status(400).json({ error: '아직 앨범이 없습니다.', reason: 'no_album' });

    const body = req.body || {};
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
    if (Object.keys(fields).length) {
      updated = (await Event.updateAlbum(event.id, fields)) || updated;
    }

    res.json({
      driveFolderName: updated.driveFolderName,
      albumUploadOpen: updated.albumUploadOpen !== false,
      albumStatus: updated.albumStatus,
      published: updated.albumPublished === true,
      audience: updated.albumAudience || 'participants',
      publishedAt: updated.albumPublishedAt || null
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
  const [tagsByMedia, facesByMedia] = await Promise.all([
    MediaTag.listByMediaIds(ids),
    MediaFace.listByMediaIds(ids)
  ]);

  const studentIds = [...new Set(Object.values(tagsByMedia).flat().map((tag) => tag.studentId))];
  const students = studentIds.length ? await Student.getByIds(studentIds, userId, role) : [];
  const studentNames = Object.fromEntries(students.map((student) => [student.id, student.name]));

  return rows.map((row) => toTeacherMedia(
    { ...row, tags: tagsByMedia[row.id] || [], faces: facesByMedia[row.id] || [] },
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

    const rows = await EventMedia.list(event.id, {
      filter, limit, cursor, includeHidden: true, uploaderUserId: req.user.id
    });
    const items = await decorate(rows, req.user.id, req.user.role);
    const last = rows[rows.length - 1];

    res.json({
      items,
      nextCursor: rows.length === limit && last ? { takenAt: last.takenAt, id: last.id } : null
    });
  } catch (error) {
    console.error('앨범 목록 오류:', error);
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
  getAlbum, createAlbum, updateAlbum, refreshAlbum,
  listMedia, createUploads, completeUpload, bulkAction,
  addTag, removeTag, listUnanalyzed, saveFaces, rematch, updateMedia, deleteMedia
};
