import { jest } from '@jest/globals';

// 사진 메뉴 "새 폴더(이벤트) 만들기"가 어떤 이벤트를 만드는지 — 쿼리에 넘기는 값으로 확인한다.
jest.unstable_mockModule('../../database.js', () => ({ default: { query: jest.fn() } }));

const pool = (await import('../../database.js')).default;
const Event = (await import('../Event.js')).default;

describe('Event.createForPhotos (docs/photo-menu FR-517)', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ id: 50, title: '가을 소풍', date: '2026-09-27', options: '[]' }] });
  });

  it('신청을 받지 않는 공개 스페셜 이벤트로, 앨범 범위는 모든 학부모로 만든다', async () => {
    const event = await Event.createForPhotos({ userId: 7, title: '가을 소풍', date: '2026-09-27' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/VALUES \(\$1, 'special', \$2, \$3, '\[\]', FALSE, TRUE, FALSE, 'all', \$4, \$4\)/);
    expect(sql).toMatch(/"isPublished", "registrationOpen",\s+"albumAudience"/);
    expect(params.slice(0, 3)).toEqual([7, '가을 소풍', '2026-09-27']);
    // 앨범 공개는 하지 않는다 — albumPublished 는 컬럼 기본값(false) 그대로
    expect(sql).not.toMatch(/albumPublished/);
    expect(event).toMatchObject({ id: 50, options: [] });
  });
});
