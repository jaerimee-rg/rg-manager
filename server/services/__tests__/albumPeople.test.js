import { jest } from '@jest/globals';

// 얼굴 목록에서 사람 빼기 — 한 트랜잭션에서 태그 → 얼굴 → 사진별 얼굴 수. DB 없이 순서와 되돌리기만 본다.
const calls = [];
const mockClient = {
  query: jest.fn(async (sql) => { calls.push(sql); return { rows: [] }; }),
  release: jest.fn()
};
jest.unstable_mockModule('../../database.js', () => ({ default: { connect: jest.fn(async () => mockClient), query: jest.fn() } }));
jest.unstable_mockModule('../../models/MediaFace.js', () => ({
  default: {
    listForAlbum: jest.fn(),
    listForAlbums: jest.fn(),
    deleteForAlbum: jest.fn(async () => { calls.push('deleteFaces'); return [1, 2, 2]; })
  }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listForAlbum: jest.fn(),
    listForAlbums: jest.fn(),
    removeAutoTagsForFaces: jest.fn(async () => { calls.push('removeTags'); return 1; })
  }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: { refreshFaceCounts: jest.fn(async () => { calls.push('refreshCounts'); return 2; }) }
}));

const MediaFace = (await import('../../models/MediaFace.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const { removePerson, teacherPeople } = await import('../albumPeople.js');

const axis = (i) => Float32Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0));
const face = (id, mediaId, descriptor) => ({
  id, mediaId, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, score: 0.9, descriptor, driveFileId: `f${mediaId}`
});

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  // 관계없는 사람(p21): 사진 1·2 / 아이(p31): 사진 2
  MediaFace.listForAlbum.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0)), face(31, 2, axis(4))]);
  MediaTag.listForAlbum.mockResolvedValue([{ mediaId: 1, studentId: 9, source: 'candidate', faceId: 21 }]);
});

describe('removePerson — 얼굴 목록에서 사람 빼기', () => {
  it('숨긴 사진까지 묶어 그 사람을 찾고, 태그 → 얼굴 → 얼굴 수 순서로 한 트랜잭션에서 지운다', async () => {
    const result = await removePerson(3, 'p21', { seenPhotoCount: 2 });

    expect(MediaFace.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: true });
    expect(calls).toEqual(['BEGIN', 'removeTags', 'deleteFaces', 'refreshCounts', 'COMMIT']);
    expect(MediaTag.removeAutoTagsForFaces).toHaveBeenCalledWith([21, 22], mockClient);
    expect(MediaFace.deleteForAlbum).toHaveBeenCalledWith([21, 22], 3, mockClient);
    expect(EventMedia.refreshFaceCounts).toHaveBeenCalledWith([1, 2], mockClient);   // 같은 사진은 한 번만
    expect(result).toEqual({ removedFaces: 3, photos: 2, removedTags: 1 });
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('그 사이 묶음이 바뀌어 없는 사람이면 null — 아무것도 지우지 않는다', async () => {
    await expect(removePerson(3, 'p999')).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('중간에 실패하면 되돌리고 던진다', async () => {
    MediaFace.deleteForAlbum.mockRejectedValueOnce(new Error('boom'));

    await expect(removePerson(3, 'p21', { seenPhotoCount: 2 })).rejects.toThrow('boom');

    expect(calls).toEqual(['BEGIN', 'removeTags', 'ROLLBACK']);
    expect(EventMedia.refreshFaceCounts).not.toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('등록된 아이로 묶인 사람은 빼지 않는다 — 트랜잭션도 열지 않는다', async () => {
    MediaTag.listForAlbum.mockResolvedValue([{ mediaId: 1, studentId: 9, source: 'manual', faceId: 21 }]);

    await expect(removePerson(3, 'p21', { seenPhotoCount: 2 })).resolves.toEqual({ blocked: 'student_person' });
    expect(calls).toEqual([]);
  });

  it('화면이 본 사진 수와 지금 묶음이 다르거나 없으면 그 사이 바뀐 것 — 아무것도 지우지 않는다', async () => {
    await expect(removePerson(3, 'p21', { seenPhotoCount: 3 })).resolves.toEqual({ blocked: 'person_changed' });
    await expect(removePerson(3, 'p21')).resolves.toEqual({ blocked: 'person_changed' });
    expect(calls).toEqual([]);
  });
});

describe('teacherPeople — 전체 사진의 얼굴 목록(모든 폴더를 함께 묶는다)', () => {
  it('폴더가 달라도 같은 아이는 한 사람 — 사진은 여러 폴더에 걸친다', async () => {
    // 앨범 3 의 사진 1, 앨범 5 의 사진 8 에 같은 얼굴(axis 0) · 사진 8 에 다른 사람(axis 4)
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(41, 8, axis(0)), face(42, 8, axis(4))]);
    MediaTag.listForAlbums.mockResolvedValue([{ mediaId: 8, studentId: 9, source: 'face', faceId: 41 }]);

    const people = await teacherPeople([3, 5], { includeHidden: true });

    expect(MediaFace.listForAlbums).toHaveBeenCalledWith([3, 5], { includeHidden: true });
    expect(MediaTag.listForAlbums).toHaveBeenCalledWith([3, 5], { includeHidden: true });
    expect(people.map(({ key, mediaIds, studentId }) => ({ key, mediaIds, studentId }))).toEqual([
      { key: 'p21', mediaIds: [1, 8], studentId: 9 },
      { key: 'p42', mediaIds: [8], studentId: null }
    ]);
    expect(people[0].coverUrl).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\/f(1|8)=s/);
  });

  it('앨범이 없으면 읽지 않고 빈 목록', async () => {
    await expect(teacherPeople([])).resolves.toEqual([]);
    expect(MediaFace.listForAlbums).not.toHaveBeenCalled();
  });
});
