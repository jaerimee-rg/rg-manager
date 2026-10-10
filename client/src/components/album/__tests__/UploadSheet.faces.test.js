import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * 업로드할 때 얼굴 분석 결과를 서버에 어떻게 보고하는가.
 * faces: null → 서버가 skipped(다시 분석 대상), faces: [] → none(얼굴 없음). 실패를 [] 로 보내면 안 된다.
 */

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ ANALYSIS_LONG_SIDE: 1920, FACE_ANALYZER_VERSION: 3, detectFaces: jest.fn() }));
jest.mock('../../../utils/driveUpload', () => ({
  uploadToDrive: jest.fn().mockResolvedValue({ ok: true, file: { id: 'drive-1' } })
}));
jest.mock('../../../utils/imagePrep', () => ({
  MAX_FILES: 30,
  partitionFiles: (list) => ({ accepted: Array.from(list).map((file) => ({ file, kind: 'image' })), rejected: [], overflow: 0 }),
  batchRanges: jest.requireActual('../../../utils/imagePrep').batchRanges,
  readTakenAt: jest.fn().mockResolvedValue('2026-10-12T01:00:00Z'),
  makePreview: jest.fn()
}));

import { fetchWithAuth } from '../../../utils/api';
import { detectFaces } from '../../../utils/faceClient';
import { makePreview } from '../../../utils/imagePrep';
import UploadSheet from '../UploadSheet';

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const FACE = { box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, score: 0.9, descriptor: new Array(512).fill(0.1) };

beforeEach(() => {
  jest.clearAllMocks();
  makePreview.mockResolvedValue({ tagName: 'CANVAS' });
  fetchWithAuth.mockImplementation((url) => {
    if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
    if (url.includes('/complete')) return ok({ media: {} });
    return ok({});
  });
});

const upload = async (apiBase = '/api/events/31') => {
  render(<UploadSheet apiBase={apiBase} eventTitle="회장배 대회" onClose={() => {}} />);
  await act(async () => {
    fireEvent.change(screen.getByTestId('album-file-input'), {
      target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }
    });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '1개 올리기' }));
  });
  await screen.findByText('다 올렸어요');
};

const saveCalls = () => fetchWithAuth.mock.calls.filter(([url]) => /\/media\/\d+\/faces$/.test(url));

const completeBody = () => {
  const call = fetchWithAuth.mock.calls.find(([url]) => url.includes('/complete'));
  return JSON.parse(call[1].body);
};

describe('UploadSheet — 얼굴 분석 결과 보고', () => {
  it('긴 변 1920 축소본으로 찾고, 찾은 방식의 버전을 함께 보낸다(서버가 예전 결과를 가려낸다)', async () => {
    detectFaces.mockResolvedValue([]);

    await upload();

    expect(makePreview).toHaveBeenCalledWith(expect.any(File), 1920);
    expect(completeBody().analyzerVersion).toBe(3);
  });

  it('분석이 실패하면 faces:null 로 보내고, 한 번 더 해도 안 되면 "자동으로 다시 찾아요" 라고 알린다', async () => {
    detectFaces.mockResolvedValue(null);

    await upload();

    expect(completeBody().faces).toBeNull();
    expect(detectFaces).toHaveBeenCalledTimes(2);   // 올릴 때 + 다 올린 뒤 한 번 더
    expect(saveCalls()).toHaveLength(0);
    expect(screen.getByText(/1장은 아직 얼굴을 찾지 못했어요 — 선생님 앨범에서 자동으로 다시 찾아요/)).toBeInTheDocument();
    expect(screen.queryByText(/얼굴 분석 .*장 완료/)).not.toBeInTheDocument();
  });

  it('브라우저가 사진을 못 읽으면(HEIC) 올릴 때는 faces:null, 다 올린 뒤 Drive 가 만든 JPEG(lh3 =s1920)로 다시 본다', async () => {
    makePreview.mockResolvedValue(null);
    detectFaces.mockResolvedValue(null);

    await upload();

    expect(completeBody().faces).toBeNull();
    expect(detectFaces).toHaveBeenCalledTimes(1);
    expect(detectFaces).toHaveBeenCalledWith('https://lh3.googleusercontent.com/d/drive-1=s1920');
    expect(screen.getByText(/1장은 아직 얼굴을 찾지 못했어요/)).toBeInTheDocument();
  });

  it('얼굴이 없는 사진은 faces:[] — 실패로 세지 않는다', async () => {
    detectFaces.mockResolvedValue([]);

    await upload();

    expect(completeBody().faces).toEqual([]);
    expect(screen.queryByText(/분석하지 못했어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/얼굴 분석 .*장 완료/)).not.toBeInTheDocument();
  });

  it('얼굴을 찾으면 특징값을 보내고 분석 완료로 센다', async () => {
    detectFaces.mockResolvedValue([FACE]);

    await upload();

    expect(completeBody().faces).toEqual([FACE]);
    expect(completeBody().analyzerVersion).toBe(3);
    expect(screen.getByText(/얼굴 분석 1장 완료/)).toBeInTheDocument();
    expect(screen.queryByText(/분석하지 못했어요/)).not.toBeInTheDocument();
  });
});

