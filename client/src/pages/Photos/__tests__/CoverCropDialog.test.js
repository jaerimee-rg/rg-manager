import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import CoverCropDialog from '../CoverCropDialog';

const cover = (id, crop = null) => ({ id, kind: 'image', driveFileId: `f${id}`, thumbnailUrl: `https://t/${id}`, crop });

// jsdom 에는 PointerEvent 가 없다 — clientX·Y·pointerId 를 실어 보내도록 MouseEvent 로 흉내 낸다
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    };
  }
});

const stage = () => screen.getByTestId('cover-crop-stage');
const slot = (n) => screen.getByRole('group', { name: new RegExp(`^${n}번 사진 보일 부분`) });
const image = (n) => slot(n).querySelector('img');
// 칸마다 160×100, 나란히(왼쪽 0, 오른쪽 170) — 1000×1500 세로 사진이라 위아래로 140px 넘친다
const layout = (count) => {
  for (let n = 1; n <= count; n += 1) {
    const left = (n - 1) * 170;
    slot(n).getBoundingClientRect = () => ({ left, top: 0, width: 160, height: 100, right: left + 160, bottom: 100 });
    Object.defineProperty(image(n), 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(image(n), 'naturalHeight', { value: 1500, configurable: true });
  }
};
const down = (target, id, x, y) => fireEvent.pointerDown(target, { pointerId: id, clientX: x, clientY: y, button: 0 });
const move = (id, x, y) => fireEvent.pointerMove(stage(), { pointerId: id, clientX: x, clientY: y });
const up = (id) => fireEvent.pointerUp(stage(), { pointerId: id });

describe('CoverCropDialog — 대표 사진의 보일 부분 고르기 (여러 장 한 번에)', () => {
  it('사진 목록 카드와 같은 모양으로 그리고, 누른 사진부터 고른다 — 모든 칸을 고칠 수 있고 사진은 크게 받는다', () => {
    render(<CoverCropDialog covers={[cover(1), cover(2, { x: 10, y: 10, zoom: 1 })]} index={1} onApply={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: '대표 사진 — 보일 부분' })).toBeInTheDocument();
    expect(stage()).toHaveAttribute('data-covers', '2');
    expect(slot(2)).toHaveAttribute('data-active');
    expect(slot(1)).not.toHaveAttribute('data-active');
    expect(document.activeElement).toBe(slot(2));
    expect(screen.getByText('2번 사진')).toBeInTheDocument();
    expect(image(1)).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f1=w1600-rw');
    expect(image(2).style.objectPosition).toBe('10% 10%');
    expect(screen.getByText(/칸을 눌러 사진을 바꿔 가며 한 번에 고쳐요/)).toBeInTheDocument();
  });

  it('칸을 바꿔 가며 고치고 [적용] 하면 모든 사진의 보일 부분을 한 번에 넘긴다', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1), cover(2)]} index={0} onApply={onApply} onClose={jest.fn()} />);
    layout(2);

    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();   // 아직 바꾼 것이 없다
    // 1번: 아래로 14px 끌면 위쪽이 10% 더 보인다
    down(slot(1), 1, 80, 50); move(1, 80, 64); up(1);
    // 2번을 누르면 2번을 고른다 — 막대는 2번 사진의 확대
    down(slot(2), 1, 250, 50); up(1);
    expect(slot(2)).toHaveAttribute('data-active');
    fireEvent.change(screen.getByRole('slider', { name: '2번 사진 확대' }), { target: { value: '2' } });

    expect(image(1).style.objectPosition).toBe('50% 40%');
    expect(image(2).style.transform).toBe('scale(2)');
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith([{ x: 50, y: 40, zoom: 1 }, { x: 50, y: 50, zoom: 2 }]);
  });

  it('두 손가락으로 벌리면 그 사진을 키우고, 손가락 가운데의 점은 그 자리에 남는다(휴대폰 사진 보기처럼)', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={onApply} onClose={jest.fn()} />);
    layout(1);

    // 가운데(80, 50)에 두 손가락 — 사이 40px 에서 80px 로 벌린다
    down(slot(1), 1, 60, 50);
    down(slot(1), 2, 100, 50);
    move(1, 40, 50);
    move(2, 120, 50);
    up(1); up(2);

    expect(image(1).style.transform).toBe('scale(2)');
    expect(image(1).style.objectPosition).toBe('50% 50%');
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith([{ x: 50, y: 50, zoom: 2 }]);
  });

  it('두 손가락을 함께 옮기면 사진도 옮겨진다 · 하나를 떼도 튀지 않고 남은 손가락으로 이어서 옮긴다', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);
    layout(1);

    down(slot(1), 1, 70, 50);
    down(slot(1), 2, 90, 50);
    move(1, 70, 64); move(2, 90, 64);    // 둘 다 아래로 14px → 위쪽이 10% 더
    expect(image(1).style.objectPosition).toBe('50% 40%');
    up(2);
    move(1, 70, 78);                     // 남은 손가락으로 14px 더
    up(1);
    expect(image(1).style.objectPosition).toBe('50% 30%');
    expect(image(1).style.transform).toBe('');
  });

  it('사진이 뜨기 전에 손가락을 대도 몸짓은 남는다 — 사진이 뜬 뒤 움직이면 그때부터 따라온다', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);

    down(slot(1), 1, 80, 50);          // 아직 사진 크기를 모른다
    layout(1);                         // 사진이 떴다
    move(1, 80, 50);                   // 여기서 시작
    move(1, 80, 64);
    up(1);

    expect(image(1).style.objectPosition).toBe('50% 40%');
  });

  it('두 번째 손가락이 옆 칸에 닿아도 처음 누른 칸의 사진을 키운다', () => {
    render(<CoverCropDialog covers={[cover(1), cover(2)]} index={1} onApply={jest.fn()} onClose={jest.fn()} />);
    layout(2);

    down(slot(1), 1, 140, 50);
    down(slot(2), 2, 180, 50);
    move(1, 120, 50); move(2, 200, 50);  // 40 → 80px
    up(1); up(2);

    expect(slot(1)).toHaveAttribute('data-active');
    expect(image(1).style.transform).toBe('scale(2)');
    expect(image(2).style.transform).toBe('');
  });

  it('화살표 키로 옮기고 +/− 로 확대한다 — 포커스한 칸이 고르는 사진이 된다', () => {
    render(<CoverCropDialog covers={[cover(1), cover(2)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);
    layout(2);

    act(() => { slot(2).focus(); });
    expect(slot(2)).toHaveAttribute('data-active');
    fireEvent.keyDown(slot(2), { key: 'ArrowUp' });   // 사진을 위로 12px → 아래쪽이 더 보인다
    expect(image(2).style.objectPosition).toBe('50% 58.6%');
    fireEvent.keyDown(slot(2), { key: '+' });
    expect(image(2).style.transform).toBe('scale(1.1)');
    fireEvent.keyDown(slot(2), { key: '-' });
    expect(image(2).style.transform).toBe('');
    expect(image(1).style.objectPosition).toBe('');
  });

  it('휠로 마우스 자리를 중심으로 확대한다 — 페이지는 스크롤되지 않는다', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);
    layout(1);

    const wheel = new WheelEvent('wheel', { deltaY: -200, clientX: 80, clientY: 50, bubbles: true, cancelable: true });
    act(() => { image(1).dispatchEvent(wheel); });

    expect(wheel.defaultPrevented).toBe(true);
    expect(image(1).style.transform).toBe('scale(1.3)');
  });

  it('[가운데로] 는 고르는 사진만 처음 상태로', () => {
    const onApply = jest.fn();
    render(<CoverCropDialog covers={[cover(1, { x: 0, y: 100, zoom: 2.5 }), cover(2, { x: 5, y: 5, zoom: 1 })]} index={0} onApply={onApply} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '가운데로' }));

    expect(image(1).style.objectPosition).toBe('');
    expect(image(2).style.objectPosition).toBe('5% 5%');
    expect(screen.getByRole('button', { name: '가운데로' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledWith([{ x: 50, y: 50, zoom: 1 }, { x: 5, y: 5, zoom: 1 }]);
  });

  it('[취소] 는 바꾼 것을 모두 버리고 닫는다', () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={onApply} onClose={onClose} />);

    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '2' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('한 장이면 번호·"몇 번 사진" 없이 그 사진만', () => {
    render(<CoverCropDialog covers={[cover(1)]} index={0} onApply={jest.fn()} onClose={jest.fn()} />);

    expect(document.querySelector('.ui-cover-crop__num')).toBeNull();
    expect(screen.queryByText('1번 사진')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '확대' })).toBeInTheDocument();
  });
});
