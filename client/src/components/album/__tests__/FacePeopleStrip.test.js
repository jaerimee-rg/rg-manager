import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn() }));

import { cropFaces } from '../../../utils/faceCrops';
import FacePeopleStrip, { LONG_PRESS_MS } from '../FacePeopleStrip';

const box = (x) => ({ x, y: 0.2, w: 0.1, h: 0.1 });
const person = (key, url, x, overrides = {}) => ({ key, photoCount: 3, cover: { url, box: box(x) }, ...overrides });
const PEOPLE = [
  person('p1', 'https://lh3.googleusercontent.com/d/a=s600', 0.1, { photoCount: 5 }),
  person('p2', 'https://lh3.googleusercontent.com/d/a=s600', 0.5, { photoCount: 2 }),   // 같은 사진의 다른 얼굴
  person('p3', 'https://lh3.googleusercontent.com/d/b=s900', 0.3, { photoCount: 1 })
];

/** 사진 주소마다 상자 순서대로 data URL 을 돌려준다 */
const cropsByUrl = () => cropFaces.mockImplementation(async (url, covers) => covers.map((cover) => `data:${url.split("/").pop()}@${cover.box.x}`));
const faceButtons = () => screen.getAllByRole('button').slice(1);
const shownSrc = (button) => button.querySelector('img')?.getAttribute('src') || null;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FacePeopleStrip — 앨범 위 얼굴 목록', () => {
  it('얼굴이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<FacePeopleStrip people={[]} onSelect={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(cropFaces).not.toHaveBeenCalled();
  });

  it('[전체] 다음에 사람마다 얼굴 하나 — 같은 사진의 얼굴은 사진을 한 번만 받아 함께 자른다', async () => {
    cropsByUrl();

    await act(async () => { render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} />); });

    expect(screen.getByRole('group', { name: '얼굴로 사진 찾기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'true');
    expect(faceButtons().map((button) => button.getAttribute('aria-label')))
      .toEqual(['얼굴 1 · 사진 5장', '얼굴 2 · 사진 2장', '얼굴 3 · 사진 1장']);

    expect(cropFaces).toHaveBeenCalledTimes(2);
    expect(cropFaces).toHaveBeenCalledWith('https://lh3.googleusercontent.com/d/a=s600', [PEOPLE[0].cover, PEOPLE[1].cover]);
    expect(faceButtons().map(shownSrc)).toEqual(['data:a=s600@0.1', 'data:a=s600@0.5', 'data:b=s900@0.3']);
    expect(screen.getByText('5장')).toBeInTheDocument();
  });

  it('자르는 동안·못 자른 얼굴은 빈 동그라미로 둔다', async () => {
    let finish;
    cropFaces.mockImplementation((url, covers) => new Promise((resolve) => {
      if (url.includes('/b=')) resolve([null]); else finish = () => resolve(covers.map(() => 'data:ok'));
    }));

    await act(async () => { render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} />); });
    expect(faceButtons().map(shownSrc)).toEqual([null, null, null]);
    expect(faceButtons()[2].querySelector('[data-failed="true"]')).not.toBeNull();
    expect(faceButtons()[0].querySelector('[data-failed]')).toBeNull();

    await act(async () => { finish(); });
    expect(faceButtons().map(shownSrc)).toEqual(['data:ok', 'data:ok', null]);
  });

  it('누르면 그 사람을 고르고, 고른 얼굴을 다시 누르거나 [전체] 를 누르면 푼다', async () => {
    cropsByUrl();
    const onSelect = jest.fn();
    const { rerender } = render(<FacePeopleStrip people={PEOPLE} selected={null} onSelect={onSelect} />);
    await act(async () => {});

    fireEvent.click(faceButtons()[1]);
    expect(onSelect).toHaveBeenLastCalledWith('p2');

    rerender(<FacePeopleStrip people={PEOPLE} selected="p2" onSelect={onSelect} />);
    expect(faceButtons()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(faceButtons()[1]);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: '모든 사진' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('학부모의 우리 아이는 "우리 아이" 로 — 다른 사람에게는 이름을 쓰지 않는다', async () => {
    cropsByUrl();
    await act(async () => {
      render(<FacePeopleStrip people={[{ ...PEOPLE[0], mine: true }, PEOPLE[2]]} onSelect={jest.fn()} />);
    });

    expect(faceButtons().map((button) => button.getAttribute('aria-label'))).toEqual(['우리 아이 · 사진 5장', '얼굴 2 · 사진 1장']);
    expect(screen.getByText('우리 아이')).toBeInTheDocument();
  });

  it('목록을 다시 받아도 이미 자른 얼굴은 다시 자르지 않는다 — 새 얼굴만', async () => {
    cropsByUrl();
    const { rerender } = render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} />);
    await act(async () => {});
    expect(cropFaces).toHaveBeenCalledTimes(2);

    const extra = person('p4', 'https://lh3.googleusercontent.com/d/c=s400', 0.7);
    await act(async () => { rerender(<FacePeopleStrip people={[...PEOPLE.map((one) => ({ ...one })), extra]} onSelect={jest.fn()} />); });

    expect(cropFaces).toHaveBeenCalledTimes(3);
    expect(cropFaces).toHaveBeenLastCalledWith('https://lh3.googleusercontent.com/d/c=s400', [extra.cover]);
    expect(faceButtons().map(shownSrc)).toEqual(['data:a=s600@0.1', 'data:a=s600@0.5', 'data:b=s900@0.3', 'data:c=s400@0.7']);
  });

  it('자르는 중에 목록이 다시 와도 그 얼굴은 끝내 그려진다', async () => {
    let finish;
    cropFaces.mockImplementation((url, covers) => new Promise((resolve) => { finish = () => resolve(covers.map(() => 'data:late')); }));
    const one = [PEOPLE[2]];
    const { rerender } = render(<FacePeopleStrip people={one} onSelect={jest.fn()} />);

    rerender(<FacePeopleStrip people={[{ ...PEOPLE[2] }]} onSelect={jest.fn()} />);
    await act(async () => { finish(); });

    expect(cropFaces).toHaveBeenCalledTimes(1);
    expect(faceButtons().map(shownSrc)).toEqual(['data:late']);
  });

  it('못 자른 얼굴은 목록을 다시 받을 때 한 번 더 해 본다 (잠깐의 429 등)', async () => {
    cropFaces.mockResolvedValueOnce([null]).mockResolvedValueOnce(['data:retry']);
    const { rerender } = render(<FacePeopleStrip people={[PEOPLE[2]]} onSelect={jest.fn()} />);
    await act(async () => {});
    expect(faceButtons().map(shownSrc)).toEqual([null]);

    await act(async () => { rerender(<FacePeopleStrip people={[{ ...PEOPLE[2] }]} onSelect={jest.fn()} />); });

    expect(cropFaces).toHaveBeenCalledTimes(2);
    expect(faceButtons().map(shownSrc)).toEqual(['data:retry']);
  });
});

