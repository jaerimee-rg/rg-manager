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
jest.unstable_mockModule('../../models/FaceExclusion.js', () => ({
  default: {
    listForAlbums: jest.fn().mockResolvedValue([]),
    addPairs: jest.fn(async () => { calls.push('addPairs'); return 1; }),
    removePairs: jest.fn(async () => { calls.push('removePairs'); return 1; })
  }
}));
jest.unstable_mockModule('../../models/MediaTag.js', () => ({
  default: {
    listForAlbum: jest.fn(),
    listForAlbums: jest.fn(),
    removeAutoTagsForFaces: jest.fn(async () => { calls.push('removeTags'); return 1; }),
    upsert: jest.fn(async (tag) => { calls.push(`upsert:${tag.source}`); return tag; })
  }
}));
jest.unstable_mockModule('../../models/EventMedia.js', () => ({
  default: { refreshFaceCounts: jest.fn(async () => { calls.push('refreshCounts'); return 2; }) }
}));

const MediaFace = (await import('../../models/MediaFace.js')).default;
const MediaTag = (await import('../../models/MediaTag.js')).default;
const EventMedia = (await import('../../models/EventMedia.js')).default;
const FaceExclusion = (await import('../../models/FaceExclusion.js')).default;
const { removePerson, peopleAcross, albumPeople, excludePhotos, restorePhotos } = await import('../albumPeople.js');

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

describe('peopleAcross — 전체 사진의 얼굴 목록(모든 폴더를 함께 묶는다)', () => {
  it('폴더가 달라도 같은 아이는 한 사람 — 사진은 여러 폴더에 걸친다', async () => {
    // 앨범 3 의 사진 1, 앨범 5 의 사진 8 에 같은 얼굴(axis 0) · 사진 8 에 다른 사람(axis 4)
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(41, 8, axis(0)), face(42, 8, axis(4))]);
    MediaTag.listForAlbums.mockResolvedValue([{ mediaId: 8, studentId: 9, source: 'face', faceId: 41 }]);

    const people = await peopleAcross([3, 5], { includeHidden: true });

    expect(MediaFace.listForAlbums).toHaveBeenCalledWith([3, 5], { includeHidden: true });
    expect(MediaTag.listForAlbums).toHaveBeenCalledWith([3, 5], { includeHidden: true });
    expect(people.map(({ key, mediaIds, studentId }) => ({ key, mediaIds, studentId }))).toEqual([
      { key: 'p21', mediaIds: [1, 8], studentId: 9 },
      { key: 'p42', mediaIds: [8], studentId: null }
    ]);
    expect(people[0].coverUrl).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\/f(1|8)=s/);
  });

  it('앨범이 없으면 읽지 않고 빈 목록', async () => {
    await expect(peopleAcross([])).resolves.toEqual([]);
    expect(MediaFace.listForAlbums).not.toHaveBeenCalled();
  });
});

