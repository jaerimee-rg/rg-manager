import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/faceReanalysis', () => ({ reanalyzeAlbum: jest.fn() }));

import { reanalyzeAlbum } from '../../../utils/faceReanalysis';
import FaceScanPanel from '../FaceScanPanel';

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
});
