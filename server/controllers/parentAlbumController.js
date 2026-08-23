import ParentAccount from '../models/ParentAccount.js';
import ParentChild from '../models/ParentChild.js';
import Student from '../models/Student.js';
import Event from '../models/Event.js';
import EventRegistration from '../models/EventRegistration.js';
import Competition from '../models/Competition.js';
import EventMedia from '../models/EventMedia.js';
import MediaTag from '../models/MediaTag.js';
import ChildFaceProfile, { MAX_PER_PARENT, MAX_PER_STUDENT } from '../models/ChildFaceProfile.js';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import albumService from '../services/albumService.js';
import { DriveError } from '../utils/googleDrive.js';
import { isConfirmedParent, confirmedChildIds, canViewAlbum, canUpload, canDeleteMedia, reasonMessage } from '../utils/albumAccess.js';
import { toParentMedia, toParentAlbum } from '../utils/mediaSerializer.js';
import { encodeDescriptor, isValidDescriptor } from '../utils/faceVector.js';
import { MAX_FILES_PER_UPLOAD } from '../utils/mediaValidation.js';

/**
 * 학부모의 사진 화면.
 *
 * 모든 응답은 mediaSerializer 의 화이트리스트를 거친다 —
 * 다른 아이의 태그·얼굴 위치·다른 학부모의 이름은 나가지 않는다 (NFR-4).
 */

const notFound = (res) => res.status(404).json({ error: '찾을 수 없습니다.' });

const teacherOf = async (userId) => ParentAccount.getByUserId(userId);

/** 연결이 끝난(linked) 자녀의 학생 id 와 이름 */
const linkedChildren = async (parentUserId) => {
  const children = await ParentChild.listByParent(parentUserId);
  return children.filter((child) => child.studentId && child.status === 'linked');
};

/**
 * 이 이벤트에서 확정된 자녀를 가려낸다.
 * 신청 확정(event_registrations)과 참가 학생(competition_students) 둘 다 본다.
 */
const confirmationFor = async (event, studentIds) => {
  if (!studentIds.length) return { confirmed: false, confirmedIds: [] };

  const registrations = await EventRegistration.listForStudents([event.id], studentIds);
  const confirmedStudentIds = registrations
    .filter((row) => row.status === 'confirmed')
    .map((row) => row.studentId);

  let competitionStudentIds = [];
  if (event.competitionId) {
    competitionStudentIds = await Competition.getStudentIds(event.competitionId);
  }

  const input = { childStudentIds: studentIds, confirmedStudentIds, competitionStudentIds };
  return { confirmed: isConfirmedParent(input), confirmedIds: confirmedChildIds(input) };
};

/** 앨범 화면에 필요한 것을 한 번에 모은다. */
const loadAlbumContext = async (req) => {
  const account = await teacherOf(req.user.id);
  if (!account) return { error: notFound };

  const eventId = parseInt(req.params.id ?? req.params.eventId, 10);
  if (isNaN(eventId)) return { error: notFound };

  const event = await Event.getPublishedForParent(eventId, account.teacherId);
  if (!event) return { error: notFound };

  const children = await linkedChildren(req.user.id);
  const studentIds = children.map((child) => child.studentId);
  const { confirmed, confirmedIds } = await confirmationFor(event, studentIds);

  const view = canViewAlbum({
    isConfirmed: confirmed,
    isPublished: event.isPublished !== false,
    hasAlbum: Boolean(event.driveFolderId)
  });

  if (!view.ok) {
    return {
      error: (res) => res.status(403).json({ error: reasonMessage(view.reason), reason: view.reason })
    };
  }

  return { account, event, children, studentIds, confirmedIds };
};

const studentNamesOf = (children) =>
  Object.fromEntries(children.map((child) => [child.studentId, child.studentName || child.childName]));

