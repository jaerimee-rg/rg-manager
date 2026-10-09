import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RetryImage from '../RetryImage';

const SRC = 'https://lh3.googleusercontent.com/d/f1=w400-h400-c-rw';
const imgOf = (container) => container.querySelector('img');

describe('RetryImage — 못 뜬 썸네일을 다시 부른다', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('실패하면 기다리는 동안 숨기고, 잠시 뒤 retry=1 을 붙여 다시 부른다 — 뜨면 그대로 보인다', () => {
    const { container } = render(<RetryImage src={SRC} loading="lazy" style={{ objectFit: 'cover' }} />);
    expect(imgOf(container)).toHaveAttribute('src', SRC);
    expect(imgOf(container)).toHaveAttribute('loading', 'lazy');

    fireEvent.error(imgOf(container));
    // 기다리는 동안 깨진 그림 대신 칸 배경
    expect(imgOf(container).style.visibility).toBe('hidden');
    expect(imgOf(container)).toHaveAttribute('src', SRC);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(imgOf(container)).toHaveAttribute('src', `${SRC}?retry=1`);
    expect(imgOf(container).style.visibility).toBe('');
    expect(imgOf(container).style.objectFit).toBe('cover');
  });

  it('끝내 안 되면 빈칸 대신 사진 아이콘 — 칸을 같은 크기로 채우고 누를 수 있다', () => {
    const onClick = jest.fn();
    const { container } = render(
      <RetryImage src={SRC} loading="lazy" onClick={onClick} style={{ width: '58px', height: '58px' }} />
    );

    [1000, 3000, 8000].forEach((wait, attempt) => {
      fireEvent.error(imgOf(container));
      act(() => { jest.advanceTimersByTime(wait); });
      expect(imgOf(container)).toHaveAttribute('src', `${SRC}?retry=${attempt + 1}`);
    });
    fireEvent.error(imgOf(container));

    expect(imgOf(container)).toBeNull();
    const failed = screen.getByTestId('image-failed');
    expect(failed.querySelector('svg')).not.toBeNull();
    expect(failed.style.width).toBe('58px');
    expect(failed.style.height).toBe('58px');
    expect(failed).not.toHaveAttribute('loading');
    fireEvent.click(failed);
    expect(onClick).toHaveBeenCalled();
  });

  it('주소가 바뀌면 처음부터 다시 — 앞 주소의 실패를 물려받지 않는다', () => {
    const { container, rerender } = render(<RetryImage src={SRC} />);
    fireEvent.error(imgOf(container));

    rerender(<RetryImage src="https://lh3.googleusercontent.com/d/f2=w400-h400-c-rw" />);
    expect(imgOf(container)).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f2=w400-h400-c-rw');
    expect(imgOf(container).style.visibility).toBe('');
    // 앞 주소의 기다림이 새 주소를 건드리지 않는다
    act(() => { jest.advanceTimersByTime(10000); });
    expect(imgOf(container)).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f2=w400-h400-c-rw');
  });

  it('주소가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<RetryImage src={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
