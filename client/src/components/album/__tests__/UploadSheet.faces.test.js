import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * 업로드할 때 얼굴 분석 결과를 서버에 어떻게 보고하는가.
 * faces: null → 서버가 skipped(다시 분석 대상), faces: [] → none(얼굴 없음). 실패를 [] 로 보내면 안 된다.
 */

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ ANALYSIS_LONG_SIDE: 1920, FACE_ANALYZER_VERSION: 2, detectFaces: jest.fn() }));
jest.mock('../../../utils/driveUpload', () => ({
  uploadToDrive: jest.fn().mockResolvedValue({ ok: true, file: { id: 'drive-1' } })
}));
jest.mock('../../../utils/imagePrep', () => ({
  MAX_FILES: 30,
  partitionFiles: (list) => ({ accepted: Array.from(list).map((file) => ({ file, kind: 'image' })), rejected: [] }),
  readTakenAt: jest.fn().mockResolvedValue('2026-10-12T01:00:00Z'),
  makePreview: jest.fn()
}));

import { fetchWithAuth } from '../../../utils/api';
import { detectFaces } from '../../../utils/faceClient';
import { makePreview } from '../../../utils/imagePrep';
import UploadSheet from '../UploadSheet';

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const FACE = { box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, score: 0.9, descriptor: new Array(128).fill(0.1) };

beforeEach(() => {
  jest.clearAllMocks();
  makePreview.mockResolvedValue({ tagName: 'CANVAS' });
  fetchWithAuth.mockImplementation((url) => {
    if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
    if (url.includes('/complete')) return ok({ media: {} });
    return ok({});
  });
});

const upload = async () => {
  render(<UploadSheet apiBase="/api/events/31" eventTitle="회장배 대회" onClose={() => {}} />);
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

const completeBody = () => {
  const call = fetchWithAuth.mock.calls.find(([url]) => url.includes('/complete'));
  return JSON.parse(call[1].body);
};

describe('UploadSheet — 얼굴 분석 결과 보고', () => {
  it('긴 변 1920 축소본으로 찾고, 찾은 방식의 버전을 함께 보낸다(서버가 예전 결과를 가려낸다)', async () => {
    detectFaces.mockResolvedValue([]);

    await upload();

    expect(makePreview).toHaveBeenCalledWith(expect.any(File), 1920);
    expect(completeBody().analyzerVersion).toBe(2);
  });

  it('분석이 실패하면 faces:null 로 보내고 "분석하지 못했어요" 라고 알린다', async () => {
    detectFaces.mockResolvedValue(null);

    await upload();

    expect(completeBody().faces).toBeNull();
    expect(screen.getByText(/1장은 분석하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/얼굴 분석 .*장 완료/)).not.toBeInTheDocument();
  });

  it('브라우저가 사진을 못 읽어도(HEIC) faces:null', async () => {
    makePreview.mockResolvedValue(null);

    await upload();

    expect(detectFaces).not.toHaveBeenCalled();
    expect(completeBody().faces).toBeNull();
    expect(screen.getByText(/1장은 분석하지 못했어요/)).toBeInTheDocument();
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
    expect(completeBody().analyzerVersion).toBe(2);
    expect(screen.getByText(/얼굴 분석 1장 완료/)).toBeInTheDocument();
    expect(screen.queryByText(/분석하지 못했어요/)).not.toBeInTheDocument();
  });
});
