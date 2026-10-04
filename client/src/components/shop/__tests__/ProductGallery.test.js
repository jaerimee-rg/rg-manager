import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductGallery, { slideIndexAt } from '../ProductGallery';

describe('slideIndexAt — 가로 스크롤 위치 → 사진 번호', () => {
  it('가장 가까운 사진, 범위를 넘지 않는다', () => {
    expect(slideIndexAt(0, 390, 4)).toBe(0);
    expect(slideIndexAt(390 * 1.6, 390, 4)).toBe(2);
    expect(slideIndexAt(390 * 9, 390, 4)).toBe(3);
    expect(slideIndexAt(-20, 390, 4)).toBe(0);
    expect(slideIndexAt(100, 0, 4)).toBe(0);
  });
});

describe('ProductGallery', () => {
  const IMAGES = ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'];

  it('밀어서 넘기면(스크롤) 숫자·점·작은 사진이 따라온다', () => {
    const { container } = render(<ProductGallery images={IMAGES} title="리본" />);
    const track = container.querySelector('.shop-gallery__track');
    Object.defineProperty(track, 'clientWidth', { value: 390 });
    track.scrollLeft = 390;
    fireEvent.scroll(track);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2번째 사진' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: '2번째 사진 보기' })).toHaveAttribute('aria-current', 'true');
  });

  it('화살표·작은 사진은 그 사진 위치로 스크롤한다', () => {
    const { container } = render(<ProductGallery images={IMAGES} title="리본" />);
    const track = container.querySelector('.shop-gallery__track');
    Object.defineProperty(track, 'clientWidth', { value: 400 });
    track.scrollTo = jest.fn();

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: 'smooth' });
    fireEvent.click(screen.getByRole('button', { name: '3번째 사진 보기' }));
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: 'smooth' });
  });

  it('사진이 없으면 빈 칸 하나, 넘기기 표시는 없다', () => {
    const { container } = render(<ProductGallery images={[]} title="곤봉" />);
    expect(container.querySelectorAll('.shop-gallery__slide')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
