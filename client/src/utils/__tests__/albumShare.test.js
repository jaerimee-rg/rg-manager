import {
  parentAlbumPath, albumShareUrl, canShareAlbum, albumShareToast, ALBUM_SHARE_DISABLED_HINT
} from '../albumShare';

describe('사진 폴더 공유 링크 (docs/photo-menu FR-518)', () => {
  it('서버가 준 sharePath(초대 포함)를 도메인에 붙인다', () => {
    const album = { eventId: 34, sharePath: '/parent/photos/34?invite=tok' };
    expect(albumShareUrl(album, 'https://rg-manager.vercel.app')).toBe('https://rg-manager.vercel.app/parent/photos/34?invite=tok');
  });

  it('sharePath 가 없으면(옛 서버) 학부모 앨범 주소만 쓴다', () => {
    expect(parentAlbumPath(34)).toBe('/parent/photos/34');
    expect(albumShareUrl({ eventId: 34 }, 'https://x.test')).toBe('https://x.test/parent/photos/34');
  });

  it('공개한 앨범만 공유할 수 있다', () => {
    expect(canShareAlbum({ driveFolderId: 'f', published: true })).toBe(true);
    expect(canShareAlbum({ driveFolderId: 'f', published: false })).toBe(false);
    expect(canShareAlbum({ driveFolderId: null, published: true })).toBe(false);
    expect(canShareAlbum(null)).toBe(false);
    expect(ALBUM_SHARE_DISABLED_HINT).toMatch(/공개한 앨범만/);
  });

  it('공개 범위가 참가 확정 학부모면 복사 알림에서 그 사실을 알려 준다', () => {
    expect(albumShareToast({ audience: 'participants' })).toMatch(/참가 확정 학부모만/);
    expect(albumShareToast({ audience: 'all' })).toMatch(/처음이면 가입/);
  });
});
