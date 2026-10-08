jest.mock('../api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../faceClient', () => ({ FACE_ANALYZER_VERSION: 2, detectFaces: jest.fn() }));

import { fetchWithAuth } from '../api';
import { detectFaces } from '../faceClient';
import { reanalyzeAlbum } from '../faceReanalysis';

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const FACE = { box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, score: 0.9, descriptor: new Array(128).fill(0.1) };
const item = (id) => ({ id, driveFileId: `f${id}`, largeUrl: `https://lh3.googleusercontent.com/d/f${id}=s1920` });

/** afterId 로 페이지를 넘기는 가짜 서버. 저장에 실패한 사진도 목록에는 남는다(서버와 같다). */
const serve = (ids, { saveFails = [] } = {}) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url.includes('/media/unanalyzed')) {
      const params = new URL(url, 'http://x').searchParams;
      const afterId = Number(params.get('afterId'));
      const batch = Number(params.get('batch'));
      const rest = ids.filter((id) => id > afterId);
      return ok({ items: rest.slice(0, batch).map(item), remaining: ids.length });
    }
    const id = Number(url.match(/media\/(\d+)\/faces/)[1]);
    return Promise.resolve({ ok: !saveFails.includes(id), status: saveFails.includes(id) ? 500 : 200, json: () => Promise.resolve({}) });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reanalyzeAlbum', () => {
  it('afterId 로 한 바퀴 돌며 찾은 얼굴을 버전과 함께 저장한다', async () => {
    serve([3, 7, 9]);
    detectFaces.mockImplementation(async (url) => (url.includes('/f7=') ? [] : [FACE]));
    const onProgress = jest.fn();

    const result = await reanalyzeAlbum('/api/events/31', { batch: 2, onProgress });

    expect(result).toEqual({ done: 3, found: 2, failed: 0 });
    const lists = fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => url.includes('unanalyzed'));
    expect(lists).toEqual([
      '/api/events/31/media/unanalyzed?batch=2&afterId=0',
      '/api/events/31/media/unanalyzed?batch=2&afterId=7',
      '/api/events/31/media/unanalyzed?batch=2&afterId=9'
    ]);
    expect(detectFaces).toHaveBeenCalledWith('https://lh3.googleusercontent.com/d/f3=s1920');

    const save = fetchWithAuth.mock.calls.find(([url]) => url === '/api/events/31/media/7/faces');
    expect(save[1].method).toBe('POST');
    expect(JSON.parse(save[1].body)).toEqual({ faces: [], analyzerVersion: 2 });
    expect(onProgress).toHaveBeenLastCalledWith({ done: 3, total: 3 });
  });

  it('읽지 못한 사진은 저장하지 않고(그대로 대상에 남는다) 실패로 세며, 같은 바퀴에서 다시 받지 않는다', async () => {
    serve([3, 7]);
    detectFaces.mockImplementation(async (url) => (url.includes('/f3=') ? null : [FACE]));

    const result = await reanalyzeAlbum('/api/events/31', { batch: 5 });

    expect(result).toEqual({ done: 2, found: 1, failed: 1 });
    expect(fetchWithAuth.mock.calls.some(([url]) => url.includes('/media/3/faces'))).toBe(false);
    expect(detectFaces).toHaveBeenCalledTimes(2);
  });

  it('저장이 실패하면 실패로 센다', async () => {
    serve([3], { saveFails: [3] });
    detectFaces.mockResolvedValue([FACE]);

    await expect(reanalyzeAlbum('/api/events/31')).resolves.toEqual({ done: 1, found: 0, failed: 1 });
  });

  it('대상이 없으면 아무것도 하지 않는다', async () => {
    serve([]);

    await expect(reanalyzeAlbum('/api/events/31')).resolves.toEqual({ done: 0, found: 0, failed: 0 });
    expect(detectFaces).not.toHaveBeenCalled();
  });

  it('목록을 못 받으면 서버의 안내로 던진다', async () => {
    fetchWithAuth.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Drive 연결이 끊겼어요' }) });

    await expect(reanalyzeAlbum('/api/events/31')).rejects.toThrow('Drive 연결이 끊겼어요');
  });
});
