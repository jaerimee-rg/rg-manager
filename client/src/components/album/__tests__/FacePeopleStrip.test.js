import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn() }));

import { cropFaces } from '../../../utils/faceCrops';
import FacePeopleStrip from '../FacePeopleStrip';

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
});
