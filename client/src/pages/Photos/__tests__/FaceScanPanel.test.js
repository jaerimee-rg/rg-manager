import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

jest.mock('../../../utils/faceReanalysis', () => ({ reanalyzeAlbum: jest.fn() }));

import { reanalyzeAlbum } from '../../../utils/faceReanalysis';
import FaceScanPanel, { FACE_PREVIEW_LIMIT } from '../FaceScanPanel';

const crops = (mediaId, n, from = 0) => Array.from({ length: n }, (_, i) => ({ mediaId, src: `data:image/jpeg;base64,${mediaId}-${from + i}` }));
const shownSrcs = (list) => Array.from(list.querySelectorAll('img')).map((img) => img.getAttribute('src'));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('FaceScanPanel — 앨범의 [얼굴 찾기]', () => {
  it('찾을 사진이 없으면 아무것도 보이지 않는다', () => {
    const { container } = render(<FaceScanPanel apiBase="/api/events/31" count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('장 수를 알리고, 누르면 돌린 뒤 결과를 보여 주고 앨범을 다시 읽게 한다', async () => {
    let finish;
    reanalyzeAlbum.mockImplementation((apiBase, { onProgress }) => new Promise((resolve) => {
      onProgress({ done: 1, total: 3 });
      finish = () => resolve({ done: 3, found: 2, failed: 1 });
    }));
    const onDone = jest.fn();

    render(<FaceScanPanel apiBase="/api/events/31" count={3} onDone={onDone} />);
    expect(screen.getByText(/얼굴을 찾아 볼 사진이 3장 있어요/)).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });
    expect(reanalyzeAlbum).toHaveBeenCalledWith('/api/events/31', expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(screen.getByText(/얼굴 찾는 중… 1 \/ 3장/)).toBeInTheDocument();

    await act(async () => { finish(); });
    expect(screen.getByText(/사진 3장을 다시 봤어요. 2장에서 얼굴을 찾았어요./)).toBeInTheDocument();
    expect(screen.getByText(/1장은 읽지 못했어요/)).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith({ done: 3, found: 2, failed: 1 });
  });

  it('끝난 뒤 앨범을 다시 읽어 count 가 0 이 돼도 결과는 남아 있다', async () => {
    reanalyzeAlbum.mockResolvedValue({ done: 2, found: 2, failed: 0 });
    const { rerender } = render(<FaceScanPanel apiBase="/api/events/31" count={2} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });
    rerender(<FaceScanPanel apiBase="/api/events/31" count={0} />);

    expect(screen.getByText(/2장에서 얼굴을 찾았어요/)).toBeInTheDocument();
    expect(screen.queryByText(/읽지 못했어요/)).not.toBeInTheDocument();
  });

  it('목록을 못 받으면 안내하고 다시 누를 수 있다', async () => {
    reanalyzeAlbum.mockRejectedValue(new Error('Drive 연결이 끊겼어요'));
    render(<FaceScanPanel apiBase="/api/events/31" count={2} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });

    expect(screen.getByText('Drive 연결이 끊겼어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '얼굴 찾기' })).toBeEnabled();
  });

  it('찾는 동안 찾은 얼굴이 진행 막대 아래 작게 쌓이고, 끝난 뒤 결과 안내 아래에 남는다', async () => {
    let report;
    let finish;
    reanalyzeAlbum.mockImplementation((apiBase, { onProgress, onFaces }) => new Promise((resolve) => {
      report = (faces, done) => { onFaces(faces); onProgress({ done, total: 3 }); };
      finish = () => resolve({ done: 3, found: 2, failed: 0 });
    }));

    render(<FaceScanPanel apiBase="/api/events/31" count={3} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });
    expect(reanalyzeAlbum).toHaveBeenCalledWith('/api/events/31', expect.objectContaining({ onFaces: expect.any(Function) }));
    expect(screen.queryByRole('list', { name: /찾은 얼굴/ })).not.toBeInTheDocument();

    await act(async () => { report(crops(5, 2), 1); });
    expect(shownSrcs(screen.getByRole('list', { name: '찾은 얼굴 2개' })))
      .toEqual(['data:image/jpeg;base64,5-0', 'data:image/jpeg;base64,5-1']);

    await act(async () => { report(crops(8, 1), 2); });
    expect(screen.getByText(/얼굴 찾는 중… 2 \/ 3장/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '찾은 얼굴 3개' })).getAllByRole('listitem')).toHaveLength(3);

    await act(async () => { finish(); });
    expect(screen.getByText(/2장에서 얼굴을 찾았어요/)).toBeInTheDocument();
    expect(shownSrcs(screen.getByRole('list', { name: '찾은 얼굴 3개' }))).toHaveLength(3);
  });

  it(`얼굴은 ${FACE_PREVIEW_LIMIT}개까지만 그리고 나머지는 +N 으로 센다`, async () => {
    reanalyzeAlbum.mockImplementation(async (apiBase, { onFaces }) => {
      onFaces(crops(1, 20));
      onFaces(crops(2, 15));
      onFaces(crops(3, 4));
      return { done: 3, found: 3, failed: 0 };
    });

    render(<FaceScanPanel apiBase="/api/events/31" count={3} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });

    const list = screen.getByRole('list', { name: '찾은 얼굴 39개' });
    const srcs = shownSrcs(list);
    expect(srcs).toHaveLength(FACE_PREVIEW_LIMIT);
    expect(srcs[0]).toBe('data:image/jpeg;base64,1-0');
    expect(srcs[FACE_PREVIEW_LIMIT - 1]).toBe('data:image/jpeg;base64,2-9');   // 먼저 찾은 것부터 채운다
    expect(within(list).getByText('+9')).toBeInTheDocument();
  });

  it('얼굴을 하나도 못 찾았으면 얼굴 줄이 없다', async () => {
    reanalyzeAlbum.mockResolvedValue({ done: 2, found: 0, failed: 0 });
    render(<FaceScanPanel apiBase="/api/events/31" count={2} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });

    expect(screen.getByText(/0장에서 얼굴을 찾았어요/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /찾은 얼굴/ })).not.toBeInTheDocument();
  });

  it('다시 찾으면 지난번 얼굴은 지우고 새로 모은다', async () => {
    reanalyzeAlbum.mockImplementationOnce(async (apiBase, { onFaces }) => {
      onFaces(crops(1, 2));
      return { done: 1, found: 1, failed: 0 };
    });
    render(<FaceScanPanel apiBase="/api/events/31" count={2} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });
    expect(screen.getByRole('list', { name: '찾은 얼굴 2개' })).toBeInTheDocument();

    // 결과를 닫고 다시 [얼굴 찾기] — 도는 동안 지난번 얼굴이 남아 있으면 안 된다
    let report;
    reanalyzeAlbum.mockImplementationOnce((apiBase, { onFaces }) => new Promise(() => { report = onFaces; }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 찾기' })); });
    expect(screen.getByText(/얼굴 찾는 중/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /찾은 얼굴/ })).not.toBeInTheDocument();

    await act(async () => { report(crops(4, 1)); });
    expect(shownSrcs(screen.getByRole('list', { name: '찾은 얼굴 1개' }))).toEqual(['data:image/jpeg;base64,4-0']);
  });

  describe('autoStart — 앨범을 열면 누르지 않아도 찾는다', () => {
    it('찾을 사진이 있으면 바로 시작하고, 화면에 한 번만 — 끝난 뒤 남은 것은 버튼으로', async () => {
      reanalyzeAlbum.mockResolvedValue({ done: 2, found: 1, failed: 1 });
      const onDone = jest.fn();
      let rerender;
      await act(async () => {
        ({ rerender } = render(<FaceScanPanel apiBase="/api/events/31" count={2} onDone={onDone} autoStart />));
      });

      expect(reanalyzeAlbum).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledWith({ done: 2, found: 1, failed: 1 });
      expect(screen.getByText(/1장은 읽지 못했어요/)).toBeInTheDocument();

      // 앨범을 다시 읽어 읽지 못한 1장이 남아도, 결과를 닫아도 다시 돌지 않는다
      await act(async () => { rerender(<FaceScanPanel apiBase="/api/events/31" count={1} onDone={onDone} autoStart />); });
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      expect(reanalyzeAlbum).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '얼굴 찾기' })).toBeEnabled();
    });

    it('찾을 사진이 없으면 시작하지 않는다 — 나중에 생기면(업로드 뒤 앨범을 다시 읽으면) 그때 시작한다', async () => {
      reanalyzeAlbum.mockResolvedValue({ done: 1, found: 0, failed: 0 });
      let rerender;
      await act(async () => {
        ({ rerender } = render(<FaceScanPanel apiBase="/api/events/31" count={0} autoStart />));
      });
      expect(reanalyzeAlbum).not.toHaveBeenCalled();

      await act(async () => { rerender(<FaceScanPanel apiBase="/api/events/31" count={1} autoStart />); });
      expect(reanalyzeAlbum).toHaveBeenCalledTimes(1);
    });

    it('autoStart 가 없으면 누를 때만', async () => {
      await act(async () => { render(<FaceScanPanel apiBase="/api/events/31" count={2} />); });
      expect(reanalyzeAlbum).not.toHaveBeenCalled();
    });

    it('화면을 떠나면 멈추라고 알린다 (shouldStop)', async () => {
      let options;
      reanalyzeAlbum.mockImplementation((apiBase, opts) => { options = opts; return new Promise(() => {}); });
      let unmount;
      await act(async () => {
        ({ unmount } = render(<FaceScanPanel apiBase="/api/events/31" count={3} autoStart />));
      });

      expect(options.shouldStop()).toBe(false);
      unmount();
      expect(options.shouldStop()).toBe(true);
    });
  });
});

