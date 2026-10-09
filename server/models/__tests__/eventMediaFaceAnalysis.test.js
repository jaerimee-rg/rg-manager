import { jest } from '@jest/globals';

// 얼굴을 (다시) 찾을 사진의 조건 — 재분석 목록 · 앨범 통계(counts.unanalyzed) · 'unanalyzed' 필터가
// 같은 조건을 써야 화면의 "N장" 과 [얼굴 찾기] 가 도는 사진 수가 맞는다. DB 없이 보낸 SQL 만 본다.
const query = jest.fn().mockResolvedValue({ rows: [] });
jest.unstable_mockModule('../../database.js', () => ({ default: { query } }));

const { default: EventMedia, needsFaceAnalysisSql } = await import('../EventMedia.js');

const squash = (sql) => sql.replace(/\s+/g, ' ').trim();
const lastCall = () => query.mock.calls.at(-1);

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ rows: [] });
});

describe('needsFaceAnalysisSql', () => {
  it('사진만 — 못 찾았거나(pending·failed·skipped) 예전 방식(버전 3 미만·기록 없음)으로 찾은 것 — 브라우저 face-api 로 찾은 사진도 다시 찾는다', () => {
    expect(squash(needsFaceAnalysisSql('m.'))).toBe(
      `m.kind = 'image' AND (m."faceStatus" IN ('pending','failed','skipped') OR COALESCE(m."faceAnalyzerVersion", 1) < 3)`
    );
  });

  it('별칭 없이도 쓴다', () => {
    expect(needsFaceAnalysisSql()).toContain(`kind = 'image' AND ("faceStatus" IN`);
  });
});

describe('EventMedia — 얼굴 찾기', () => {
  it('listUnanalyzed — 같은 조건 · afterId 다음부터 · id 순서', async () => {
    await EventMedia.listUnanalyzed(3, 5, 40);

    const [sql, params] = lastCall();
    expect(squash(sql)).toContain(`AND ${squash(needsFaceAnalysisSql())} AND id > $3 ORDER BY id ASC LIMIT $2`);
    expect(params).toEqual([3, 5, 40]);
  });

  it('listUnanalyzed — afterId 를 안 주면 처음부터', async () => {
    await EventMedia.listUnanalyzed(3);
    expect(lastCall()[1]).toEqual([3, 5, 0]);
  });

  it('stats — unanalyzed 도 같은 조건으로 센다', async () => {
    query.mockResolvedValue({ rows: [{}] });
    await EventMedia.stats(3);

    expect(squash(query.mock.calls[0][0])).toContain(
      `COUNT(*) FILTER (WHERE status = 'ready' AND ${squash(needsFaceAnalysisSql())})::int AS unanalyzed`
    );
  });

  it("list filter 'unanalyzed' — 같은 조건", async () => {
    await EventMedia.list(3, { filter: 'unanalyzed' });
    expect(squash(lastCall()[0])).toContain(squash(needsFaceAnalysisSql('m.')));
  });

  it('setFaceStatus — 찾은 방식의 버전을 저장한다(안 주면 null)', async () => {
    await EventMedia.setFaceStatus(9, { faceStatus: 'none', faceCount: 0, analyzerVersion: 2 });
    expect(squash(lastCall()[0])).toContain('"faceAnalyzerVersion" = $6');
    expect(lastCall()[1]).toEqual([9, 'none', 0, null, expect.any(String), 2]);

    await EventMedia.setFaceStatus(9, { faceStatus: 'skipped' });
    expect(lastCall()[1][5]).toBeNull();
  });
});