describe('FacePeopleStrip — 길게 눌러 얼굴 빼기 (선생님)', () => {
  const longPress = async (button) => {
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10 });
    await act(async () => { jest.advanceTimersByTime(LONG_PRESS_MS + 10); });
    fireEvent.pointerUp(button);
    fireEvent.click(button);   // 손을 떼면 오는 click — 고르면 안 된다
  };
  const xButton = () => screen.queryByRole('button', { name: /목록에서 빼기/ });

  // jsdom 에는 PointerEvent 가 없어 clientX 가 실리지 않는다 — 좌표를 싣는 MouseEvent 로 대신한다
  const RealPointerEvent = window.PointerEvent;
  beforeAll(() => { window.PointerEvent = class extends MouseEvent {}; });
  afterAll(() => { window.PointerEvent = RealPointerEvent; });

  beforeEach(() => {
    jest.useFakeTimers();
    cropsByUrl();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('길게 누르면 그 얼굴에만 X 가 나오고, 손을 떼도 고르지 않는다 · X 를 누르면 onRemove(key)', async () => {
    const onSelect = jest.fn();
    const onRemove = jest.fn();
    render(<FacePeopleStrip people={PEOPLE} onSelect={onSelect} onRemove={onRemove} />);

    await longPress(faceButtons()[1]);

    expect(onSelect).not.toHaveBeenCalled();
    expect(xButton()).toHaveAccessibleName('얼굴 2 목록에서 빼기');
    expect(screen.getAllByRole('button', { name: /목록에서 빼기/ })).toHaveLength(1);
    expect(xButton()).toHaveFocus();

    fireEvent.click(xButton());
    expect(onRemove).toHaveBeenCalledWith('p2');
    expect(xButton()).toBeNull();
  });

  it('짧게 누르면 평소처럼 고른다 — X 는 나오지 않는다', async () => {
    const onSelect = jest.fn();
    render(<FacePeopleStrip people={PEOPLE} onSelect={onSelect} onRemove={jest.fn()} />);

    fireEvent.pointerDown(faceButtons()[0], { clientX: 10, clientY: 10 });
    await act(async () => { jest.advanceTimersByTime(LONG_PRESS_MS - 100); });
    fireEvent.pointerUp(faceButtons()[0]);
    fireEvent.click(faceButtons()[0]);

    expect(onSelect).toHaveBeenCalledWith('p1');
    expect(xButton()).toBeNull();
  });

  it('누른 채 옆으로 밀면(목록 스크롤) 길게 누르기가 아니다', async () => {
    render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} />);

    fireEvent.pointerDown(faceButtons()[0], { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(faceButtons()[0], { clientX: 40, clientY: 12 });
    await act(async () => { jest.advanceTimersByTime(LONG_PRESS_MS + 10); });

    expect(xButton()).toBeNull();
  });

  it('X 가 떠 있을 때 다른 얼굴·[전체] 를 누르면 X 만 닫고 고르지 않는다', async () => {
    const onSelect = jest.fn();
    render(<FacePeopleStrip people={PEOPLE} onSelect={onSelect} onRemove={jest.fn()} />);

    await longPress(faceButtons()[0]);
    fireEvent.pointerDown(faceButtons()[2]);
    fireEvent.pointerUp(faceButtons()[2]);
    fireEvent.click(faceButtons()[2]);
    expect(xButton()).toBeNull();

    await longPress(faceButtons()[0]);
    fireEvent.click(screen.getByRole('button', { name: '모든 사진' }));
    expect(xButton()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Esc · 목록 바깥을 누르면 X 가 사라진다', async () => {
    render(<div><FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} /><p>바깥</p></div>);

    await longPress(faceButtons()[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(xButton()).toBeNull();

    await longPress(faceButtons()[0]);
    fireEvent.pointerDown(screen.getByText('바깥'));
    expect(xButton()).toBeNull();
  });

  it('마우스 오른쪽 클릭(휴대폰 길게 누르기 메뉴)과 키보드 Delete 로도 X 를 띄운다', async () => {
    render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} />);

    const notPrevented = fireEvent.contextMenu(faceButtons()[2]);
    expect(notPrevented).toBe(false);   // 브라우저 메뉴 대신
    expect(xButton()).toHaveAccessibleName('얼굴 3 목록에서 빼기');

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(faceButtons()[0], { key: 'Delete' });
    expect(xButton()).toHaveAccessibleName('얼굴 1 목록에서 빼기');
  });

  it('onRemove 가 없으면(학부모) 길게 눌러도·오른쪽 클릭해도 X 가 없다', async () => {
    render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} />);

    await longPress(faceButtons()[0]);
    fireEvent.contextMenu(faceButtons()[1]);
    fireEvent.keyDown(faceButtons()[1], { key: 'Delete' });

    expect(xButton()).toBeNull();
  });

  it('[전체] 는 길게 눌러도 빠지지 않는다', async () => {
    render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} />);

    await longPress(screen.getByRole('button', { name: '모든 사진' }));

    expect(xButton()).toBeNull();
  });

  it('X 가 떠 있던 사람이 목록에서 사라지면 X 도 닫힌다', async () => {
    const { rerender } = render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} />);
    await longPress(faceButtons()[1]);

    rerender(<FacePeopleStrip people={[PEOPLE[0], PEOPLE[2]]} onSelect={jest.fn()} onRemove={jest.fn()} />);

    expect(xButton()).toBeNull();
  });

  it('등록된 아이로 묶인 사람(removable: false)은 길게 눌러도·오른쪽 클릭·Delete 로도 X 가 없다', async () => {
    const onSelect = jest.fn();
    render(<FacePeopleStrip people={[{ ...PEOPLE[0], removable: false }, PEOPLE[1]]} onSelect={onSelect} onRemove={jest.fn()} />);

    await longPress(faceButtons()[0]);
    fireEvent.contextMenu(faceButtons()[0]);
    fireEvent.keyDown(faceButtons()[0], { key: 'Delete' });
    expect(xButton()).toBeNull();
    expect(onSelect).toHaveBeenCalledWith('p1');   // 그 사람은 평소처럼 고를 수 있다

    fireEvent.contextMenu(faceButtons()[1]);   // 다른 사람은 그대로 뺄 수 있다
    expect(xButton()).toHaveAccessibleName('얼굴 2 목록에서 빼기');
  });

  it('Backspace 로는 X 를 띄우지 않는다 — Delete 만', async () => {
    render(<FacePeopleStrip people={PEOPLE} onSelect={jest.fn()} onRemove={jest.fn()} />);

    fireEvent.keyDown(faceButtons()[0], { key: 'Backspace' });

    expect(xButton()).toBeNull();
  });
});

