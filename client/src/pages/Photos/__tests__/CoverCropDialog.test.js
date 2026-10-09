import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import CoverCropDialog from '../CoverCropDialog';

const cover = (id, crop = null) => ({ id, kind: 'image', driveFileId: `f${id}`, thumbnailUrl: `https://t/${id}`, crop });

// jsdom 에는 PointerEvent 가 없다 — clientX·Y 를 실어 보내도록 MouseEvent 로 흉내 낸다
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    };
  }
});

const stage = () => screen.getByTestId('cover-crop-stage');
const active = () => screen.getByRole('group', { name: /보일 부분/ });
const activeImage = () => active().querySelector('img');
// 칸 160×100 에 1000×1500 세로 사진 — 위아래로 140px 넘친다
const layout = () => {
  active().getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 100, right: 160, bottom: 100 });
  Object.defineProperty(activeImage(), 'naturalWidth', { value: 1000, configurable: true });
  Object.defineProperty(activeImage(), 'naturalHeight', { value: 1500, configurable: true });
};

describe('CoverCropDialog — 대표 사진의 보일 부분 고르기', () => {
  it('사진 목록 카드와 같은 모양으로 그리고, 고르는 칸만 끌 수 있다 — 고르는 사진은 크게 받는다', () => {
    render(<CoverCropDialog covers={[cover(1), cover(2, { x: 10, y: 10, zoom: 1 })]} index={1} onApply={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: '대표 사진 2 — 보일 부분' })).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-covers', '2');
    expect(activeImage()).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f2=w1600-rw');
    expect(activeImage().style.objectPosition).toBe('10% 10%');
    // 다른 칸은 흐리게 그대로 — 카드에서 보일 그 크기의 주소
    const other = stage().querySelector('.ui-cover-crop__other img');
    expect(other).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f1=s800-rw');
    expect(document.activeElement).toBe(active());
  });

  it('끌면 사진이 따라온다 — 아래로 14px 끌면 위쪽이 10% 더 보이고, [적용] 이 그 값을 넘긴다', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={onApply} onClose={jest.fn()} />);
    layout();

    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();   // 아직 바꾼 것이 없다
    fireEvent.pointerDown(active(), { clientX: 80, clientY: 50, button: 0 });
    fireEvent.pointerMove(active(), { clientX: 80, clientY: 64 });
    fireEvent.pointerUp(active(), { clientX: 80, clientY: 64 });

    expect(activeImage().style.objectPosition).toBe('50% 40%');
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith({ x: 50, y: 40, zoom: 1 });
  });

  it('막대로 확대하면 같은 점을 중심으로 키운다 · 몇 배인지 보여 준다', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1, { x: 30, y: 60, zoom: 1 })]} index={0} onApply={onApply} onClose={jest.fn()} />);

    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '2' } });

    expect(activeImage().style.transform).toBe('scale(2)');
    expect(activeImage().style.transformOrigin).toBe('30% 60%');
    expect(screen.getByText('2.0배')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith({ x: 30, y: 60, zoom: 2 });
  });

  it('화살표 키로 옮기고 +/− 로 확대한다', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);
    layout();

    fireEvent.keyDown(active(), { key: 'ArrowUp' });   // 사진을 위로 12px → 아래쪽이 더 보인다
    expect(activeImage().style.objectPosition).toBe('50% 58.6%');
    fireEvent.keyDown(active(), { key: '+' });
    expect(activeImage().style.transform).toBe('scale(1.1)');
    fireEvent.keyDown(active(), { key: '-' });
    expect(activeImage().style.transform).toBe('');
  });

  it('[가운데로] 는 처음 상태로 — 가운데·확대 없음', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1, { x: 0, y: 100, zoom: 2.5 })]} index={0} onApply={onApply} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '가운데로' }));

    expect(activeImage().style.objectPosition).toBe('');
    expect(screen.getByRole('button', { name: '가운데로' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith({ x: 50, y: 50, zoom: 1 });
  });

  it('[취소] 는 바꾼 것을 버리고 닫는다', () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={onApply} onClose={onClose} />);

    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '2' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('휠로도 확대한다 — 페이지는 스크롤되지 않는다', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);

    const wheel = new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true });
    act(() => { active().dispatchEvent(wheel); });

    expect(wheel.defaultPrevented).toBe(true);
    expect(activeImage().style.transform).toBe('scale(1.3)');
  });
});
