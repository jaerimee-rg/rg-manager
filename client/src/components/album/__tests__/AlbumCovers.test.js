import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AlbumCovers from '../AlbumCovers';

const URLS = ['https://lh3/a', 'https://lh3/b', 'https://lh3/c'];
const images = () => [...document.querySelectorAll('.ui-album-card__cover img')];

describe('AlbumCovers — 앨범 카드 표지의 대표 사진들', () => {
  it('장수를 data-covers 로 알리고, 사진마다 따로 잘리는 칸에 넣는다(확대한 사진이 옆 칸을 덮지 않게)', () => {
    render(<AlbumCovers urls={URLS} data-testid="covers" />);

    expect(screen.getByTestId('covers')).toHaveAttribute('data-covers', '3');
    expect(document.querySelectorAll('.ui-album-card__cover > .ui-album-card__cover-slot')).toHaveLength(3);
    expect(images().map((img) => img.getAttribute('src'))).toEqual(URLS);
    // 칸은 버튼이 아니다 — 카드 전체가 하나의 버튼이다
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('보일 부분이 있으면 그 사진만 그 위치·확대로 — 없으면 가운데', () => {
    render(<AlbumCovers urls={URLS} crops={[{ x: 20, y: 80, zoom: 2 }, null]} />);

    expect(images()[0].style.objectPosition).toBe('20% 80%');
    expect(images()[0].style.transform).toBe('scale(2)');
    expect(images()[0].style.transformOrigin).toBe('20% 80%');
    expect(images()[1].style.objectPosition).toBe('');
    expect(images()[2].style.transform).toBe('');
  });

  it('onSelect 를 주면 칸마다 버튼이 되고, 누른 칸의 순서를 넘긴다', () => {
    const onSelect = jest.fn();
    render(<AlbumCovers urls={URLS} onSelect={onSelect} slotLabel={(i) => `${i + 1}번 사진 보일 부분 고르기`} />);

    fireEvent.click(screen.getByRole('button', { name: '2번 사진 보일 부분 고르기' }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('4장까지만 그린다', () => {
    render(<AlbumCovers urls={[...URLS, 'https://lh3/d', 'https://lh3/e']} />);
    expect(images()).toHaveLength(4);
  });
});
