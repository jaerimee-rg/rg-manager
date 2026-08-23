/**
 * 앨범의 실제 일. Drive 와 DB 를 함께 다루는 유일한 곳이라
 * 컨트롤러는 권한 판정과 응답 모양에만 집중할 수 있다.
 */

import pool from '../database.js';
import Event from '../models/Event.js';
import EventMedia from '../models/EventMedia.js';
import MediaFace from '../models/MediaFace.js';
import MediaTag from '../models/MediaTag.js';
import ChildFaceProfile from '../models/ChildFaceProfile.js';
import AppSetting from '../models/AppSetting.js';
import {
  DriveError,
  createFolder,
  shareAnyoneReader,
  listPermissions,
  isSharedWithAnyone,
  renameFile,
  getFile,
  trashFile,
  createResumableSession
} from '../utils/googleDrive.js';
import { runWithDrive, ensureRootFolder } from './driveAccess.js';
import { encodeDescriptor, isValidDescriptor, decodeDescriptor, classifyDistance, bestPerStudent,
  DEFAULT_MATCH_THRESHOLD, DEFAULT_CANDIDATE_THRESHOLD } from '../utils/faceVector.js';
import { mergeMatches } from '../utils/faceMatch.js';
import { buildDriveName, validateUpload, kindFromMime } from '../utils/mediaValidation.js';
import { APP_URL } from '../utils/appUrl.js';

/** 관리자가 조정할 수 있는 임계값. 실패해도 기본값으로 계속 간다 (aiSettings 와 같은 규칙). */
export const getThresholds = async () => {
  try {
    const rows = await AppSetting.getMany(['face_match_threshold', 'face_candidate_threshold']);
    const match = Number(rows.face_match_threshold);
    const candidate = Number(rows.face_candidate_threshold);
    return {
      match: Number.isFinite(match) ? match : DEFAULT_MATCH_THRESHOLD,
      candidate: Number.isFinite(candidate) ? candidate : DEFAULT_CANDIDATE_THRESHOLD
    };
  } catch (error) {
    console.error('얼굴 임계값 조회 실패(기본값 사용):', error?.message || error);
    return { match: DEFAULT_MATCH_THRESHOLD, candidate: DEFAULT_CANDIDATE_THRESHOLD };
  }
};

/** 한 번의 새로고침에서 Drive 에 물어볼 파일 수 (서버리스 시간 제한 안에 들도록) */
export const REFRESH_BATCH = 40;

/** 앨범 폴더를 만들고 링크 공유까지 켠다 (FR-220~221). */
export const createAlbumFolder = async (userId, event, folderName) => {
  const root = await ensureRootFolder(userId);

  return runWithDrive(userId, async (accessToken, account) => {
    const folder = await createFolder(accessToken, { name: folderName, parentId: root.id });

    // 공유가 실패해도 폴더는 만들어졌다. 상태를 unshared 로 남겨 화면이 고칠 수 있게 한다.
    let shared = true;
    try {
      await shareAnyoneReader(accessToken, folder.id);
    } catch (error) {
      shared = false;
      console.error('앨범 폴더 공유 설정 실패:', error?.message || error);
    }

    const now = new Date().toISOString();
    const updated = await Event.updateAlbum(event.id, {
      driveFolderId: folder.id,
      driveFolderName: folder.name,
      driveAccountId: account.id,
      albumStatus: shared ? 'ready' : 'unshared',
      albumCreatedAt: now,
      albumCheckedAt: now
    });

    return { event: updated, folder, shared };
  });
};

export const renameAlbumFolder = async (userId, event, folderName) =>
  runWithDrive(userId, async (accessToken) => {
    await renameFile(accessToken, event.driveFolderId, folderName);
    return Event.updateAlbum(event.id, { driveFolderName: folderName });
  });

/**
 * 폴더와 파일이 아직 그대로인지 확인한다 (FR-284).
 * Drive 에서 지워진 사진은 missing 으로 바꿔 학부모 목록에서 빠지게 한다.
 */
