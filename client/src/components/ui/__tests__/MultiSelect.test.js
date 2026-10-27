import React, { useState } from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { Field, Modal, MultiSelect } from '../index';

const options = [
  { value: 1, label: '김하늘', description: '2015-01-01' },
  { value: 2, label: '이바다', description: '2016-02-02', disabled: true },
  { value: 3, label: '박구름', description: '2014-03-03' },
];

function Harness({ onModalClose = () => {}, initial = [] }) {
  const [value, setValue] = useState(initial);
  const toggle = (v) => setValue((was) => (was.includes(v) ? was.filter((x) => x !== v) : [...was, v]));
  return (
    <Modal title="고르기" onClose={onModalClose}>
      <Field label="학생">
        {(props) => (
          <MultiSelect {...props} options={options} value={value} onToggle={toggle} listLabel="학생 목록" summary={`${value.length}명 선택`} />
        )}
      </Field>
      <button type="button">바깥 버튼</button>
      <output data-testid="value">{value.join(',')}</output>
    </Modal>
  );
}

const search = () => screen.getByRole('searchbox', { name: '학생' });
const panel = () => screen.queryByRole('group', { name: '학생 목록' });

describe('MultiSelect — 검색칸 + 드롭다운 체크 목록', () => {
  it('처음엔 접혀 있고, 검색칸에 포커스하면 펼쳐진다', () => {
    render(<Harness />);
    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학생 목록 열기' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.focus(search());
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학생 목록 닫기' })).toHaveAttribute('aria-expanded', 'true');
    expect(search()).toHaveAttribute('aria-controls', panel().id);
  });

  it('체크해도 닫히지 않고, 고른 것은 체크된 채로 남는다', () => {
    render(<Harness />);
    fireEvent.focus(search());
    fireEvent.click(within(panel()).getByRole('checkbox', { name: '김하늘' }));
    fireEvent.click(within(panel()).getByRole('checkbox', { name: '박구름' }));

    expect(panel()).toBeInTheDocument();
    expect(within(panel()).getByRole('checkbox', { name: '김하늘' })).toBeChecked();
    expect(panel()).toHaveTextContent('2명 선택');
    expect(screen.getByTestId('value')).toHaveTextContent('1,3');
  });

  it('입력하면 펼쳐지며 걸러 낸다 — 기본 규칙은 이름 포함', () => {
    render(<Harness />);
    fireEvent.change(search(), { target: { value: '구름' } });
    expect(within(panel()).getAllByRole('checkbox').map((c) => c.getAttribute('aria-labelledby'))).toHaveLength(1);
    expect(within(panel()).getByRole('checkbox', { name: '박구름' })).toBeInTheDocument();

    fireEvent.change(search(), { target: { value: '없음' } });
    expect(panel()).toHaveTextContent('검색 결과가 없어요');
  });

  it('고를 수 없는 항목은 잠겨 있다', () => {
    render(<Harness />);
    fireEvent.focus(search());
    expect(within(panel()).getByRole('checkbox', { name: '이바다' })).toBeDisabled();
  });

  it('Esc 는 목록만 닫고 모달은 그대로 — 한 번 더 누르면 모달이 닫힌다', () => {
    const onModalClose = jest.fn();
    render(<Harness onModalClose={onModalClose} />);
    act(() => search().focus());

    const notPrevented = fireEvent.keyDown(search(), { key: 'Escape' });
    expect(notPrevented).toBe(false); // 검색칸 기본 동작(검색어 지우기)도 막는다
    expect(panel()).not.toBeInTheDocument();
    expect(onModalClose).not.toHaveBeenCalled();
    expect(search()).toHaveFocus();

    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(onModalClose).toHaveBeenCalledTimes(1);
  });

  it('바깥을 누르면 클릭이 끝난 뒤에 닫힌다 — 누르는 순간(mousedown)에는 그대로', () => {
    render(<Harness />);
    fireEvent.focus(search());
    const outside = screen.getByRole('button', { name: '바깥 버튼' });

    fireEvent.mouseDown(outside);
    expect(panel()).toBeInTheDocument(); // 닫히며 버튼 줄이 밀려 클릭을 놓치지 않게

    fireEvent.click(outside);
    expect(panel()).not.toBeInTheDocument();
  });

  it('[완료] 를 누르면 닫힌다', () => {
    render(<Harness />);

    fireEvent.click(search());
    fireEvent.click(within(panel()).getByRole('button', { name: '완료' }));
    expect(panel()).not.toBeInTheDocument();
  });

  it('목록 안을 눌러도 닫히지 않고, 누른 곳으로 포커스를 옮기지 않는다', () => {
    render(<Harness />);
    fireEvent.focus(search());
    const row = within(panel()).getByText('김하늘');
    const pressed = fireEvent.mouseDown(row);
    expect(pressed).toBe(false); // 기본 동작(포커스 옮기기)을 막았다
    expect(panel()).toBeInTheDocument();
  });

  it('Tab 으로 바깥 칸에 가면 닫힌다', async () => {
    render(<Harness />);
    act(() => search().focus());
    fireEvent.keyDown(search(), { key: 'Tab' });
    act(() => screen.getByRole('button', { name: '바깥 버튼' }).focus());
    await waitFor(() => expect(panel()).not.toBeInTheDocument());
  });

  it('Tab 으로 목록 안 칸에 가면 열린 채다', async () => {
    render(<Harness />);
    act(() => search().focus());
    fireEvent.keyDown(search(), { key: 'Tab' });
    act(() => within(panel()).getByRole('checkbox', { name: '김하늘' }).focus());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(panel()).toBeInTheDocument();
  });

  it('마우스로 바깥 버튼에 포커스가 옮겨 가는 것만으로는 닫히지 않는다(클릭이 끝나야 닫힌다)', async () => {
    render(<Harness />);
    act(() => search().focus());
    act(() => screen.getByRole('button', { name: '바깥 버튼' }).focus()); // mousedown 이 포커스를 옮긴 상태
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(panel()).toBeInTheDocument();
  });

  it('↓ 로 첫 항목에 가고, ↑↓ 로 잠긴 항목을 건너뛰며 오간다', () => {
    render(<Harness />);
    search().focus();
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    const kim = within(panel()).getByRole('checkbox', { name: '김하늘' });
    expect(kim).toHaveFocus();

    fireEvent.keyDown(kim, { key: 'ArrowDown' });
    const park = within(panel()).getByRole('checkbox', { name: '박구름' });
    expect(park).toHaveFocus(); // 잠긴 이바다는 건너뛴다

    fireEvent.keyDown(park, { key: 'ArrowUp' });
    expect(kim).toHaveFocus();
    fireEvent.keyDown(kim, { key: 'ArrowUp' });
    expect(search()).toHaveFocus();
  });

  it('닫힌 상태에서 ↓ 를 누르면 펼치고 첫 항목으로 간다', () => {
    render(<Harness />);
    search().focus();
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();

    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(within(panel()).getByRole('checkbox', { name: '김하늘' })).toHaveFocus();
  });
});