/** GET /api/parent/albums — 사진 탭 */
export const listAlbums = async (req, res) => {
  try {
    const account = await teacherOf(req.user.id);
    if (!account) return notFound(res);

    const children = await linkedChildren(req.user.id);
    const studentIds = children.map((child) => child.studentId);

    const events = await Event.listWithAlbumsForParent(account.teacherId);
    if (!events.length) return res.json({ items: [] });

    // 확정된 이벤트만 남긴다.
    const visible = [];
    for (const event of events) {
      const { confirmed } = await confirmationFor(event, studentIds);
      if (confirmed) visible.push(event);
    }
    if (!visible.length) return res.json({ items: [] });

    const summaries = await EventMedia.summaries(visible.map((event) => event.id), { studentIds });
    res.json({ items: visible.map((event) => toParentAlbum(event, summaries[event.id])) });
  } catch (error) {
    console.error('학부모 앨범 목록 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** GET /api/parent/events/:id/media — 갤러리 */
export const listMedia = async (req, res) => {
  try {
    const context = await loadAlbumContext(req);
    if (context.error) return context.error(res);

    const { event, children, studentIds } = context;
    const filter = String(req.query.filter || 'all');
    const mineOnly = String(req.query.mine || '') === '1';
    const childStudentId = req.query.studentId ? parseInt(req.query.studentId, 10) : null;

    // "우리 아이만" — 자녀를 고르면 그 아이만, 아니면 내 아이 전부
    const targetIds = mineOnly
      ? (childStudentId && studentIds.includes(childStudentId) ? [childStudentId] : studentIds)
      : null;

    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 120);
    const cursor = req.query.cursorTakenAt && req.query.cursorId
      ? { takenAt: req.query.cursorTakenAt, id: parseInt(req.query.cursorId, 10) }
      : null;

    const rows = await EventMedia.list(event.id, {
      filter, limit, cursor,
      studentIds: targetIds,
      uploaderUserId: req.user.id
    });

    const tagsByMedia = await MediaTag.listByMediaIds(rows.map((row) => row.id));
    const studentNames = studentNamesOf(children);
    const items = rows.map((row) => toParentMedia(
      { ...row, tags: tagsByMedia[row.id] || [] },
      { myStudentIds: studentIds, myUserId: req.user.id, studentNames }
    ));

    // "혹시 우리 아이?" 묶음은 우리 아이만 볼 때만 따로 모아 준다.
    let candidates = [];
    if (mineOnly) {
      const candidateRows = await EventMedia.list(event.id, { filter: 'candidates', limit: 30, uploaderUserId: req.user.id });
      const candidateTags = await MediaTag.listByMediaIds(candidateRows.map((row) => row.id));
      const wanted = targetIds || studentIds;
      candidates = candidateRows
        .filter((row) => (candidateTags[row.id] || []).some((tag) => tag.source === 'candidate' && wanted.includes(tag.studentId)))
        .map((row) => toParentMedia(
          { ...row, tags: candidateTags[row.id] || [] },
          { myStudentIds: studentIds, myUserId: req.user.id, studentNames }
        ));
    }

    const last = rows[rows.length - 1];
    res.json({
      event: {
        id: event.id, title: event.title, date: event.date, type: event.type,
        location: event.location || null,
        uploadOpen: event.albumUploadOpen !== false,
        albumStatus: event.albumStatus
      },
      children: children.map((child) => ({
        studentId: child.studentId,
        name: child.studentName || child.childName
      })),
      items,
      candidates,
      nextCursor: rows.length === limit && last ? { takenAt: last.takenAt, id: last.id } : null
    });
  } catch (error) {
    console.error('학부모 앨범 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/parent/events/:id/media/uploads */
export const createUploads = async (req, res) => {
  try {
    const context = await loadAlbumContext(req);
    if (context.error) return context.error(res);

    const { event, children, confirmedIds } = context;
    const account = await GoogleDriveAccount.getByUserId(event.userId);

    const allowed = canUpload({
      isConfirmed: true,
      hasAlbum: Boolean(event.driveFolderId),
      albumUploadOpen: event.albumUploadOpen !== false,
      albumStatus: event.albumStatus,
      driveStatus: account ? account.status : 'not_connected',
      foreignAccount: Boolean(account && event.driveAccountId && event.driveAccountId !== account.id)
    });
    if (!allowed.ok) return res.status(403).json({ error: reasonMessage(allowed.reason), reason: allowed.reason });

    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!files.length) return res.status(400).json({ error: '올릴 파일이 없어요.' });
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return res.status(400).json({ error: `한 번에 ${MAX_FILES_PER_UPLOAD}개까지 올릴 수 있어요.` });
    }

    // 파일 이름에 쓸 자녀 — 이 이벤트에서 확정된 첫 아이
    const labelChild = children.find((child) => confirmedIds.includes(child.studentId));

    const items = await albumService.createUploadSessions(event.userId, event, files, {
      userId: req.user.id,
      role: 'parent',
      label: labelChild?.studentName || labelChild?.childName || '학부모',
      studentId: labelChild?.studentId || null
    });

    res.status(201).json({ items });
  } catch (error) {
    if (error instanceof DriveError) {
      console.error('학부모 업로드 세션 실패:', error.code, error.message);
      const messages = {
        quota: '선생님의 Drive 용량이 부족해요. 선생님께 알려 주세요.',
        not_connected: '지금은 사진을 올릴 수 없어요. 선생님이 Google Drive 연결을 확인해야 해요.',
        invalid_grant: '지금은 사진을 올릴 수 없어요. 선생님이 Google Drive 연결을 확인해야 해요.'
      };
      return res.status(400).json({ error: messages[error.code] || '지금은 사진을 올릴 수 없어요.', reason: error.code });
    }
    console.error('학부모 업로드 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/parent/events/:id/media/:mediaId/complete */
export const completeUpload = async (req, res) => {
  try {
    const context = await loadAlbumContext(req);
    if (context.error) return context.error(res);

    const { event, children, studentIds } = context;
    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '업로드 정보를 찾을 수 없어요.' });
    if (Number(media.uploaderUserId) !== Number(req.user.id)) {
      return res.status(403).json({ error: '이 업로드를 마칠 권한이 없어요.' });
    }

    const driveFileId = String(req.body?.driveFileId || '').trim();
    if (!driveFileId) return res.status(400).json({ error: '업로드된 파일 정보가 없어요.' });

    const result = await albumService.completeUpload(event.userId, event, media, {
      driveFileId,
      takenAt: req.body?.takenAt,
      faces: req.body?.faces
    });

    res.json({
      media: toParentMedia(
        { ...result.media, tags: result.tags || [] },
        { myStudentIds: studentIds, myUserId: req.user.id, studentNames: studentNamesOf(children) }
      ),
      faceStatus: result.faceStatus,
      faceCount: result.faceCount
    });
  } catch (error) {
    if (error instanceof DriveError) {
      console.error('학부모 업로드 완료 실패:', error.code, error.message);
      return res.status(400).json({ error: '사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', reason: error.code });
    }
    console.error('학부모 업로드 완료 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** DELETE /api/parent/events/:id/media/:mediaId — 본인이 올린 것만 */
export const deleteMedia = async (req, res) => {
  try {
    const context = await loadAlbumContext(req);
    if (context.error) return context.error(res);

    const { event } = context;
    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없어요.' });

    if (!canDeleteMedia({ role: 'parent', userId: req.user.id, media })) {
      return res.status(403).json({ error: '내가 올린 사진만 지울 수 있어요.' });
    }

    await albumService.deleteMedia(event.userId, media);
    res.json({ message: 'Drive 휴지통으로 옮겼어요. 30일 안에 복구할 수 있어요.' });
  } catch (error) {
    console.error('학부모 사진 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** POST /api/parent/events/:id/media/:mediaId/confirm — 맞아요 / 아니에요 */
export const confirmTag = async (req, res) => {
  try {
    const context = await loadAlbumContext(req);
    if (context.error) return context.error(res);

    const { event, studentIds } = context;
    const media = await EventMedia.getById(parseInt(req.params.mediaId, 10));
    if (!media || media.eventId !== event.id) return res.status(404).json({ error: '사진을 찾을 수 없어요.' });

    const studentId = parseInt(req.body?.studentId, 10);
    if (!studentIds.includes(studentId)) return res.status(403).json({ error: '내 아이만 확인할 수 있어요.' });

    const confirmed = req.body?.confirmed !== false;
    const tag = await MediaTag.upsert({
      mediaId: media.id,
      studentId,
      source: confirmed ? 'parent_confirmed' : 'excluded',
      createdByUserId: req.user.id
    });

    res.json({ tag: { studentId: tag.studentId, source: tag.source } });
  } catch (error) {
    console.error('학부모 사진 확인 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// ───────── 자녀 기준 얼굴 ─────────

/** 자녀가 내 아이인지, 연결이 끝났는지 확인한다. */
const loadChild = async (req) => {
  const account = await teacherOf(req.user.id);
  if (!account) return null;

  const children = await ParentChild.listByParent(req.user.id);
  const child = children.find((row) => String(row.id) === String(req.params.childId));
  if (!child || !child.studentId || child.status !== 'linked') return null;

  return { account, child };
};

/** GET /api/parent/children/:childId/faces */
export const listFaces = async (req, res) => {
  try {
    const loaded = await loadChild(req);
    if (!loaded) return res.status(404).json({ error: '아이를 찾을 수 없어요.' });

    const profiles = await ChildFaceProfile.listByStudent(loaded.child.studentId);
    res.json({
      items: profiles.map((profile) => ({
        id: profile.id,
        createdAt: profile.createdAt,
        mine: Number(profile.parentUserId) === Number(req.user.id),
        createdBy: profile.createdBy
      })),
      max: MAX_PER_PARENT
    });
  } catch (error) {
    console.error('자녀 얼굴 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * POST /api/parent/children/:childId/faces
 * 브라우저가 얼굴을 정확히 1개 찾았을 때만 벡터를 보낸다 (개수 검사는 화면에서).
 * 등록 즉시 그 선생님의 앨범 전체와 맞춰 본다.
 */
export const addFace = async (req, res) => {
  try {
    const loaded = await loadChild(req);
    if (!loaded) return res.status(404).json({ error: '아이를 찾을 수 없어요.' });

    if (req.body?.consent !== true) {
      return res.status(400).json({ error: '동의를 확인해 주세요.', reason: 'consent_required' });
    }

    const descriptor = req.body?.descriptor;
    if (!isValidDescriptor(descriptor)) {
      return res.status(400).json({ error: '얼굴 정보를 읽지 못했어요. 정면 사진으로 다시 시도해 주세요.', reason: 'invalid_descriptor' });
    }

    const [mine, total] = await Promise.all([
      ChildFaceProfile.countByParentAndStudent(req.user.id, loaded.child.studentId),
      ChildFaceProfile.countByStudent(loaded.child.studentId)
    ]);
    if (mine >= MAX_PER_PARENT) {
      return res.status(400).json({ error: `얼굴 사진은 ${MAX_PER_PARENT}장까지 등록할 수 있어요.`, reason: 'limit' });
    }
    if (total >= MAX_PER_STUDENT) {
      return res.status(400).json({ error: '이 아이에 등록된 사진이 이미 충분해요.', reason: 'limit' });
    }

    const profile = await ChildFaceProfile.create({
      studentId: loaded.child.studentId,
      teacherUserId: loaded.account.teacherId,
      parentUserId: req.user.id,
      createdBy: 'parent',
      descriptor: encodeDescriptor(descriptor),
      consentAt: new Date().toISOString()
    });

    const matched = await albumService.matchStudentAcrossAlbums(loaded.account.teacherId, loaded.child.studentId);

    res.status(201).json({
      profile: { id: profile.id, createdAt: profile.createdAt, mine: true },
      matched
    });
  } catch (error) {
    console.error('자녀 얼굴 등록 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** DELETE /api/parent/children/:childId/faces/:profileId */
export const deleteFace = async (req, res) => {
  try {
    const loaded = await loadChild(req);
    if (!loaded) return res.status(404).json({ error: '아이를 찾을 수 없어요.' });

    const profile = await ChildFaceProfile.getById(parseInt(req.params.profileId, 10));
    if (!profile || profile.studentId !== loaded.child.studentId) {
      return res.status(404).json({ error: '얼굴 사진을 찾을 수 없어요.' });
    }
    if (Number(profile.parentUserId) !== Number(req.user.id)) {
      return res.status(403).json({ error: '내가 올린 사진만 지울 수 있어요.' });
    }

    await ChildFaceProfile.delete(profile.id);

    // 남은 기준 얼굴이 없으면 자동 태그도 함께 지운다 (FR-263).
    const remaining = await ChildFaceProfile.countByStudent(loaded.child.studentId);
    if (remaining === 0) {
      await MediaTag.removeAutoTagsForStudent(loaded.child.studentId);
    } else {
      await albumService.matchStudentAcrossAlbums(loaded.account.teacherId, loaded.child.studentId);
    }

    res.json({ message: '얼굴 사진을 지웠어요.', remaining });
  } catch (error) {
    console.error('자녀 얼굴 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default {
  listAlbums, listMedia, createUploads, completeUpload, deleteMedia, confirmTag,
  listFaces, addFace, deleteFace
};
