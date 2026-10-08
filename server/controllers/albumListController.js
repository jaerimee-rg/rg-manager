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

export default { listAlbums };
