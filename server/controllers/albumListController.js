import Event from '../models/Event.js';
import EventMedia from '../models/EventMedia.js';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import { isDriveConfigured } from '../utils/googleDrive.js';
import { folderNameFromEvent } from '../utils/mediaValidation.js';
import { thumbnailUrl, coverUrls, coverCropsOf } from '../utils/mediaSerializer.js';
import { todayKst } from '../services/eventService.js';
import { isPhotoFolder } from '../utils/albumAccess.js';
import albumService from '../services/albumService.js';
import AlbumView from '../models/AlbumView.js';

/**
 * 선생님 사진 메뉴 목록 (docs/photo-menu 5.1).
 *
 * 앨범 하나 = 이벤트(또는 이벤트 없이 만든 사진 폴더, type='folder') 하나. 앨범이 있는 것은 카드(albums)가 되고, 대회·스페셜·사진 폴더 전부가
 * [사진 올리기]의 "어느 이벤트 사진인가요?" 목록(targets)이 된다.
 * Google 은 부르지 않는다 — Drive 가 느리거나 끊겨도 목록은 바로 떠야 한다(용량은 앨범 화면에서).
 */

const toAlbum = (event, summary = {}, views = {}) => ({
  eventId: event.id,
  title: event.title,
  date: event.date,
  type: event.type,
  folderName: event.driveFolderName || null,
  albumStatus: event.albumStatus,
  published: event.albumPublished === true,
  audience: event.albumAudience || 'participants',
  publishedAt: event.albumPublishedAt || null,
  uploadOpen: event.albumUploadOpen !== false,
  counts: {
    images: summary.images || 0,
    videos: summary.videos || 0,
    hidden: summary.hidden || 0,
    fromParents: summary.fromParents || 0
  },
  previews: (summary.previews || []).map((id) => thumbnailUrl(id, 400)),
  // 선생님이 고른 대표 사진·영상(고른 순서, 최대 4장) — 있으면 카드 표지는 이것들만 (숨겼거나 지운 것은 빠지고, 다 빠지면 빈 목록이라
  // 최근 4장으로 돌아간다). 영상이면 Drive 가 만든 한 장면이 사진처럼 뜬다(재생 표시는 붙이지 않는다 — 사용자 결정 2026-10-09)
  covers: coverUrls(summary.covers || []),
  // 같은 순서로 대표 사진마다 보일 부분(없으면 null) — 카드가 그 부분을 보여 준다
  coverCrops: coverCropsOf(summary.covers || []),
  // 학부모가 이 앨범(폴더)을 연 횟수 · 사진을 크게 본 횟수 — 카드 오른쪽 아래 (AlbumView.countsByEvent)
  albumOpens: views.albumOpens || 0,
  mediaViews: views.mediaViews || 0
});

const toTarget = (event, summary, today) => ({
  eventId: event.id,
  title: event.title,
  date: event.date,
  type: event.type,
  upcoming: String(event.date || '') > today,
  hasAlbum: Boolean(event.driveFolderId),
  published: event.albumPublished === true,
  // 한 번이라도 공개한 적이 있는지 — 사진 폴더는 처음 공개할 때만 학부모에게 알림이 가서, 시트가 그 안내를 정한다
  publishedAt: event.albumPublishedAt || null,
  count: summary ? (summary.images || 0) + (summary.videos || 0) : 0,
  folderName: event.driveFolderName || folderNameFromEvent(event)
});

