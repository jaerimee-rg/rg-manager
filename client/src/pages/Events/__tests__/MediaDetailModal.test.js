import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

import { fetchWithAuth } from '../../../utils/api';
import MediaDetailModal from '../MediaDetailModal';

const ok = (data = {}) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

const STUDENTS = [{ id: 1, name: '김하은' }, { id: 2, name: '박서연' }, { id: 3, name: '이지우' }];

const PHOTO = {
  id: 101, kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=a&sz=w400',
  largeUrl: 'https://drive.google.com/thumbnail?id=a&sz=w1600',
  originalUrl: 'https://drive.google.com/file/d/a/view',
  previewUrl: null,
  fileName: 'IMG_4001.JPG', size: 3200000, takenAt: '2026-09-12T01:12:00.000Z',
  uploaderRole: 'parent', uploaderName: '하은엄마',
  isHidden: false, faceStatus: 'done', faceCount: 3,
  faces: [
    { id: 1010, box: { x: 0.1, y: 0.1, w: 0.15, h: 0.2 }, score: 0.9 },   // 자동 매칭
    { id: 1011, box: { x: 0.4, y: 0.2, w: 0.12, h: 0.16 }, score: 0.8 },  // 확인 필요
    { id: 1012, box: { x: 0.7, y: 0.3, w: 0.1, h: 0.14 }, score: 0.7 }    // 미지정
  ],
  tags: [
    { studentId: 1, name: '김하은', source: 'face', distance: 0.34, faceId: 1010 },
    { studentId: 2, name: '박서연', source: 'candidate', distance: 0.55, faceId: 1011 }
  ]
};

const renderModal = async (media = PHOTO, props = {}) => {
  const onChanged = jest.fn();
  const onClose = jest.fn();
  await act(async () => {
    render(
      <MediaDetailModal
        eventId={7}
        media={media}
        students={STUDENTS}
        onClose={onClose}
        onChanged={onChanged}
        {...props}
      />
    );
  });
  return { onChanged, onClose };
};

describe('MediaDetailModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWithAuth.mockImplementation(() => ok({}));
  });

  it('얼굴 상자를 태그 상태에 맞는 색으로 그린다', async () => {
    await renderModal();

    const boxes = screen.getAllByTestId('face-box');
    expect(boxes).toHaveLength(3);
    expect(boxes[0].getAttribute('style').toLowerCase()).toContain('#3182f6'); // 매칭됨 파랑
    expect(boxes[1].getAttribute('style').toLowerCase()).toContain('#ff9f00'); // 확인 필요 주황
    expect(boxes[2].getAttribute('style').toLowerCase()).toContain('#00e07b'); // 미지정 초록
    expect(boxes[0].getAttribute('style')).toContain('left: 10%');
    expect(screen.getByText('미지정')).toBeInTheDocument();
    expect(screen.getByText('김하은 · 0.34')).toBeInTheDocument();
  });

  it('태그 출처와 정보를 보여준다', async () => {
    await renderModal();

    expect(screen.getByText('자동')).toBeInTheDocument();
    expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
    expect(screen.getByText('하은엄마')).toBeInTheDocument();
    expect(screen.getByText(/IMG_4001\.JPG · 3\.1MB/)).toBeInTheDocument();
    expect(screen.getByText('완료 · 얼굴 3개')).toBeInTheDocument();
  });

  it('해제를 누르면 태그를 지운다', async () => {
    const { onChanged } = await renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '해제' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/media/101/tags/1', { method: 'DELETE' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('학생을 고르면 수동 태그를 붙인다', async () => {
    const { onChanged } = await renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이지우' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/media/101/tags', {
      method: 'POST',
      body: JSON.stringify({ studentId: 3 })
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('학부모에게 숨기기는 bulk hide 로 보낸다', async () => {
    await renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '학부모에게 숨기기' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/media/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'hide', mediaIds: [101] })
    });
  });

  it('숨긴 사진에는 다시 보이기가 뜬다', async () => {
    await renderModal({ ...PHOTO, isHidden: true });

    expect(screen.getByRole('button', { name: '다시 보이기' })).toBeInTheDocument();
  });

  it('삭제는 확인을 받고 나서 지운다', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { onChanged } = await renderModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/events/7/media/101', { method: 'DELETE' });

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/media/101', { method: 'DELETE' });
    expect(onChanged).toHaveBeenCalledWith({ closed: true });
    confirmSpy.mockRestore();
  });

  it('영상은 얼굴 상자 대신 Drive 미리보기를 보여준다', async () => {
    await renderModal({
      ...PHOTO,
      kind: 'video',
      faces: [],
      faceStatus: 'skipped',
      previewUrl: 'https://drive.google.com/file/d/a/preview'
    });

    expect(screen.queryAllByTestId('face-box')).toHaveLength(0);
    expect(screen.getByTitle('영상 미리보기')).toHaveAttribute('src', 'https://drive.google.com/file/d/a/preview');
    expect(screen.getByText(/영상은 얼굴을 분석하지 않습니다/)).toBeInTheDocument();
  });
});