/**
 * 업로드 때 얼굴 계산이 실패한 사진은 다 올린 뒤 자동으로 한 번 더 — 분석 서버가 쉬다 깨어나느라 첫 요청이 실패했거나,
 * 브라우저가 못 읽는 HEIC 면 Drive 가 만든 JPEG 로. 사진은 이미 올라갔으므로 결과는 따로 POST .../faces 로 저장한다.
 */
describe('UploadSheet — 실패한 사진은 다 올린 뒤 자동으로 한 번 더', () => {
  it('두 번째에 찾으면 .../media/:id/faces 로 저장하고 분석 완료로 센다', async () => {
    detectFaces.mockResolvedValueOnce(null).mockResolvedValueOnce([FACE]);

    await upload();

    expect(completeBody().faces).toBeNull();   // 완료 보고는 먼저(실패한 채로) — 사진부터 올려 둔다
    const [url, options] = saveCalls()[0];
    expect(url).toBe('/api/events/31/media/9/faces');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ faces: [FACE], analyzerVersion: 3 });
    expect(makePreview).toHaveBeenCalledTimes(2);   // 다시 볼 때도 같은 축소본(원본 파일에서)
    expect(screen.getByText(/얼굴 분석 1장 완료/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 얼굴을 찾지 못했어요/)).not.toBeInTheDocument();
  });

  it('HEIC 도 Drive 의 JPEG 로 찾으면 저장한다', async () => {
    makePreview.mockResolvedValue(null);
    detectFaces.mockResolvedValue([]);

    await upload();

    expect(JSON.parse(saveCalls()[0][1].body)).toEqual({ faces: [], analyzerVersion: 3 });
    expect(screen.queryByText(/아직 얼굴을 찾지 못했어요/)).not.toBeInTheDocument();
  });

  it('저장이 실패하면 그대로 "아직 못 찾았어요" 로 센다', async () => {
    detectFaces.mockResolvedValueOnce(null).mockResolvedValueOnce([FACE]);
    fetchWithAuth.mockImplementation((url) => {
      if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
      if (url.includes('/complete')) return ok({ media: {} });
      if (url.endsWith('/faces')) return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) });
      return ok({});
    });

    await upload();

    expect(screen.getByText(/1장은 아직 얼굴을 찾지 못했어요/)).toBeInTheDocument();
  });

  it('학부모 앨범이면 학부모 주소로 저장한다', async () => {
    detectFaces.mockResolvedValueOnce(null).mockResolvedValueOnce([FACE]);

    await upload('/api/parent/events/3');

    expect(saveCalls()[0][0]).toBe('/api/parent/events/3/media/9/faces');
  });

  it('올리지 못한 사진은 다시 찾지 않는다', async () => {
    detectFaces.mockResolvedValue(null);
    fetchWithAuth.mockImplementation((url) => {
      if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
      if (url.includes('/complete')) return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: '저장 실패' }) });
      return ok({});
    });

    await upload();

    expect(detectFaces).toHaveBeenCalledTimes(1);
    expect(saveCalls()).toHaveLength(0);
  });

  it('다시 보는 동안 몇 장째인지 보여 준다', async () => {
    let second;
    detectFaces.mockResolvedValueOnce(null).mockImplementationOnce(() => new Promise((resolve) => { second = resolve; }));
    render(<UploadSheet apiBase="/api/events/31" eventTitle="회장배 대회" onClose={() => {}} />);
    await act(async () => {
      fireEvent.change(screen.getByTestId('album-file-input'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(await screen.findByText(/얼굴을 찾지 못한 사진을 한 번 더 보고 있어요… 0 \/ 1장/)).toBeInTheDocument();
    await act(async () => { second([FACE]); });
    await screen.findByText('다 올렸어요');
    expect(screen.queryByText(/한 번 더 보고 있어요/)).not.toBeInTheDocument();
  });
});

