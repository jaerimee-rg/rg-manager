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
    // 높이를 상자 비율로 정하지 않고, 남은 높이를 모두 받는다
    expect(player.style.flexGrow).toBe('1');
    expect(player.style.width).toBe('100%');
    expect(player.style.height).toBe('');
    expect(player.parentElement).toBe(screen.getByTestId('video-stage'));
    expect(screen.getByTestId('video-stage').style.alignSelf).toBe('stretch');
    // 휴대폰에서 전체 화면으로 키울 수 있게
    expect(player).toHaveAttribute('allowfullscreen');
    expect(player.getAttribute('allow')).toContain('fullscreen');
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

  it('재생 시간과, 안 될 때 원본 보기 안내를 함께 보여 준다', () => {
    render(<MediaViewer items={[video(1, { durationMs: 43000 })]} startId={1} onClose={jest.fn()} />);

    expect(screen.getByText(/Google Drive 플레이어로 재생 · 0:43 · 안 되면 ‘원본 보기’/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '원본 보기' })).toHaveAttribute('href', 'https://drive.google.com/file/d/f1/view');
  });

  it('하나뿐이면 이전/다음 버튼이 없다', () => {
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '다음 사진' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전 사진' })).toBeNull();
  });
});