export const refreshAlbum = async (userId, event) => runWithDrive(userId, async (accessToken) => {
  let albumStatus = 'ready';

  try {
    const folder = await getFile(accessToken, event.driveFolderId, 'id,name,trashed');
    if (!folder || folder.trashed) albumStatus = 'missing';
    else {
      const permissions = await listPermissions(accessToken, event.driveFolderId);
      if (!isSharedWithAnyone(permissions)) albumStatus = 'unshared';
    }
  } catch (error) {
    if (error instanceof DriveError && error.code === 'not_found') albumStatus = 'missing';
    else throw error;
  }

  const missing = [];
  let checked = 0;
  let remaining = 0;

  if (albumStatus !== 'missing') {
    // 사진 수만큼 Drive 를 부르면 서버리스 시간 제한(10초)에 걸린다.
    // 한 번에 정해진 양만 확인하고, 남은 것은 다음 새로고침에서 이어서 본다.
    const all = await EventMedia.listReadyIds(event.id);
    const rows = all.slice(0, REFRESH_BATCH);
    remaining = Math.max(0, all.length - rows.length);

    for (const row of rows) {
      checked += 1;
      try {
        const file = await getFile(accessToken, row.driveFileId, 'id,trashed,videoMediaMetadata(width,height,durationMillis)');
        if (!file || file.trashed) { missing.push(row.id); continue; }

        // 영상은 Drive 가 나중에 메타를 채우므로 비어 있으면 다시 시도한다.
        const meta = file.videoMediaMetadata;
        if (row.kind === 'video' && meta && !row.durationMs) {
          await EventMedia.updateVideoMeta(row.id, {
            width: meta.width, height: meta.height, durationMs: Number(meta.durationMillis) || null
          });
        }
      } catch (error) {
        if (error instanceof DriveError && error.code === 'not_found') missing.push(row.id);
        else throw error;
      }
    }
  }

  if (missing.length) await EventMedia.markMissing(missing);
  await EventMedia.cleanupStale(event.id);
  const updated = await Event.updateAlbum(event.id, { albumStatus, albumCheckedAt: new Date().toISOString() });

  return { event: updated, albumStatus, checked, missing: missing.length, remaining };
});

/**
 * 업로드 세션을 만든다 (FR-232 ①).
 * 브라우저는 돌려받은 주소로 Drive 에 직접 올린다 — 서버는 파일 바이트를 만지지 않는다.
 */
export const createUploadSessions = async (userId, event, files, uploader) => {
  const results = [];

  await runWithDrive(userId, async (accessToken) => {
    for (const file of files) {
      const check = validateUpload(file);
      if (!check.ok) {
        results.push({ name: file.name, error: check.message, reason: check.reason });
        continue;
      }

      const driveName = buildDriveName({
        date: event.date,
        uploaderLabel: uploader.label,
        originalName: file.name
      });

      try {
        const sessionUri = await createResumableSession(accessToken, {
          name: driveName,
          parentId: event.driveFolderId,
          mimeType: check.mimeType,
          size: file.size,
          origin: APP_URL
        });

        const media = await EventMedia.createPending({
          eventId: event.id,
          kind: check.kind,
          originalName: file.name,
          driveName,
          mimeType: check.mimeType,
          size: file.size,
          takenAt: file.takenAt || new Date().toISOString(),
          uploaderUserId: uploader.userId,
          uploaderRole: uploader.role,
          uploaderStudentId: uploader.studentId || null,
          uploadSessionUri: sessionUri
        });

        results.push({ name: file.name, mediaId: media.id, sessionUri, driveName });
      } catch (error) {
        if (error instanceof DriveError && error.code === 'quota') {
          results.push({ name: file.name, error: '선생님의 Drive 용량이 부족해요. 선생님께 알려 주세요.', reason: 'quota' });
          continue;
        }
        throw error;
      }
    }
  });

  return results;
};

/**
 * 업로드 완료 보고 (FR-232 ④⑤).
 * Drive 에서 파일을 다시 읽어 **우리 앨범 폴더에 들어갔는지** 확인한 뒤 ready 로 바꾼다.
 */
