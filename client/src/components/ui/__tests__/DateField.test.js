import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DateField, Field } from '..';
import { pickDate } from './pickDate';

function Harness({ initial = '', onChange = () => {}, ...rest }) {
  const [value, setValue] = useState(initial);
  return (
    <Field label="날짜" required htmlFor="when" hint="폴더 이름 앞에 붙어요">
      {(props) => (
        <DateField
          {...props}
          {...rest}
          value={value}
          onChange={(iso) => {
            setValue(iso);
            onChange(iso);
          }}
        />
      )}
    </Field>
  );
}

const field = () => screen.getByRole('button', { name: /^날짜/ });

describe('DateField — 누르면 그 자리에 앱 달력이 펼쳐지는 날짜 칸 (iPad 기본 피커 대신)', () => {
  it('브라우저 날짜 입력칸을 쓰지 않는다 — 라벨과 지금 값이 칸의 이름이다', () => {
    const { container } = render(<Harness initial="2026-10-10" />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(field()).toHaveAccessibleName('날짜 2026년 10월 10일 (토)');
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(field()).toHaveAttribute('aria-describedby', 'when-hint');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('값이 없으면 안내 글자를 보여 준다', () => {
    render(<Harness placeholder="날짜를 골라요" />);
    expect(field()).toHaveAccessibleName('날짜 날짜를 골라요');
  });

  it('누르면 그 달의 날이 다 보이는 달력이 펼쳐지고, 날을 누르면 그 날짜로 바뀌고 닫힌다', async () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-10" onChange={onChange} />);

    await act(async () => { fireEvent.click(field()); });
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^10월 31일 / })).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^10월 3일 / })); });
    expect(onChange).toHaveBeenCalledWith('2026-10-03');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(field()).toHaveAccessibleName('날짜 2026년 10월 3일 (토)');
    expect(field()).toHaveFocus();
  });

  it('열면 펼친 달력까지 보이게 스크롤한다 — 시트 아래쪽에서 열어도 버튼 줄에 가리지 않게', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<Harness initial="2026-10-10" />);
      expect(scrollIntoView).not.toHaveBeenCalled();
      await act(async () => { fireEvent.click(field()); });
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
      expect(scrollIntoView.mock.contexts[0]).toContainElement(screen.getByRole('grid'));
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it('다른 달·다른 해로 넘겨서 고를 수 있다', async () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-10" onChange={onChange} />);

    await pickDate(screen, /^날짜/, '2025-12-24');
    expect(onChange).toHaveBeenLastCalledWith('2025-12-24');
    expect(field()).toHaveAccessibleName('날짜 2025년 12월 24일 (수)');
  });

  it('다시 누르면 고르지 않고 닫힌다', async () => {
    const onChange = jest.fn();
    render(<Harness initial="2026-10-10" onChange={onChange} />);

    await act(async () => { fireEvent.click(field()); });
    await act(async () => { fireEvent.click(field()); });
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Esc 는 달력만 닫는다 — 바깥(모달)의 Esc 처리까지 가지 않는다', async () => {
    const outer = jest.fn();
    function WithOuterEsc() {
      useEffect(() => {
        document.addEventListener('keydown', outer);
        return () => document.removeEventListener('keydown', outer);
      }, []);
      return <Harness initial="2026-10-10" />;
    }
    render(<WithOuterEsc />);

    await act(async () => { fireEvent.click(field()); });
    await act(async () => { fireEvent.keyDown(screen.getByRole('button', { name: /^10월 10일 / }), { key: 'Escape' }); });
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(outer).not.toHaveBeenCalled();

    // 닫힌 뒤의 Esc 는 그대로 바깥으로 간다
    await act(async () => { fireEvent.keyDown(field(), { key: 'Escape' }); });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('min · max 밖의 날은 누를 수 없다', async () => {
    render(<Harness initial="2026-10-10" min="2026-10-05" max="2026-10-20" />);
    await act(async () => { fireEvent.click(field()); });
    expect(screen.getByRole('button', { name: /^10월 4일 / })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^10월 21일 / })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^10월 5일 / })).toBeEnabled();
  });

  it('잠긴 칸은 열리지 않고, 오류면 aria-invalid 가 붙는다', async () => {
    const { rerender } = render(<DateField id="d" value="2026-10-10" disabled onChange={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    rerender(<DateField id="d" value="2026-10-10" invalid onChange={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-invalid', 'true');
  });
});
