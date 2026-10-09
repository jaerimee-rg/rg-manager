import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/EventMedia.js', () => ({ default: { getById: jest.fn() } }));
jest.unstable_mockModule('../../models/AlbumView.js', () => ({
  VIEW_DEDUPE_MS: { album: 1, media: 1 },
  default: { record: jest.fn().mockResolvedValue(true), adminLog: jest.fn() }
}));
jest.unstable_mockModule('../parentAlbumController.js', () => ({ loadAlbumContext: jest.fn() }));

const EventMedia = (await import('../../models/EventMedia.js')).default;
const AlbumView = (await import('../../models/AlbumView.js')).default;
const { loadAlbumContext } = await import('../parentAlbumController.js');
const { recordView, listPhotoViewLog } = await import('../albumViewController.js');

const photo = (overrides = {}) => ({ id: 41, eventId: 3, status: 'ready', isHidden: false, ...overrides });
let req;
let res;

beforeEach(() => {
  jest.clearAllMocks();
  req = { params: { id: '3' }, body: {}, query: {}, user: { id: 9, role: 'parent' } };
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  loadAlbumContext.mockResolvedValue({ event: { id: 3 } });
  EventMedia.getById.mockResolvedValue(photo());
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('학부모 — 본 기록 남기기', () => {
  it('앨범을 열면 kind album (mediaId 없음)', async () => {
    await recordView(req, res);
    expect(AlbumView.record).toHaveBeenCalledWith({ eventId: 3, mediaId: null, userId: 9, kind: 'album' });
    expect(res.json).toHaveBeenCalledWith({ recorded: true });
  });

  it('사진을 크게 보면 kind media', async () => {
    req.body = { mediaId: 41 };
    await recordView(req, res);
    expect(AlbumView.record).toHaveBeenCalledWith({ eventId: 3, mediaId: 41, userId: 9, kind: 'media' });
  });

  it.each([
    ['숨긴 사진', photo({ isHidden: true })],
    ['다른 앨범', photo({ eventId: 99 })],
    ['올리는 중', photo({ status: 'uploading' })],
    ['없는 사진', null]
  ])('%s 은 404 — 남기지 않는다', async (_label, row) => {
    EventMedia.getById.mockResolvedValue(row);
    req.body = { mediaId: 41 };
    await recordView(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(AlbumView.record).not.toHaveBeenCalled();
  });

  it('id 가 숫자가 아니면 404', async () => {
    req.body = { mediaId: '41' };
    await recordView(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(EventMedia.getById).not.toHaveBeenCalled();
  });

  it('볼 수 없는 앨범이면 그 이유 그대로(403 등)', async () => {
    loadAlbumContext.mockResolvedValue({ error: (r) => r.status(403).json({ reason: 'album_private' }) });
    await recordView(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(AlbumView.record).not.toHaveBeenCalled();
  });
});

describe('관리자 — 사진 보기 로그', () => {
  it('관리자가 아니면 403', async () => {
    req.user = { id: 7, role: 'user' };
    await listPhotoViewLog(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(AlbumView.adminLog).not.toHaveBeenCalled();
  });

  it('누가 · 어느 선생님의 어느 앨범 · 어떤 사진을 봤는지 — 지운 사진은 표시만, 자동 식별자는 "학부모"', async () => {
    req.user = { id: 1, role: 'admin' };
    req.query = { kind: 'media', limit: '500', offset: '-3' };
    AlbumView.adminLog.mockResolvedValue({
      total: 2,
      rows: [
        { id: 2, kind: 'media', createdAt: 't2', viewerName: '예림엄마', teacherName: '이재림', eventId: 3, eventTitle: '회장배',
          eventDate: '2026-10-12', mediaId: 41, mediaKind: 'image', originalName: 'IMG_1.jpg', driveFileId: 'd41' },
        { id: 1, kind: 'media', createdAt: 't1', viewerName: '카카오_1', teacherName: '이재림', eventId: 3, eventTitle: '회장배',
          eventDate: '2026-10-12', mediaId: null }
      ]
    });

    await listPhotoViewLog(req, res);

    expect(AlbumView.adminLog).toHaveBeenCalledWith({ limit: 200, offset: 0, kind: 'media' });
    const { total, items } = res.json.mock.calls[0][0];
    expect(total).toBe(2);
    expect(items[0]).toMatchObject({ viewerName: '예림엄마', teacherName: '이재림', fileName: 'IMG_1.jpg', mediaDeleted: false });
    expect(items[0].thumbnailUrl).toContain('/d/d41=');
    expect(items[1]).toMatchObject({ viewerName: '학부모', mediaDeleted: true, thumbnailUrl: null });
  });

  it('모르는 kind 는 거르지 않는다', async () => {
    req.user = { id: 1, role: 'admin' };
    req.query = { kind: 'like' };
    AlbumView.adminLog.mockResolvedValue({ total: 0, rows: [] });
    await listPhotoViewLog(req, res);
    expect(AlbumView.adminLog).toHaveBeenCalledWith({ limit: 50, offset: 0, kind: null });
  });
});