/** GET /api/albums */
export const listAlbums = async (req, res) => {
  try {
    const [events, account] = await Promise.all([
      Event.listForPhotos(req.user.id),
      GoogleDriveAccount.getByUserId(req.user.id)
    ]);

    const withAlbum = events.filter((event) => event.driveFolderId);
    const [summaries, views] = await Promise.all([
      EventMedia.summariesForTeacher(withAlbum.map((event) => event.id)),
      AlbumView.countsByEvent(withAlbum.map((event) => event.id))
    ]);
    const today = todayKst();

    res.json({
      drive: {
        configured: isDriveConfigured(),
        connected: Boolean(account),
        status: account ? account.status : 'none',
        email: account?.googleEmail || null,
        rootFolderName: account?.rootFolderName || 'RG Manager'
      },
      albums: withAlbum.map((event) => toAlbum(event, summaries[event.id], views[event.id])),
      targets: events.map((event) => toTarget(event, summaries[event.id], today))
    });
  } catch (error) {
    console.error('사진 목록 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

const TITLE_MAX = 100;   // 이벤트 폼과 같은 한도 (eventController.TITLE_MAX)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 2026-02-31 처럼 넘어가는 날짜도, 2026-13-01 처럼 읽을 수 없는 날짜도(toISOString 이 던진다) 거른다
const isRealDate = (date) => {
  if (!DATE_RE.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(date);
};

/**
 * POST /api/albums — 이벤트 없이 **사진 전용 폴더**를 만든다 (docs/photo-menu FR-517).
 * body { title, date } → type='folder' 행 하나(Event.createForPhotos). 이벤트 관리·학부모 일정에는 나오지 않는다.
 * Drive 폴더는 첫 업로드 때 "날짜 이름" 으로 만들어진다.
 * 같은 이름·날짜의 내 **사진 폴더**가 이미 있으면 새로 만들지 않고 그것을 돌려준다(두 번 눌러도 하나).
 * 이름이 같은 이벤트가 있어도 거기에 붙이지 않는다 — "새 폴더" 를 골랐으니 이벤트와는 따로다.
 * 응답의 target 은 GET 의 targets 한 줄과 같은 모양이라 업로드 시트가 그대로 쓴다.
 */
/** 폴더 이름·날짜 입력 확인 (만들기 · 고치기 공용). → { title, date } | { error } */
const parseFolderInput = (body) => {
  const title = String(body?.title ?? '').trim();
  const date = String(body?.date ?? '').trim();
  if (!title) return { error: '폴더 이름을 입력해 주세요.' };
  if (title.length > TITLE_MAX) return { error: `이름은 ${TITLE_MAX}자 이내로 입력해 주세요.` };
  if (!isRealDate(date)) return { error: '날짜를 선택해 주세요.' };
  return { title, date };
};

export const createPhotoFolder = async (req, res) => {
  try {
    const input = parseFolderInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const { title, date } = input;

    const today = todayKst();
    const mine = await Event.listForPhotos(req.user.id);
    const existing = mine.find((event) => isPhotoFolder(event) && event.title === title && event.date === date);
    if (existing) {
      const summaries = existing.driveFolderId ? await EventMedia.summariesForTeacher([existing.id]) : {};
      return res.json({ created: false, target: toTarget(existing, summaries[existing.id], today) });
    }

    const event = await Event.createForPhotos({ userId: req.user.id, title, date });
    res.status(201).json({ created: true, target: toTarget(event, null, today) });
  } catch (error) {
    console.error('사진 폴더 만들기 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

const NOT_A_FOLDER = {
  error: '이벤트 앨범이에요. 이름·날짜는 이벤트 관리에서 고쳐 주세요.',
  reason: 'not_photo_folder'
};

/**
 * 고치거나 지울 **사진 전용 폴더**를 읽는다. 앨범 화면과 같은 범위다(선생님 = 자기 것, 관리자 = 전부).
 * 이벤트 앨범의 이름·날짜는 여기서 고치지 않는다 — 이벤트 폼이 대회 행 동기화까지 맡는다.
 * 지우기는 이벤트 앨범도 받는다(`eventAlbums`) — 이벤트는 두고 앨범만 비운다(deletePhotoFolder).
 * → { event } | { status, body }
 */
const loadFolder = async (req, { eventAlbums = false } = {}) => {
  const id = parseInt(req.params.id, 10);
  const event = Number.isNaN(id) ? null : await Event.getById(id, req.user.id, req.user.role);
  if (!event) return { status: 404, body: { error: '사진 폴더를 찾을 수 없습니다.' } };
  if (!isPhotoFolder(event) && !eventAlbums) return { status: 400, body: NOT_A_FOLDER };
  return { event };
};

/**
 * PATCH /api/albums/:id — 사진 전용 폴더의 이름·날짜를 고친다 (docs/photo-menu FR-519).
 * Drive 폴더가 있으면 이름("날짜 이름")도 따라 바꾼다. Drive 쪽이 실패해도 저장은 끝난 것이다 —
 * `driveRenamed:false` 로 알리고, 앨범 화면의 [폴더 이름 맞추기] 로 나중에 맞춘다.
 * 같은 이름·날짜의 다른 폴더가 있으면 409 (새 폴더 만들기가 "같은 이름·날짜 = 같은 폴더" 로 찾기 때문에).
 */
export const updatePhotoFolder = async (req, res) => {
  try {
    const found = await loadFolder(req);
    if (!found.event) return res.status(found.status).json(found.body);
    const before = found.event;

    const input = parseFolderInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const { title, date } = input;

    const siblings = await Event.listForPhotos(before.userId);
    const clash = siblings.some((event) => event.id !== before.id && isPhotoFolder(event)
      && event.title === title && event.date === date);
    if (clash) {
      return res.status(409).json({ error: '같은 이름·날짜의 사진 폴더가 이미 있어요.', reason: 'folder_exists' });
    }

    const updated = await Event.updateFolder(before.id, { title, date });
    if (!updated) return res.status(404).json({ error: '사진 폴더를 찾을 수 없습니다.' });

    const sync = await albumService.syncFolderName(before.userId, before, updated);
    const expectedFolderName = folderNameFromEvent(updated);

    res.json({
      eventId: updated.id,
      title: updated.title,
      date: updated.date,
      expectedFolderName,
      driveFolderName: sync.renamed ? sync.name : (updated.driveFolderName || null),
      // Drive 폴더가 아직 없거나(첫 업로드 전) 이름이 그대로면 바꿀 것이 없다 — 그것도 "맞음" 이다
      driveRenamed: !updated.driveFolderId || sync.renamed || updated.driveFolderName === expectedFolderName
    });
  } catch (error) {
    console.error('사진 폴더 수정 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * DELETE /api/albums/:id — 사진 폴더를 지운다 (docs/photo-menu FR-519).
 * 앱의 폴더와 그 사진 기록(태그·얼굴 포함, CASCADE)이 사라져 학부모 화면에서도 바로 없어진다.
 * - 사진 전용 폴더: 행째 지운다.
 * - 이벤트 앨범(대회·스페셜): **이벤트는 남기고** 앨범만 비운다(Event.removeAlbum) — 신청·참가 학생·대회 행이 걸려 있어서
 *   이벤트 자체는 이벤트 관리에서만 지운다. 사진 목록에서 빠지고, 다시 올리면 새 앨범으로 시작한다.
 * **Google Drive 의 폴더와 원본 파일은 건드리지 않는다** — 이벤트를 지울 때와 같은 규칙이다.
 */
export const deletePhotoFolder = async (req, res) => {
  try {
    const found = await loadFolder(req, { eventAlbums: true });
    if (!found.event) return res.status(found.status).json(found.body);

    if (!isPhotoFolder(found.event)) {
      const target = found.event;
      // 앨범이 없는 이벤트(휴관일 포함)는 지울 사진 폴더가 없다
      if (!target.driveFolderId) {
        return res.status(404).json({ error: '이 이벤트에는 사진 폴더가 없어요.', reason: 'no_album' });
      }
      const removed = await Event.removeAlbum(target.id);
      if (!removed) return res.status(404).json({ error: '사진 폴더를 찾을 수 없습니다.' });
      return res.json({
        deleted: true,
        eventKept: true,
        driveFolderKept: true,
        driveFolderName: target.driveFolderName || null
      });
    }

    const deleted = await Event.delete(found.event.id, req.user.id, req.user.role);
    if (!deleted) return res.status(404).json({ error: '사진 폴더를 찾을 수 없습니다.' });

    res.json({
      deleted: true,
      // Drive 에 남는 폴더 — 화면이 "Drive 에는 그대로 있어요" 를 알려 준다
      driveFolderKept: Boolean(deleted.driveFolderId),
      driveFolderName: deleted.driveFolderName || null
    });
  } catch (error) {
    console.error('사진 폴더 삭제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { listAlbums, createPhotoFolder, updatePhotoFolder, deletePhotoFolder };
