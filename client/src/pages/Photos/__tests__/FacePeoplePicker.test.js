import React, { useState } from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn((url, covers) => Promise.resolve(covers.map(() => 'data:image/jpeg;base64,x'))) }));

import { fetchWithAuth } from '../../../utils/api';
import FacePeoplePicker from '../FacePeoplePicker';

const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const cover = { url: 'https://lh3.googleusercontent.com/d/f1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
// 등록된 아이(p11 — 뺄 수 없다) · 관계없는 사람 둘
const PEOPLE = [
  { key: 'p11', photoCount: 3, cover, removable: false },
  { key: 'p42', photoCount: 1, cover, removable: true },
  { key: 'p57', photoCount: 2, cover, removable: true }
];

/** 화면처럼 picking 을 위에서 갖고 있는 틀 */
const Harness = ({ people = PEOPLE, ...handlers }) => {
  const [picking, setPicking] = useState(false);
  return (
    <FacePeoplePicker base="/api/events/31/album" people={people} selected={null} onSelect={handlers.onSelect}
      picking={picking} onPickingChange={setPicking} {...handlers} />
  );
};

const renderPicker = async (props = {}) => {
  const handlers = { onSelect: jest.fn(), onRemoved: jest.fn(), onStale: jest.fn(), onToast: jest.fn(), ...props };
  let view;
  await act(async () => { view = render(<Harness {...handlers} />); });
  return { ...handlers, view };
};
const bar = () => screen.getByRole('region', { name: '얼굴 빼기' });
const startPicking = async () => { await act(async () => { fireEvent.click(within(bar()).getByRole('button', { name: '얼굴 빼기' })); }); };
const face = (name) => screen.getByRole('button', { name });

beforeEach(() => jest.clearAllMocks());

describe('FacePeoplePicker — 얼굴 목록에서 여러 얼굴 한 번에 빼기 (선생님)', () => {
  it('[얼굴 빼기] → 얼굴을 여러 개 고르고 [N개 빼기] → 확인 창의 [빼기] 로 한 번에 뺀다 (본 사진 수와 함께)', async () => {
    fetchWithAuth.mockReturnValue(respond({ removedPeople: 2, removedFaces: 3, photos: 3, removedTags: 0 }));
    const { onRemoved, onToast, onSelect } = await renderPicker();

    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();
    await startPicking();
    expect(screen.getByRole('group', { name: '뺄 얼굴 고르기' })).toBeInTheDocument();
    expect(within(bar()).getByText('목록에서 뺄 얼굴을 골라 주세요')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: '빼기' })).toBeDisabled();

    fireEvent.click(face('얼굴 2 · 사진 1장'));
    fireEvent.click(face('얼굴 3 · 사진 2장'));
    expect(onSelect).not.toHaveBeenCalled();   // 고르는 동안에는 사진을 거르지 않는다
    expect(within(bar()).getByText('얼굴 2개 골랐어요')).toBeInTheDocument();

    fireEvent.click(within(bar()).getByRole('button', { name: '2개 빼기' }));
    const dialog = screen.getByRole('dialog', { name: '얼굴 2개를 목록에서 뺄까요?' });
    expect(fetchWithAuth).not.toHaveBeenCalled();   // 확인 전에는 보내지 않는다
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '빼기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/album/people/remove', {
      method: 'POST',
      body: JSON.stringify({ people: [{ key: 'p42', photoCount: 1 }, { key: 'p57', photoCount: 2 }] })
    });
    expect(onToast).toHaveBeenCalledWith('얼굴 2개를 목록에서 뺐어요 · 사진은 그대로 있어요');
    expect(onRemoved).toHaveBeenCalledWith(['p42', 'p57']);
    // 고르기가 끝나 평소 목록으로
    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('다시 누르면 고른 것이 풀리고, 등록된 아이 얼굴은 고를 수 없다', async () => {
    await renderPicker();
    await startPicking();

    expect(face('얼굴 1 · 사진 3장')).toBeDisabled();
    fireEvent.click(face('얼굴 2 · 사진 1장'));
    expect(face('얼굴 2 · 사진 1장')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(face('얼굴 2 · 사진 1장'));
    expect(face('얼굴 2 · 사진 1장')).toHaveAttribute('aria-pressed', 'false');
    expect(within(bar()).getByRole('button', { name: '빼기' })).toBeDisabled();
  });

  it('[취소] 면 고른 것을 풀고 평소 목록으로 — 확인 창에서 취소해도 아무것도 보내지 않는다', async () => {
    await renderPicker();
    await startPicking();
    fireEvent.click(face('얼굴 2 · 사진 1장'));
    fireEvent.click(within(bar()).getByRole('button', { name: '1개 빼기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(within(bar()).getByText('얼굴 1개 골랐어요')).toBeInTheDocument();   // 확인 창만 닫혔다

    fireEvent.click(within(bar()).getByRole('button', { name: '취소' }));
    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();
    await startPicking();
    expect(within(bar()).getByText('목록에서 뺄 얼굴을 골라 주세요')).toBeInTheDocument();   // 다시 열면 처음부터
  });

  it('그 사이 목록이 바뀌었으면 알리고 목록을 다시 읽게 한다 — 고르기는 그대로', async () => {
    fetchWithAuth.mockReturnValue(respond({ error: '바뀌었어요', reason: 'person_changed' }, 409));
    const { onRemoved, onStale, onToast } = await renderPicker();
    await startPicking();
    fireEvent.click(face('얼굴 2 · 사진 1장'));
    fireEvent.click(within(bar()).getByRole('button', { name: '1개 빼기' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '빼기' })); });

    expect(onToast).toHaveBeenCalledWith('얼굴 목록이 바뀌었어요. 다시 확인해 주세요.');
    expect(onStale).toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '뺄 얼굴 고르기' })).toBeInTheDocument();
  });

  it('목록을 다시 받으면 사라진 얼굴은 고른 것에서 빠진다', async () => {
    const { view, ...handlers } = await renderPicker();
    await startPicking();
    fireEvent.click(face('얼굴 2 · 사진 1장'));
    fireEvent.click(face('얼굴 3 · 사진 2장'));
    expect(within(bar()).getByText('얼굴 2개 골랐어요')).toBeInTheDocument();

    await act(async () => { view.rerender(<Harness {...handlers} people={[PEOPLE[0], PEOPLE[2]]} />); });
    expect(within(bar()).getByText('얼굴 1개 골랐어요')).toBeInTheDocument();
  });

  it('뺄 수 있는 얼굴이 없으면(등록된 아이뿐) [얼굴 빼기] 가 없다 · 얼굴이 없으면 아무것도 그리지 않는다', async () => {
    const { view, ...handlers } = await renderPicker({ });
    await act(async () => { view.rerender(<Harness {...handlers} people={[PEOPLE[0]]} />); });
    expect(screen.queryByRole('region', { name: '얼굴 빼기' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();

    await act(async () => { view.rerender(<Harness {...handlers} people={[]} />); });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('고르는 중에 뺄 수 있는 얼굴이 다 사라지면 고르기를 끝낸다', async () => {
    const { view, ...handlers } = await renderPicker();
    await startPicking();
    await act(async () => { view.rerender(<Harness {...handlers} people={[PEOPLE[0]]} />); });

    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '얼굴 빼기' })).not.toBeInTheDocument();
  });
});
