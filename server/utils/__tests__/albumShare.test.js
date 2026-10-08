import { parentAlbumPath, albumSharePath } from '../albumShare.js';

describe('사진 폴더 공유 링크 (docs/photo-menu FR-518)', () => {
  it('학부모 앱의 앨범 주소에 초대 토큰을 붙인다', () => {
    expect(parentAlbumPath(34)).toBe('/parent/photos/34');
    expect(albumSharePath(34, 'tok')).toBe('/parent/photos/34?invite=tok');
  });

  it('초대 토큰이 없으면 앨범 주소만', () => {
    expect(albumSharePath(34, null)).toBe('/parent/photos/34');
    expect(albumSharePath(34, '')).toBe('/parent/photos/34');
  });
});