export const completeUpload = async (userId, event, media, { driveFileId, takenAt, faces }) => {
  const file = await runWithDrive(userId, (accessToken) => getFile(accessToken, driveFileId));

  const parents = file?.parents || [];
  if (!parents.includes(event.driveFolderId)) {
    throw new DriveError('forbidden', '앨범 폴더에 올라간 파일이 아닙니다.');
  }
  const kind = kindFromMime(file.mimeType);
  if (kind !== media.kind) {
    throw new DriveError('forbidden', '올린 파일의 종류가 다릅니다.');
  }

  const image = file.imageMediaMetadata || {};
  const video = file.videoMediaMetadata || {};

  const ready = await EventMedia.markReady(media.id, {
    driveFileId,
    size: Number(file.size) || media.size,
    width: image.width || video.width || null,
    height: image.height || video.height || null,
    durationMs: Number(video.durationMillis) || null,
    takenAt: takenAt || media.takenAt
  });

  const indexed = await indexFaces(event, ready, faces);
  return {
    media: indexed.media || ready,
    faceStatus: indexed.faceStatus,
    faceCount: indexed.faceCount,
    tags: indexed.tags
  };
};

/**
 * 브라우저가 뽑아 온 얼굴 특징값을 저장하고 바로 매칭한다 (FR-250, 254).
 * 벡터가 없으면(브라우저가 못 뽑았으면) skipped 로 두고 업로드는 성공으로 끝낸다.
 */
