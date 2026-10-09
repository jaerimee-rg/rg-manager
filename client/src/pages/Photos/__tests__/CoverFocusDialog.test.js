import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CoverFocusDialog from '../CoverFocusDialog';

const COVER = { id: 7, imageUrl: 'https://lh3/c7=s640-rw', editUrl: 'https://lh3/c7=s1200-rw', focus: null };

beforeAll(() => {
  // jsdom 에는 PointerEvent 가 없다 — clientX·clientY·button 을 실어 보내도록 MouseEvent 로 흉내 낸다
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    };
  }
});

const open = (props = {}) => {
  const onSave = props.onSave || jest.fn().mockResolvedValue(undefined);
  render(<CoverFocusDialog cover={COVER} count={1} index={0} onClose={jest.fn()} {...props} onSave={onSave} />);
  return onSave;
};
const frame = () => screen.getByTestId('cover-focus-frame');
const image = () => frame().querySelector('img');
const save = () => screen.getByRole('button', { name: '저장' });

// 틀 200×125(16:10) · 세로 사진 1000×2000 → cover 로 200×400, 세로로 275 넘친다
const layout = () => {
  frame().getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 125, right: 200, bottom: 125 });
  Object.defineProperty(image(), 'naturalWidth', { value: 1000, configurable: true });
  Object.defineProperty(image(), 'naturalHeight', { value: 2000, configurable: true });
  fireEvent.load(image());
};

describe('CoverFocusDialog — 보일 부분 고르기', () => {
  it('큰 사진을 카드의 그 칸 모양 틀에 가운데로 띄운다 — 저장은 바꾼 뒤에만', () => {
    open();
    expect(image()).toHaveAttribute('src', COVER.editUrl);
    expect(image().style.objectPosition).toBe('50% 50%');
    expect(frame().style.aspectRatio).toBe('1.6');
    expect(save()).toBeDisabled();
  });

  it('3장 중 첫 칸은 8:10 모양', () => {
    open({ count: 3, index: 0 });
    expect(frame().style.aspectRatio).toBe('0.8');
  });

  it('사진을 아래로 끌면 위쪽이 보이고, 저장하면 그 { x, y } 를 넘긴다', async () => {
    const onSave = open();
    layout();

    fireEvent.pointerDown(frame(), { clientX: 100, clientY: 60, button: 0 });
    fireEvent.pointerMove(frame(), { clientX: 100, clientY: 115 });   // 55 아래로 → 55/275 = 20%
    fireEvent.pointerUp(frame(), { clientX: 100, clientY: 115 });

    expect(image().style.objectPosition).toBe('50% 30%');
    await act(async () => { fireEvent.click(save()); });
    expect(onSave).toHaveBeenCalledWith({ x: 50, y: 30 });
  });

  it('화살표 키로 조금씩 옮긴다', () => {
    open();
    fireEvent.keyDown(frame(), { key: 'ArrowUp' });
    fireEvent.keyDown(frame(), { key: 'ArrowUp' });
    expect(image().style.objectPosition).toBe('50% 60%');
    expect(frame()).toHaveAttribute('aria-valuetext', '가로 50% · 세로 60%');
  });

  it('[가운데로] 를 누르고 저장하면 null(가운데) 을 넘긴다', async () => {
    const onSave = open({ cover: { ...COVER, focus: { x: 10, y: 90 } } });
    expect(image().style.objectPosition).toBe('10% 90%');

    fireEvent.click(screen.getByRole('button', { name: '가운데로' }));
    expect(image().style.objectPosition).toBe('50% 50%');
    await act(async () => { fireEvent.click(save()); });
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('저장이 안 되면 이유를 보여 주고 창을 열어 둔다', async () => {
    open({ onSave: jest.fn().mockRejectedValue(new Error('보일 부분을 다시 골라 주세요.')) });
    fireEvent.keyDown(frame(), { key: 'ArrowLeft' });
    await act(async () => { fireEvent.click(save()); });

    expect(screen.getByRole('alert')).toHaveTextContent('보일 부분을 다시 골라 주세요.');
    expect(save()).toBeEnabled();
  });
});
