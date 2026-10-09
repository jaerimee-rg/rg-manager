import EventMedia from '../models/EventMedia.js';
import AlbumView from '../models/AlbumView.js';
import { loadAlbumContext } from './parentAlbumController.js';
import { isPlaceholderName } from '../utils/usernames.js';
import { thumbnailUrl } from '../utils/mediaSerializer.js';

/**
 * 학부모 사진 보기 기록 남기기 · 관리자 사진 보기 로그.
 * 학부모는 볼 수 있는 앨범(loadAlbumContext — 공개 · 공개 범위 확인)의 **숨기지 않은** 사진에만 남긴다. 볼 수 없는 사진의 id 를
 * 보내면 404 — 있는지조차 알리지 않는다.
 */

const fail = (res, label, error) => {
  console.error(`${label} 오류:`, error);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
};

/**
 * POST /api/parent/events/:id/views {mediaId?} — 앨범을 열었다(mediaId 없음) · 사진을 크게 봤다.
 * 화면은 기다리지 않는다(실패해도 보기는 계속). 같은 것을 잠깐 사이 다시 보면 남기지 않는다(AlbumView.VIEW_DEDUPE_MS).
 */
export const recordView = async (req, res) => {
  try {
    const ctx = await loadAlbumContext(req);
    if (ctx.error) return ctx.error(res);
    const raw = req.body?.mediaId;
    let mediaId = null;
    if (raw !== undefined && raw !== null) {
      mediaId = Number.isInteger(raw) && raw > 0 ? raw : null;
      const media = mediaId ? await EventMedia.getById(mediaId) : null;
      if (!media || Number(media.eventId) !== Number(ctx.event.id) || media.status !== 'ready' || media.isHidden) {
        return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });
      }
    }
    const recorded = await AlbumView.record({
      eventId: ctx.event.id, mediaId, userId: req.user.id, kind: mediaId ? 'media' : 'album'
    });
    return res.json({ recorded });
  } catch (error) {
    return fail(res, '사진 보기 기록', error);
  }
};

/** GET /api/logs/photo-views?kind=album|media&limit&offset — 누가 어떤 앨범·사진을 봤는지 (관리자만) */
export const listPhotoViewLog = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '관리자만 볼 수 있습니다.' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const kind = ['album', 'media'].includes(req.query.kind) ? req.query.kind : null;
    const { rows, total } = await AlbumView.adminLog({ limit, offset, kind });
    return res.json({
      total,
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        createdAt: row.createdAt,
        viewerName: row.viewerName && !isPlaceholderName(row.viewerName) ? row.viewerName : '학부모',
        teacherName: row.teacherName || null,
        eventId: row.eventId,
        eventTitle: row.eventTitle,
        eventDate: row.eventDate,
        mediaId: row.mediaId,
        mediaKind: row.mediaKind || null,
        fileName: row.originalName || null,
        // 사진을 지웠으면 기록만 남는다(mediaId NULL)
        mediaDeleted: row.kind === 'media' && !row.mediaId,
        thumbnailUrl: row.driveFileId ? thumbnailUrl(row.driveFileId, 200) : null
      }))
    });
  } catch (error) {
    return fail(res, '사진 보기 로그', error);
  }
};

export default { recordView, listPhotoViewLog };