export const indexFaces = async (event, media, faces) => {
  if (media.kind !== 'image') {
    const updated = await EventMedia.setFaceStatus(media.id, { faceStatus: 'skipped', faceCount: 0 });
    return { media: updated, faceStatus: 'skipped', faceCount: 0, tags: [] };
  }

  if (!Array.isArray(faces)) {
    const updated = await EventMedia.setFaceStatus(media.id, { faceStatus: 'skipped', faceCount: 0 });
    return { media: updated, faceStatus: 'skipped', faceCount: 0, tags: [] };
  }

  const usable = [];
  for (const face of faces) {
    if (!isValidDescriptor(face?.descriptor)) continue;
    usable.push({
      box: normalizeBox(face.box),
      score: Number(face.score) || 0,
      descriptor: encodeDescriptor(face.descriptor)
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await MediaFace.replaceForMedia(media.id, usable, client);
    const updated = await EventMedia.setFaceStatus(media.id, {
      faceStatus: usable.length ? 'done' : 'none',
      faceCount: usable.length
    }, client);
    await client.query('COMMIT');

    const tags = await rematchMedia(event, media.id);
    return { media: updated, faceStatus: usable.length ? 'done' : 'none', faceCount: usable.length, tags };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('얼굴 저장 실패:', error?.message || error);
    await EventMedia.setFaceStatus(media.id, {
      faceStatus: 'failed', faceCount: 0, faceError: String(error?.message || error).slice(0, 200)
    });
    return { media, faceStatus: 'failed', faceCount: 0, tags: [] };
  } finally {
    client.release();
  }
};

/** 얼굴 상자를 0~1 상대 좌표로 정리한다 (원본·축소본 어느 크기에도 그릴 수 있게). */
const normalizeBox = (box) => {
  const clamp = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  return { x: clamp(box?.x), y: clamp(box?.y), w: clamp(box?.w), h: clamp(box?.h) };
};

/** 사진 한 장을 그 선생님의 기준 얼굴 전체와 다시 맞춰 본다. */
export const rematchMedia = async (event, mediaId) => {
  const [faces, profiles, thresholds] = await Promise.all([
    MediaFace.listVectorsByMedia(mediaId),
    ChildFaceProfile.listVectorsByTeacher(event.userId),
    getThresholds()
  ]);

  const existing = await MediaTag.listByMedia(mediaId);
  const matches = bestPerStudent(faces, profiles)
    .map((match) => ({ ...match, source: classifyDistance(match.distance, thresholds) }))
    .filter((match) => match.source);

  const plan = mergeMatches(existing, matches);
  for (const tag of plan.upsert) {
    await MediaTag.upsert({ mediaId, studentId: tag.studentId, source: tag.source, distance: tag.distance, faceId: tag.faceId });
  }
  if (plan.remove.length) await MediaTag.removeStudents(mediaId, plan.remove);

  return MediaTag.listByMedia(mediaId);
};

/** 앨범 전체 재매칭 (FR-274 [다시 매칭]). */
export const rematchAlbum = async (event) => {
  const [facesByMedia, profiles, thresholds] = await Promise.all([
    MediaFace.listVectorsByTeacher(event.userId, { eventId: event.id }),
    ChildFaceProfile.listVectorsByTeacher(event.userId),
    getThresholds()
  ]);

  let added = 0;
  let candidates = 0;
  let removed = 0;

  for (const [mediaId, faces] of facesByMedia.entries()) {
    const existing = await MediaTag.listByMedia(mediaId);
    const matches = bestPerStudent(faces, profiles)
      .map((match) => ({ ...match, source: classifyDistance(match.distance, thresholds) }))
      .filter((match) => match.source);

    const plan = mergeMatches(existing, matches);
    for (const tag of plan.upsert) {
      await MediaTag.upsert({ mediaId, studentId: tag.studentId, source: tag.source, distance: tag.distance, faceId: tag.faceId });
      if (tag.source === 'face') added += 1;
      if (tag.source === 'candidate') candidates += 1;
    }
    if (plan.remove.length) {
      removed += await MediaTag.removeStudents(mediaId, plan.remove);
    }
  }

  return { added, candidates, removed };
};

/**
 * 자녀 기준 얼굴을 새로 등록했을 때 그 선생님의 앨범 전체와 맞춰 본다 (FR-262).
 * → { albums, photos } — 화면에 "앨범 4개에서 37장을 찾았어요" 로 보여준다.
 */
export const matchStudentAcrossAlbums = async (teacherUserId, studentId) => {
  const [facesByMedia, profiles, thresholds] = await Promise.all([
    MediaFace.listVectorsByTeacher(teacherUserId),
    ChildFaceProfile.listVectorsByTeacher(teacherUserId, { studentId }),
    getThresholds()
  ]);

  if (!profiles.length) return { albums: 0, photos: 0, candidates: 0 };

  const existing = await MediaTag.listByTeacherAndStudent(teacherUserId, studentId);
  const existingByMedia = new Map(existing.map((tag) => [tag.mediaId, tag]));

  let photos = 0;
  let candidates = 0;
  const touched = [];

  for (const [mediaId, faces] of facesByMedia.entries()) {
    const [match] = bestPerStudent(faces, profiles);
    const source = match ? classifyDistance(match.distance, thresholds) : null;
    if (!source) continue;

    const plan = mergeMatches(
      existingByMedia.has(mediaId) ? [existingByMedia.get(mediaId)] : [],
      [{ studentId, source, distance: match.distance, faceId: match.faceId }]
    );

    for (const tag of plan.upsert) {
      await MediaTag.upsert({ mediaId, studentId, source: tag.source, distance: tag.distance, faceId: tag.faceId });
      if (tag.source === 'face') { photos += 1; touched.push(mediaId); }
      if (tag.source === 'candidate') candidates += 1;
    }
  }

  const albums = touched.length ? await countAlbumsForMedia(touched) : 0;
  return { albums, photos, candidates };
};

const countAlbumsForMedia = async (mediaIds) => {
  const result = await pool.query(
    'SELECT COUNT(DISTINCT "eventId")::int AS count FROM event_media WHERE id = ANY($1::int[])',
    [mediaIds]
  );
  return result.rows[0]?.count || 0;
};

/** 미디어를 지운다 — Drive 는 휴지통으로, DB 는 행 삭제(얼굴·태그는 CASCADE). */
export const deleteMedia = async (ownerUserId, media) => {
  if (media.driveFileId) {
    try {
      await runWithDrive(ownerUserId, (accessToken) => trashFile(accessToken, media.driveFileId));
    } catch (error) {
      // Drive 에서 이미 사라졌거나 연결이 끊겼어도 앱에서는 지워 준다.
      console.error('Drive 휴지통 이동 실패(앱에서는 삭제 진행):', error?.message || error);
    }
  }
  return EventMedia.delete(media.id);
};

export default {
  getThresholds,
  createAlbumFolder,
  renameAlbumFolder,
  refreshAlbum,
  createUploadSessions,
  completeUpload,
  indexFaces,
  rematchMedia,
  rematchAlbum,
  matchStudentAcrossAlbums,
  deleteMedia
};
