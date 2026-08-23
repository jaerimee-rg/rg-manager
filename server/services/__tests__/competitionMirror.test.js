import { jest } from '@jest/globals';

jest.unstable_mockModule('../../database.js', () => ({
  default: { query: jest.fn() }
}));

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { getByCompetitionId: jest.fn(), create: jest.fn(), update: jest.fn() }
}));

const pool = (await import('../../database.js')).default;
const Event = (await import('../../models/Event.js')).default;
const { mirrorFromCompetition, syncCompetitionMirror, backfillCompetitionEvents } =
  await import('../competitionMirror.js');

const competition = { id: 99, name: '서울시 대회', date: '2026-09-12', location: '올림픽공원', userId: 7 };

describe('competitionMirror', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('대회를 만들면 접수가 닫힌 이벤트를 만든다', async () => {
    Event.getByCompetitionId.mockResolvedValue(null);
    Event.create.mockResolvedValue({ id: 1 });

    await mirrorFromCompetition(competition);

    expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'competition',
      title: '서울시 대회',
      competitionId: 99,
      registrationOpen: false,
      isPublished: true
    }));
  });

  it('이미 이벤트가 있으면 새로 만들지 않는다', async () => {
    Event.getByCompetitionId.mockResolvedValue({ id: 1, options: [] });
    Event.update.mockResolvedValue({ id: 1 });

    await mirrorFromCompetition(competition);

    expect(Event.create).not.toHaveBeenCalled();
    expect(Event.update).toHaveBeenCalled();
  });

  it('동기화가 실패해도 예외를 밖으로 던지지 않는다', async () => {
    Event.getByCompetitionId.mockRejectedValue(new Error('db down'));

    await expect(mirrorFromCompetition(competition)).resolves.toBeNull();
  });

  it('대회를 수정하면 이벤트 이름·날짜·장소를 맞춘다', async () => {
    Event.getByCompetitionId.mockResolvedValue({ id: 1, options: [{ id: 'opt_a', label: '볼' }] });
    Event.update.mockResolvedValue({ id: 1 });

    await syncCompetitionMirror({ ...competition, name: '이름 변경' });

    const patch = Event.update.mock.calls[0][1];
    expect(patch.title).toBe('이름 변경');
    // 옵션 등 이벤트 고유 설정은 건드리지 않는다
    expect(patch.options).toEqual([{ id: 'opt_a', label: '볼' }]);
  });

  it('이벤트가 없던 대회를 수정하면 그때 만들어 준다', async () => {
    Event.getByCompetitionId.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    Event.create.mockResolvedValue({ id: 1 });

    await syncCompetitionMirror(competition);

    expect(Event.create).toHaveBeenCalled();
  });

  it('id 가 없으면 아무것도 하지 않는다', async () => {
    await expect(mirrorFromCompetition(null)).resolves.toBeNull();
    expect(Event.getByCompetitionId).not.toHaveBeenCalled();
  });

  it('백필은 아직 옮기지 않은 대회만 넣는다 (재실행 안전)', async () => {
    pool.query.mockResolvedValue({ rowCount: 3 });

    const moved = await backfillCompetitionEvents();

    expect(moved).toBe(3);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('INSERT INTO events');
    expect(sql).toContain('FALSE');
  });
});
