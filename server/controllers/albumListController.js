import Event from '../models/Event.js';
import EventMedia from '../models/EventMedia.js';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import { isDriveConfigured } from '../utils/googleDrive.js';
import { folderNameFromEvent } from '../utils/mediaValidation.js';
import { thumbnailUrl } from '../utils/mediaSerializer.js';
import { todayKst } from '../services/eventService.js';

/**
 * 선생님 사진 메뉴 목록 (docs/photo-menu 5.1).
 *
 * 앨범 하나 = 이벤트 하나. 앨범이 있는 이벤트는 카드(albums)가 되고, 대회·스페셜 전부가
 * [사진 올리기]의 "어느 이벤트 사진인가요?" 목록(targets)이 된다.
 * Google 은 부르지 않는다 — Drive 가 느리거나 끊겨도 목록은 바로 떠야 한다(용량은 앨범 화면에서).
 */

const toAlbum = (event, summary = {}) => ({
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
  previews: (summary.previews || []).map((id) => thumbnailUrl(id, 400))
});

const toTarget = (event, summary, today) => ({
  eventId: event.id,
  title: event.title,
  date: event.date,
  type: event.type,
  upcoming: String(event.date || '') > today,
  hasAlbum: Boolean(event.driveFolderId),
  published: event.albumPublished === true,
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
    const summaries = await EventMedia.summariesForTeacher(withAlbum.map((event) => event.id));
    const today = todayKst();

    res.json({
      drive: {
        configured: isDriveConfigured(),
        connected: Boolean(account),
        status: account ? account.status : 'none',
        email: account?.googleEmail || null,
        rootFolderName: account?.rootFolderName || 'RG Manager'
      },
      albums: withAlbum.map((event) => toAlbum(event, summaries[event.id])),
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
 * POST /api/albums — 사진을 묶을 이벤트가 없을 때 "새 폴더(이벤트)" 를 만든다 (docs/photo-menu FR-517).
 * body { title, date } → 스페셜 이벤트 하나. Drive 폴더는 첫 업로드 때 그 이름으로 만들어진다.
 * 같은 이름·날짜의 내 이벤트가 이미 있으면 새로 만들지 않고 그것을 돌려준다(두 번 눌러도 하나).
 * 응답의 target 은 GET 의 targets 한 줄과 같은 모양이라 업로드 시트가 그대로 쓴다.
 */
export const createAlbumEvent = async (req, res) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const date = String(req.body?.date ?? '').trim();
    if (!title) return res.status(400).json({ error: '폴더(이벤트) 이름을 입력해 주세요.' });
    if (title.length > TITLE_MAX) return res.status(400).json({ error: `이름은 ${TITLE_MAX}자 이내로 입력해 주세요.` });
    if (!isRealDate(date)) return res.status(400).json({ error: '날짜를 선택해 주세요.' });

    const today = todayKst();
    const mine = await Event.listForPhotos(req.user.id);
    const existing = mine.find((event) => event.title === title && event.date === date);
    if (existing) {
      const summaries = existing.driveFolderId ? await EventMedia.summariesForTeacher([existing.id]) : {};
      return res.json({ created: false, target: toTarget(existing, summaries[existing.id], today) });
    }

    const event = await Event.createForPhotos({ userId: req.user.id, title, date });
    res.status(201).json({ created: true, target: toTarget(event, null, today) });
  } catch (error) {
    console.error('사진 폴더(이벤트) 만들기 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { listAlbums, createAlbumEvent };
