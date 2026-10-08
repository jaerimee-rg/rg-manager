import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MediaViewer from '../MediaViewer';

const media = (overrides = {}) => ({
  id: 1,
  kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w400',
  largeUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w1600',
  originalUrl: 'https://drive.google.com/file/d/f1/view',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=f1',
  previewUrl: null,
  fileName: 'IMG_1.jpg',
  takenAt: '2026-10-05T11:26:00',
  uploader: 'teacher',
  canDelete: false,
  myTags: [],
  ...overrides
});

const video = (id, overrides = {}) => media({
  id,
  kind: 'video',
  fileName: `VID_${id}.mov`,
  previewUrl: `https://drive.google.com/file/d/v${id}/preview`,
  ...overrides
});

describe('MediaViewer — 영상', () => {
  it('Drive 플레이어가 16:9 상자가 아니라 가운데 칸을 꽉 채운다', () => {
    render(<MediaViewer items={[video(1), video(2)]} startId={1} onClose={jest.fn()} />);

    const player = screen.getByTitle('VID_1.mov');
    expect(player.tagName).toBe('IFRAME');
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview');
    // 플레이어 칸이 남은 높이를 모두 받고, 넓은 화면에서는 iframe 이 그 칸을 그대로 채운다
    const box = player.parentElement;
    expect(box.style.flexGrow).toBe('1');
    expect(box.parentElement).toBe(screen.getByTestId('video-stage'));
    expect(screen.getByTestId('video-stage').style.alignSelf).toBe('stretch');
    expect(player.style.width).toBe('100%');
    expect(player.style.height).toBe('100%');
    expect(player.style.transform).toBe('none');
    // 휴대폰에서 전체 화면으로 키울 수 있게
    expect(player).toHaveAttribute('allowfullscreen');
    expect(player.getAttribute('allow')).toContain('fullscreen');
  });

  describe('좁은 화면(휴대폰)', () => {
    // jsdom 은 배치를 하지 않아 크기가 늘 0 이다 — 아이폰 세로 크기의 칸을 흉내 낸다.
    // clientWidth 는 Element.prototype 에 있으므로, 덮어쓴 것을 지우면 원래대로 돌아간다.
    const sizes = { clientWidth: 390, clientHeight: 645 };

    beforeEach(() => {
      Object.keys(sizes).forEach((key) => {
        Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => sizes[key] });
      });
    });
    afterEach(() => {
      Object.keys(sizes).forEach((key) => { delete HTMLElement.prototype[key]; });
    });

    it('플레이어를 520px 폭으로 그린 뒤 줄여 보여 준다 — Drive 컨트롤이 영상 가운데가 아니라 아래 막대로 간다', () => {
      render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

      const player = screen.getByTitle('VID_1.mov');
      expect(player.style.width).toBe('520px');
      expect(player.style.height).toBe('860px');
      expect(player.style.transform).toBe('scale(0.75)');
      expect(player.style.transformOrigin).toBe('top left');
      // 줄인 결과가 넘치지 않게 칸이 자른다
      expect(player.parentElement.style.overflow).toBe('hidden');
    });
  });

  it('이전/다음 버튼은 플레이어 위가 아니라 위쪽 막대에 있다 — Drive 컨트롤을 가리지 않는다', () => {
    render(<MediaViewer items={[video(1), video(2)]} startId={1} onClose={jest.fn()} />);

    const stageArea = screen.getByTestId('video-stage').parentElement;
    expect(within(stageArea).queryByRole('button', { name: '다음 사진' })).toBeNull();
    expect(within(stageArea).queryByRole('button', { name: '이전 사진' })).toBeNull();

    const next = screen.getByRole('button', { name: '다음 사진' });
    expect(next.style.position).toBe('');
    expect(next.parentElement).toHaveTextContent('1 / 2');
  });

  it('다음을 누르면 다음 영상 플레이어로, 사진이면 사진으로 바뀐다', () => {
    render(
      <MediaViewer items={[video(1), video(2), media({ id: 3, fileName: 'IMG_3.jpg' })]} startId={1} onClose={jest.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.getByTitle('VID_2.mov')).toHaveAttribute('src', 'https://drive.google.com/file/d/v2/preview');
    expect(screen.queryByTitle('VID_1.mov')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.queryByTestId('video-stage')).toBeNull();
    expect(screen.getByRole('img', { name: 'IMG_3.jpg' })).toHaveAttribute('src', 'https://drive.google.com/thumbnail?id=f1&sz=w1600');
    // 사진일 때는 예전처럼 사진 양옆에 떠 있다
    expect(screen.getByRole('button', { name: '다음 사진' }).style.position).toBe('absolute');
  });

  it('재생 시간을 보여 주고, 원본 보기 버튼은 없다 — 아래에는 저장만 남는다', () => {
    render(<MediaViewer items={[video(1, { durationMs: 43000 })]} startId={1} onClose={jest.fn()} />);

    expect(screen.getByText('Google Drive 플레이어로 재생 · 0:43')).toBeInTheDocument();
    expect(screen.queryByText(/원본 보기/)).toBeNull();
    expect(screen.getByRole('link', { name: /저장/ })).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=f1');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('하나뿐이면 이전/다음 버튼이 없다', () => {
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '다음 사진' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전 사진' })).toBeNull();
  });
});
