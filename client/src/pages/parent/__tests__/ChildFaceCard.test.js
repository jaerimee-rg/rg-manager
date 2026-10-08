import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ detectSingleFace: jest.fn() }));
jest.mock('../../../utils/imagePrep', () => ({ makePreview: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import { detectSingleFace } from '../../../utils/faceClient';
import { makePreview } from '../../../utils/imagePrep';
import ChildFaceCard from '../ChildFaceCard';

const CHILDREN = [{ id: 5, childName: '이재림', status: 'linked', studentId: 9, faceProfileCount: 0 }];

const pickPhoto = async () => {
  render(<ChildFaceCard children={CHILDREN} />);
  fireEvent.click(screen.getByRole('button', { name: /얼굴 사진 등록/ }));
  fireEvent.click(screen.getByRole('button', { name: '사진 고르기' }));
  await act(async () => {
    fireEvent.change(screen.getByTestId('child-face-input'), {
      target: { files: [new File(['x'], 'face.jpg', { type: 'image/jpeg' })] }
    });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  makePreview.mockResolvedValue({ tagName: 'CANVAS' });
});

describe('ChildFaceCard — 얼굴 등록 안내', () => {
  it('분석이 실패하면 "얼굴이 보이지 않아요" 가 아니라 다시 시도하라고 알린다', async () => {
    detectSingleFace.mockResolvedValue({ ok: false, reason: 'failed' });

    await pickPhoto();

    expect(screen.getByRole('status')).toHaveTextContent('얼굴을 분석하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('얼굴이 없으면 정면 사진을 달라고 한다', async () => {
    detectSingleFace.mockResolvedValue({ ok: false, reason: 'none' });

    await pickPhoto();

    expect(screen.getByRole('status')).toHaveTextContent('얼굴이 보이지 않아요');
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });
});