describe('excludePhotos — 얼굴 목록에서 잘못 묶인 사진 빼기 ("이 얼굴 아님")', () => {
  // 가: 사진 1·2·3 (얼굴 21·22·23) · 나: 사진 2 (얼굴 31)
  beforeEach(() => {
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0)), face(23, 3, axis(0)), face(31, 2, axis(4))]);
    MediaTag.listForAlbums.mockResolvedValue([]);
    FaceExclusion.listForAlbums.mockResolvedValue([]);
  });

  it('등록 안 된 사람: 그 사진의 얼굴 모두 × 이 사람의 남는 얼굴 모두를 쌍으로 — 같은 사진의 다른 얼굴이 대신 들어오지 않게', async () => {
    const result = await excludePhotos([3, 5], 'p21', [2, 2, 'x'], { userId: 7 });

    expect(FaceExclusion.listForAlbums).toHaveBeenCalledWith([3, 5]);
    expect(MediaFace.listForAlbums).toHaveBeenCalledWith([3, 5], { includeHidden: true });
    expect(calls).toEqual(['BEGIN', 'addPairs', 'COMMIT']);
    expect(FaceExclusion.addPairs).toHaveBeenCalledWith([
      { faceId: 22, otherFaceId: 21 }, { faceId: 22, otherFaceId: 23 },
      { faceId: 31, otherFaceId: 21 }, { faceId: 31, otherFaceId: 23 }
    ], 7, mockClient);
    expect(MediaTag.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ removed: 1, key: 'p21' });
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('가장 작은 얼굴의 사진을 빼면 key 가 바뀐다 — 다시 묶어 남은 얼굴이 든 무리의 key 를 돌려준다', async () => {
    FaceExclusion.listForAlbums
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ faceId: 21, otherFaceId: 22 }, { faceId: 21, otherFaceId: 23 }]);

    const result = await excludePhotos([3], 'p21', [1], { userId: 7 });

    expect(FaceExclusion.addPairs.mock.calls[0][0]).toEqual([{ faceId: 21, otherFaceId: 22 }, { faceId: 21, otherFaceId: 23 }]);
    expect(result).toEqual({ removed: 1, key: 'p22' });
  });

  it('등록된 아이로 묶인 사람: 그 사진에 그 아이의 excluded 태그(그 얼굴과 함께) — "우리 아이만" 에서도 빠진다, 쌍은 적지 않는다', async () => {
    // 앨범 하나(앨범 화면)에서 — 앨범 하나를 읽는 쪽으로 간다
    MediaFace.listForAlbum.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0)), face(23, 3, axis(0)), face(31, 2, axis(4))]);
    MediaTag.listForAlbum.mockResolvedValue([{ mediaId: 1, studentId: 9, source: 'face', faceId: 21 }]);

    const result = await excludePhotos(3, 'p21', [2], { userId: 7 });

    expect(MediaFace.listForAlbum).toHaveBeenCalledWith(3, { includeHidden: true });
    expect(calls).toEqual(['BEGIN', 'upsert:excluded', 'COMMIT']);
    expect(MediaTag.upsert).toHaveBeenCalledWith(
      { mediaId: 2, studentId: 9, source: 'excluded', faceId: 22, createdByUserId: 7 }, mockClient
    );
    expect(FaceExclusion.addPairs).not.toHaveBeenCalled();
    expect(result.removed).toBe(1);
  });

  it('그 사람의 사진을 다 빼려 하면 all_photos, 그 사람의 사진이 아니면 not_in_person, 없는 사람이면 null — 아무것도 쓰지 않는다', async () => {
    await expect(excludePhotos([3], 'p21', [1, 2, 3])).resolves.toEqual({ blocked: 'all_photos' });
    await expect(excludePhotos([3], 'p21', [99])).resolves.toEqual({ blocked: 'not_in_person' });
    await expect(excludePhotos([3], 'p999', [1])).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('중간에 실패하면 되돌리고 던진다', async () => {
    FaceExclusion.addPairs.mockRejectedValueOnce(new Error('boom'));

    await expect(excludePhotos([3], 'p21', [2])).rejects.toThrow('boom');

    expect(calls).toEqual(['BEGIN', 'ROLLBACK']);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('뺀 사진 — removedMediaIds · restorePhotos', () => {
  it('등록 안 된 사람의 뺀 사진 = 이 사람의 얼굴과 쌍으로 적힌 얼굴의 사진 (지금 든 사진은 빼고)', async () => {
    // 가: 사진 1·3, 사진 2 의 얼굴 22 는 가와 쌍 → 따로 선다
    MediaFace.listForAlbum.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0)), face(23, 3, axis(0))]);
    MediaTag.listForAlbum.mockResolvedValue([]);
    FaceExclusion.listForAlbums.mockResolvedValue([{ faceId: 22, otherFaceId: 21 }, { faceId: 22, otherFaceId: 23 }]);

    const people = await albumPeople(3, { includeHidden: true });

    expect(FaceExclusion.listForAlbums).toHaveBeenCalledWith([3]);
    const ga = people.find((one) => one.key === 'p21');
    expect(ga.mediaIds).toEqual([1, 3]);
    expect(ga.removedMediaIds).toEqual([2]);
    expect(people.find((one) => one.key === 'p22').removedMediaIds).toEqual([]);
  });

  it('등록된 아이의 뺀 사진 = 그 아이의 excluded 태그가 붙은 사진 (학부모의 [아니에요] 도 든다)', async () => {
    MediaFace.listForAlbum.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0))]);
    MediaTag.listForAlbum.mockResolvedValue([
      { mediaId: 1, studentId: 9, source: 'face', faceId: 21 },
      { mediaId: 2, studentId: 9, source: 'excluded', faceId: 22 },
      { mediaId: 5, studentId: 9, source: 'excluded', faceId: null },
      { mediaId: 6, studentId: 4, source: 'excluded', faceId: null }
    ]);
    FaceExclusion.listForAlbums.mockResolvedValue([]);

    const people = await albumPeople(3, { includeHidden: true });

    expect(people.find((one) => one.studentId === 9).removedMediaIds).toEqual([2, 5]);
  });

  it('등록 안 된 사람: 다시 넣기는 뺀 사진의 얼굴과 이 사람 얼굴 사이의 쌍을 지운다', async () => {
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0)), face(23, 3, axis(0)), face(31, 2, axis(4))]);
    MediaTag.listForAlbums.mockResolvedValue([]);
    FaceExclusion.listForAlbums.mockResolvedValue([{ faceId: 22, otherFaceId: 21 }, { faceId: 22, otherFaceId: 23 }]);

    const result = await restorePhotos([3], 'p21', [2], { userId: 7 });

    expect(calls).toEqual(['BEGIN', 'removePairs', 'COMMIT']);
    expect(FaceExclusion.removePairs).toHaveBeenCalledWith([22, 31], [21, 23], mockClient);
    expect(MediaTag.upsert).not.toHaveBeenCalled();
    expect(result.restored).toBe(1);
  });

  it('등록된 아이: 다시 넣기는 excluded 를 선생님 태그(manual)로 — 그 얼굴 그대로, 다시 매칭에도 남는다', async () => {
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0))]);
    MediaTag.listForAlbums.mockResolvedValue([
      { mediaId: 1, studentId: 9, source: 'face', faceId: 21 },
      { mediaId: 2, studentId: 9, source: 'excluded', faceId: 22 }
    ]);
    FaceExclusion.listForAlbums.mockResolvedValue([]);

    const result = await restorePhotos([3], 'p21', [2], { userId: 7 });

    expect(MediaTag.upsert).toHaveBeenCalledWith(
      { mediaId: 2, studentId: 9, source: 'manual', faceId: 22, createdByUserId: 7 }, mockClient
    );
    expect(calls).toEqual(['BEGIN', 'upsert:manual', 'removePairs', 'COMMIT']);
    expect(result).toEqual({ restored: 1, key: 'p21' });
  });

  it('뺀 사진이 아니면 not_removed — 아무것도 쓰지 않는다', async () => {
    MediaFace.listForAlbums.mockResolvedValue([face(21, 1, axis(0)), face(22, 2, axis(0))]);
    MediaTag.listForAlbums.mockResolvedValue([]);
    FaceExclusion.listForAlbums.mockResolvedValue([]);

    await expect(restorePhotos([3], 'p21', [1])).resolves.toEqual({ blocked: 'not_removed' });
    expect(calls).toEqual([]);
  });
});
