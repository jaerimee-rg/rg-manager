import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import CoverOrderPanel from '../CoverOrderPanel';

const cover = (id, kind = 'image') => ({ id, kind, thumbnailUrl: `https://lh3/c${id}` });
const COVERS = [cover(1), cover(2, 'video'), cover(3)];

const slots = () => screen.getAllByRole('button', { name: /^대표 사진 \d.*—/ });
const order = () => slots().map((button) => button.getAttribute('data-cover-id'));

describe('CoverOrderPanel — 대표 사진 칸', () => {
  it('고른 순서대로 번호를 달아 보여 주고, 남은 자리는 빈 칸 — 몇 장 중 몇 장인지도', () => {
    render(<CoverOrderPanel covers={COVERS} max={4} onReorder={jest.fn()} />);

    expect(order()).toEqual(['1', '2', '3']);
    expect(slots()[1]).toHaveAccessibleName(/대표 사진 2 \(영상\)/);
    expect(within(slots()[0]).getByText('1')).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-cover-order__slot[data-empty]')).toHaveLength(1);
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });

  it('옆에 사진 목록 카드 표지 미리 보기 — 같은 순서, 장수가 모양을 정한다', () => {
    render(<CoverOrderPanel covers={COVERS} onReorder={jest.fn()} />);

    const preview = screen.getByTestId('cover-preview');
    expect(preview).toHaveAttribute('data-covers', '3');
    expect([...preview.querySelectorAll('img')].map((img) => img.getAttribute('src')))
      .toEqual(['https://lh3/c1', 'https://lh3/c2', 'https://lh3/c3']);
  });

  it('대표 사진이 없으면 정하는 방법을 알려 준다', () => {
    render(<CoverOrderPanel covers={[]} onReorder={jest.fn()} />);

    expect(screen.getByText(/\[대표 사진 만들기\] 를 누르면/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^대표 사진 \d.*—/ })).not.toBeInTheDocument();
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('칸에서 ←→ 키로 옮긴다 — 바뀐 순서를 넘기고, 옮긴 칸에 포커스가 남는다', () => {
    const onReorder = jest.fn();
    render(<CoverOrderPanel covers={COVERS} onReorder={onReorder} />);

    slots()[0].focus();
    fireEvent.keyDown(slots()[0], { key: 'ArrowRight' });

    expect(onReorder).toHaveBeenLastCalledWith([2, 1, 3]);
    expect(order()).toEqual(['2', '1', '3']);
    expect(document.activeElement).toHaveAttribute('data-cover-id', '1');

    // 맨 앞에서 ← 는 아무것도 안 한다
    fireEvent.keyDown(slots()[0], { key: 'ArrowLeft' });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('저장 중(disabled)에는 옮기지 않는다', () => {
    const onReorder = jest.fn();
    render(<CoverOrderPanel covers={COVERS} disabled onReorder={onReorder} />);

    fireEvent.keyDown(slots()[0], { key: 'ArrowRight' });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('밖에서 새 목록이 오면(저장 실패 뒤 다시 읽기 등) 그 순서로 돌아간다', () => {
    const { rerender } = render(<CoverOrderPanel covers={COVERS} onReorder={jest.fn()} />);
    fireEvent.keyDown(slots()[0], { key: 'ArrowRight' });
    expect(order()).toEqual(['2', '1', '3']);

    rerender(<CoverOrderPanel covers={[...COVERS]} onReorder={jest.fn()} />);
    expect(order()).toEqual(['1', '2', '3']);
  });

  describe('빼기 · 보일 부분', () => {
    const renderFull = (extra = {}) => {
      const handlers = { onReorder: jest.fn(), onRemove: jest.fn(), onClear: jest.fn(), onSaveFocus: jest.fn().mockResolvedValue(undefined) };
      render(<CoverOrderPanel covers={COVERS} {...handlers} {...extra} />);
      return handlers;
    };

    it('칸마다 ✕ — 누르면 그 사진을 뺀다 · 칸에서 Delete 키도', () => {
      const { onRemove } = renderFull();

      fireEvent.click(screen.getByRole('button', { name: '대표 사진 2 빼기' }));
      expect(onRemove).toHaveBeenLastCalledWith(2);

      fireEvent.keyDown(slots()[2], { key: 'Delete' });
      expect(onRemove).toHaveBeenLastCalledWith(3);
    });

    it('[모두 빼기] — 대표 사진이 없으면 버튼도 없다', () => {
      const { onClear } = renderFull();
      fireEvent.click(screen.getByRole('button', { name: '모두 빼기' }));
      expect(onClear).toHaveBeenCalled();
    });

    it('대표 사진이 없으면 [모두 빼기] 도 없다', () => {
      renderFull({ covers: [] });
      expect(screen.queryByRole('button', { name: '모두 빼기' })).not.toBeInTheDocument();
    });

    it('칸을 누르면 보일 부분 고르기 창 — 저장하면 onSaveFocus(그 사진, 보일 부분) 후 닫힌다', async () => {
      const { onSaveFocus } = renderFull();

      fireEvent.click(slots()[1]);
      const dialog = screen.getByRole('dialog', { name: '보일 부분 고르기' });
      // 2번 칸(3장 중) 모양 = 8:5
      expect(screen.getByTestId('cover-focus-frame').style.aspectRatio).toBe('1.6');
      fireEvent.keyDown(screen.getByTestId('cover-focus-frame'), { key: 'ArrowRight' });
      await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '저장' })); });

      expect(onSaveFocus).toHaveBeenCalledWith(COVERS[1], { x: 45, y: 50 });
      expect(screen.queryByRole('dialog', { name: '보일 부분 고르기' })).not.toBeInTheDocument();
    });

    it('칸과 미리 보기는 저장된 보일 부분을 그대로 보여 준다(자르지 않은 사진 위에)', () => {
      render(<CoverOrderPanel covers={[{ ...cover(1), imageUrl: 'https://lh3/i1', focus: { x: 20, y: 80 } }, cover(2)]} onReorder={jest.fn()} />);

      expect(slots()[0].querySelector('img')).toHaveAttribute('src', 'https://lh3/i1');
      expect(slots()[0].querySelector('img').style.objectPosition).toBe('20% 80%');
      const previewImages = screen.getByTestId('cover-preview').querySelectorAll('img');
      expect(previewImages[0].style.objectPosition).toBe('20% 80%');
      expect(previewImages[1].style.objectPosition).toBe('');
    });
  });

  describe('끌어서 놓기 (마우스·손가락 = 포인터 이벤트)', () => {
    // jsdom 에는 PointerEvent 가 없다 — clientX·button 을 실어 보내도록 MouseEvent 로 흉내 낸다
    beforeAll(() => {
      if (!window.PointerEvent) {
        window.PointerEvent = class PointerEvent extends MouseEvent {
          constructor(type, init = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
          }
        };
      }
    });

    // 칸 폭 72, 간격 12 — 0번 칸 가운데 36, 1번 120, 2번 204
    const layout = () => {
      document.querySelector('.ui-cover-order__slots').getBoundingClientRect = () => ({ left: 0, right: 324, width: 324, top: 0, bottom: 72 });
      document.querySelectorAll('[data-cover-index]').forEach((slot) => {
        const index = Number(slot.dataset.coverIndex);
        const rect = () => {
          const offset = parseFloat((slot.style.transform || '').replace(/[^-\d.]/g, '')) || 0;
          const left = index * 84 + offset;
          return { left, right: left + 72, width: 72, top: 0, bottom: 72, height: 72 };
        };
        slot.getBoundingClientRect = rect;
        slot.querySelector('button').getBoundingClientRect = rect;
      });
    };

    it('첫 칸을 끝으로 끌어 놓으면 그 자리로 옮기고 전체 순서를 넘긴다 — 끄는 동안 칸이 따라오고 놓일 자리에 막대', () => {
      const onReorder = jest.fn();
      render(<CoverOrderPanel covers={COVERS} onReorder={onReorder} />);
      layout();

      fireEvent.pointerDown(slots()[0], { clientX: 36, button: 0 });
      fireEvent.pointerMove(slots()[0], { clientX: 230 });

      const dragged = document.querySelector('[data-cover-index="0"]');
      expect(dragged).toHaveAttribute('data-dragging');
      expect(dragged.style.transform).toBe('translateX(168px)');   // 마지막 칸 끝까지만
      expect(document.querySelector('[data-cover-index="2"]')).toHaveAttribute('data-drop', 'after');

      fireEvent.pointerUp(slots()[0], { clientX: 230 });

      expect(onReorder).toHaveBeenCalledWith([2, 3, 1]);
      expect(order()).toEqual(['2', '3', '1']);
      expect(document.querySelector('[data-dragging]')).toBeNull();
    });

    it('끈 뒤 손을 떼며 오는 click 은 보일 부분 창을 열지 않는다', () => {
      render(<CoverOrderPanel covers={COVERS} onReorder={jest.fn()} onSaveFocus={jest.fn()} />);
      layout();

      fireEvent.pointerDown(slots()[0], { clientX: 36, button: 0 });
      fireEvent.pointerMove(slots()[0], { clientX: 230 });
      fireEvent.pointerUp(slots()[0], { clientX: 230 });
      fireEvent.click(slots()[2]);   // 옮겨진 첫 칸(이제 3번째)에 오는 click

      expect(screen.queryByRole('dialog', { name: '보일 부분 고르기' })).not.toBeInTheDocument();
      fireEvent.click(slots()[0]);   // 그다음 누르기는 연다
      expect(screen.getByRole('dialog', { name: '보일 부분 고르기' })).toBeInTheDocument();
    });

    it('가운데로 끌면 그 앞에 들어간다', () => {
      const onReorder = jest.fn();
      render(<CoverOrderPanel covers={COVERS} onReorder={onReorder} />);
      layout();

      fireEvent.pointerDown(slots()[2], { clientX: 204, button: 0 });
      fireEvent.pointerMove(slots()[2], { clientX: 60 });
      fireEvent.pointerUp(slots()[2], { clientX: 60 });

      expect(onReorder).toHaveBeenCalledWith([1, 3, 2]);
    });

    it('조금만 움직였거나(누르기) 제자리에 놓으면 아무것도 안 한다 · 취소되면 그대로', () => {
      const onReorder = jest.fn();
      render(<CoverOrderPanel covers={COVERS} onReorder={onReorder} />);
      layout();

      fireEvent.pointerDown(slots()[1], { clientX: 120, button: 0 });
      fireEvent.pointerMove(slots()[1], { clientX: 123 });
      fireEvent.pointerUp(slots()[1], { clientX: 123 });

      fireEvent.pointerDown(slots()[1], { clientX: 120, button: 0 });
      fireEvent.pointerMove(slots()[1], { clientX: 128 });
      fireEvent.pointerUp(slots()[1], { clientX: 128 });

      fireEvent.pointerDown(slots()[1], { clientX: 120, button: 0 });
      fireEvent.pointerMove(slots()[1], { clientX: 230 });
      fireEvent.pointerCancel(slots()[1]);

      expect(onReorder).not.toHaveBeenCalled();
      expect(order()).toEqual(['1', '2', '3']);
    });

    it('한 장뿐이거나 저장 중이면 끌기가 시작되지 않는다', () => {
      const onReorder = jest.fn();
      const { rerender } = render(<CoverOrderPanel covers={[cover(1)]} onReorder={onReorder} />);
      fireEvent.pointerDown(slots()[0], { clientX: 36, button: 0 });
      fireEvent.pointerMove(slots()[0], { clientX: 200 });
      expect(document.querySelector('[data-dragging]')).toBeNull();

      rerender(<CoverOrderPanel covers={COVERS} disabled onReorder={onReorder} />);
      layout();
      fireEvent.pointerDown(slots()[0], { clientX: 36, button: 0 });
      fireEvent.pointerMove(slots()[0], { clientX: 230 });
      fireEvent.pointerUp(slots()[0], { clientX: 230 });
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
