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

describe('ChildFaceCard — 등록한 얼굴 사진 지우기', () => {
  const REGISTERED = [{ id: 5, childName: '이재림', status: 'linked', studentId: 9, faceProfileCount: 2 }];
  const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  const serve = ({ deleteResponse } = {}) => {
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (options.method === 'DELETE') {
        return deleteResponse || ok({ message: '얼굴 사진을 지웠어요.', remaining: 1 });
      }
      return ok({
        items: [
          { id: 21, createdAt: '2026-10-08T05:36:29.943Z', mine: true, createdBy: 'parent' },
          { id: 22, createdAt: '2026-10-09T01:00:00.000Z', mine: false, createdBy: 'parent' }
        ],
        max: 3
      });
    });
  };

  it('등록한 사진을 날짜와 함께 보여 주고, 내가 등록한 것에만 [삭제] 가 있다', async () => {
    serve();
    await act(async () => { render(<ChildFaceCard children={REGISTERED} />); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/children/5/faces');
    const list = screen.getByRole('list', { name: '이재림 등록한 얼굴 사진' });
    expect(list).toHaveTextContent('얼굴 사진 1');
    expect(list).toHaveTextContent('10월 8일');
    expect(list).toHaveTextContent('다른 보호자가 등록');
    expect(screen.getAllByRole('button', { name: /얼굴 사진 \d 삭제/ })).toHaveLength(1);
  });

  it('등록한 사진이 없는 아이는 목록을 읽지 않는다', async () => {
    await act(async () => { render(<ChildFaceCard children={CHILDREN} />); });

    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('[삭제] → 확인 → 지우고 목록·개수를 줄이고 다시 읽게 한다', async () => {
    serve();
    const onChanged = jest.fn();
    await act(async () => { render(<ChildFaceCard children={REGISTERED} onChanged={onChanged} />); });

    fireEvent.click(screen.getByRole('button', { name: '이재림 얼굴 사진 1 삭제' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('얼굴 사진을 지울까요?');
    expect(fetchWithAuth).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: 'DELETE' }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '지우기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/children/5/faces/21', { method: 'DELETE' });
    expect(screen.queryByRole('button', { name: /얼굴 사진 \d 삭제/ })).not.toBeInTheDocument();
    expect(screen.getByText('얼굴 사진 1장 등록됨')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('얼굴 사진을 지웠어요');
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('확인 창에서 취소하면 지우지 않는다', async () => {
    serve();
    await act(async () => { render(<ChildFaceCard children={REGISTERED} />); });

    fireEvent.click(screen.getByRole('button', { name: '이재림 얼굴 사진 1 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(fetchWithAuth).toHaveBeenCalledTimes(1);   // 목록 조회뿐
    expect(screen.getByRole('button', { name: '이재림 얼굴 사진 1 삭제' })).toBeInTheDocument();
  });

  it('서버가 거절하면 이유를 알리고 목록은 그대로 둔다', async () => {
    serve({ deleteResponse: Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: '내가 올린 사진만 지울 수 있어요.' }) }) });
    await act(async () => { render(<ChildFaceCard children={REGISTERED} />); });

    fireEvent.click(screen.getByRole('button', { name: '이재림 얼굴 사진 1 삭제' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '지우기' })); });

    expect(screen.getByRole('status')).toHaveTextContent('내가 올린 사진만 지울 수 있어요.');
    expect(screen.getByRole('button', { name: '이재림 얼굴 사진 1 삭제' })).toBeInTheDocument();
    expect(screen.getByText('얼굴 사진 2장 등록됨')).toBeInTheDocument();
  });
});
