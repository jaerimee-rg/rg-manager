import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Calendar } from '..';

function Harness({ initial = '', min, max, onChange = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <Calendar
      label="예약 날짜"
      value={value}
      min={min}
      max={max}
      onChange={(iso) => {
        setValue(iso);
        onChange(iso);
      }}
    />
  );
}

const day = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('Calendar — 그 자리에 펼쳐지는 한 달 달력', () => {
  it('고른 날이 있는 달을 일요일부터 그리고, 누르면 그 날짜를 돌려준다', () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-10" min="2026-10-04" max="2026-12-31" onChange={onChange} />);

    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['일', '월', '화', '수', '목', '금', '토']);
    expect(day('10월 10일 토요일')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(day('10월 15일 목요일'));
    expect(onChange).toHaveBeenCalledWith('2026-10-15');
    expect(day('10월 15일 목요일')).toHaveAttribute('aria-pressed', 'true');
    expect(day('10월 10일 토요일')).toHaveAttribute('aria-pressed', 'false');
  });

  it('범위 밖의 날은 누를 수 없고, 범위 밖의 달로는 넘어가지 않는다', () => {
    render(<Harness initial="2026-10-10" min="2026-10-04" max="2026-11-05" />);

    expect(day('10월 3일 토요일')).toBeDisabled();
    expect(day('10월 4일 일요일')).toBeEnabled();
    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(day('11월 5일 목요일')).toBeEnabled();
    expect(day('11월 6일 금요일')).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
  });

  it('값이 없으면 오늘이 있는 달을 보여 주고 오늘에 표시가 있다', () => {
    const now = new Date();
    render(<Harness />);
    expect(screen.getByText(`${now.getFullYear()}년 ${now.getMonth() + 1}월`)).toBeInTheDocument();
    const today = screen.getByRole('button', { name: /, 오늘$/ });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveAttribute('data-today', 'true');
  });

  it('Tab 은 한 날에만 멈추고, ←→↑↓ 로 하루·한 주씩 옮긴다 — 달이 바뀌면 따라 넘어간다', () => {
    render(<Harness initial="2026-10-30" min="2026-10-04" max="2026-12-31" />);
    const focusable = screen.getAllByRole('button').filter((b) => b.dataset.iso && b.tabIndex === 0);
    expect(focusable.map((b) => b.dataset.iso)).toEqual(['2026-10-30']);

    const start = day('10월 30일 금요일');
    act(() => start.focus());
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-10-31');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-11-07');

    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-10-31');
  });

  it('범위 밖으로는 키로도 가지 않는다', () => {
    render(<Harness initial="2026-10-04" min="2026-10-04" max="2026-10-31" />);
    const first = day('10월 4일 일요일');
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });
});
