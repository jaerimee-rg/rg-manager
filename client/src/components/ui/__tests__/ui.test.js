import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import {
  Badge, Button, Callout, ClearableInput, DataTable, EmptyState, Field, IconButton, Input,
  Menu, MenuItem, Modal, Pagination, Progress, Switch, SwitchField, Tabs, Chip
} from '../index';

describe('Button', () => {
  it('variant 와 size 를 data 속성으로 넘겨 스타일을 한곳에서 정한다', () => {
    render(<Button variant="primary" size="lg">저장</Button>);
    const button = screen.getByRole('button', { name: '저장' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('기본 type 은 submit 이 아니라 button 이다 (폼 안에서 의도치 않게 제출되지 않게)', () => {
    render(<Button>취소</Button>);
    expect(screen.getByRole('button', { name: '취소' })).toHaveAttribute('type', 'button');
  });

  it('loading 이면 눌리지 않고 aria-busy 가 붙는다', () => {
    const onClick = jest.fn();
    render(<Button loading onClick={onClick}>저장</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('IconButton 은 label 을 접근성 이름으로 쓴다', () => {
    render(<IconButton icon="search" label="검색" />);
    expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('라벨을 입력과 연결한다', () => {
    render(
      <Field label="학생 이름">{(props) => <Input {...props} />}</Field>
    );
    expect(screen.getByLabelText('학생 이름')).toBeInTheDocument();
  });

  it('오류가 있으면 힌트 대신 오류를 보여주고 입력을 invalid 로 표시한다', () => {
    render(
      <Field label="생년월일" hint="YYYY-MM-DD" error="형식이 올바르지 않아요">
        {(props) => <Input {...props} />}
      </Field>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('형식이 올바르지 않아요');
    expect(screen.queryByText('YYYY-MM-DD')).not.toBeInTheDocument();
    expect(screen.getByLabelText('생년월일')).toHaveAttribute('aria-invalid', 'true');
  });

  it('글자 수가 한도를 넘으면 counter 에 over 가 붙고 입력이 invalid 가 된다', () => {
    render(
      <Field label="질문" counter={{ value: 201, max: 200 }}>
        {(props) => <Input {...props} />}
      </Field>
    );
    expect(screen.getByText('201 / 200')).toHaveClass('over');
    expect(screen.getByLabelText('질문')).toHaveAttribute('aria-invalid', 'true');
  });

  it('한도 안이면 over 가 붙지 않는다', () => {
    render(
      <Field label="질문" counter={{ value: 12, max: 200 }}>
        {(props) => <Input {...props} />}
      </Field>
    );
    expect(screen.getByText('12 / 200')).not.toHaveClass('over');
  });
});

describe('ClearableInput', () => {
  it('값이 없으면 지우기 버튼이 없다', () => {
    render(<ClearableInput type="time" value="" onChange={() => {}} onClear={() => {}} clearLabel="시간 지우기" />);
    expect(screen.queryByRole('button', { name: '시간 지우기' })).not.toBeInTheDocument();
  });

  it('값이 있으면 지우기 버튼이 뜨고 onClear 를 부른다', () => {
    const onClear = jest.fn();
    render(<ClearableInput type="time" value="14:30" onChange={() => {}} onClear={onClear} clearLabel="시간 지우기" />);
    fireEvent.click(screen.getByRole('button', { name: '시간 지우기' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('폼 안에서 눌러도 제출되지 않도록 type 은 button 이다', () => {
    render(<ClearableInput type="date" value="2026-09-12" onChange={() => {}} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: '지우기' })).toHaveAttribute('type', 'button');
  });

  it('disabled 면 지우기 버튼을 감춘다', () => {
    render(<ClearableInput type="date" value="2026-09-12" disabled onChange={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole('button', { name: '지우기' })).not.toBeInTheDocument();
  });

  it('Field 가 넘긴 id·설명을 입력칸이 그대로 받는다', () => {
    render(
      <Field label="종료일" hint="기간일 때만 채웁니다">
        {(props) => <ClearableInput {...props} type="date" value="" onChange={() => {}} onClear={() => {}} />}
      </Field>
    );
    expect(screen.getByLabelText('종료일')).toHaveAttribute('type', 'date');
  });
});

describe('Modal', () => {
  it('Esc 로 닫힌다', () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="이벤트 신청">내용</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('열려 있는 동안 뒤 배경 스크롤을 막고, 닫으면 되돌린다', () => {
    const { unmount } = render(<Modal open onClose={() => {}} title="제목">내용</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('open 이 false 면 아무것도 그리지 않는다', () => {
    render(<Modal open={false} onClose={() => {}} title="제목">내용</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dialog 역할과 이름을 갖는다', () => {
    render(<Modal open onClose={() => {}} title="이벤트 신청">내용</Modal>);
    expect(screen.getByRole('dialog', { name: '이벤트 신청' })).toBeInTheDocument();
  });

  it('부모가 그릴 때마다 새 onClose 를 넘겨도 입력 중인 칸의 포커스를 빼앗지 않고, Esc 는 지금의 onClose 를 부른다', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Modal open onClose={first} title="상품"><input aria-label="이름" /></Modal>);
    const input = screen.getByLabelText('이름');
    input.focus();
    rerender(<Modal open onClose={second} title="상품"><input aria-label="이름" /></Modal>);
    expect(input).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('header={false} 면 제목 줄(닫기 버튼)이 없어도 Esc·바깥 누르기로 닫힌다', () => {
    const onClose = jest.fn();
    render(
      <Modal open onClose={onClose} header={false} labelledBy="t">
        <h2 id="t">상품</h2>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: '상품' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.ui-scrim'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe('swipeToClose — 휴대폰 바텀시트를 끌어내려 닫기', () => {
    let phone = true;
    const originalMatchMedia = window.matchMedia;
    beforeEach(() => {
      phone = true;
      jest.useFakeTimers();
      window.matchMedia = (query) => ({ matches: query === '(max-width: 767px)' && phone, media: query });
    });
    afterEach(() => {
      jest.useRealTimers();
      window.matchMedia = originalMatchMedia;
    });

    /** 손가락 하나의 터치 이벤트. t 는 ms (놓는 순간의 속도를 잰다) */
    const touch = (el, type, { x = 100, y, t }) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
      Object.defineProperty(event, 'timeStamp', { value: t });
      el.dispatchEvent(event);
      return event;
    };
    /** from 에서 (dx, dy) 만큼 steps 번에 나눠 duration ms 동안 민다 */
    const swipe = (el, { dx = 0, dy, duration = 300, steps = 6 }) => {
      touch(el, 'touchstart', { x: 100, y: 100, t: 0 });
      const moves = [];
      for (let i = 1; i <= steps; i += 1) {
        moves.push(touch(el, 'touchmove', { x: 100 + (dx * i) / steps, y: 100 + (dy * i) / steps, t: (duration * i) / steps }));
      }
      return { moves, end: () => touch(el, 'touchend', { t: duration }) };
    };
    const sheet = (props = {}) => {
      const onClose = jest.fn();
      render(
        <Modal open onClose={onClose} header={false} labelledBy="t" swipeToClose {...props}>
          <h2 id="t">상품</h2>
          <p>설명</p>
          <input aria-label="메모" />
        </Modal>
      );
      return { onClose, panel: screen.getByRole('dialog'), text: screen.getByText('설명') };
    };

    it('충분히 끌어내리면 손가락을 따라 내려오다가, 놓으면 아래로 내려가며 닫힌다', () => {
      const { onClose, panel, text } = sheet();
      const { moves, end } = swipe(text, { dy: 200 });
      expect(moves.every((event) => event.defaultPrevented)).toBe(true);
      expect(panel.style.transform).toBe('translateY(200px)');

      end();
      expect(panel.style.transform).toBe('translateY(100%)');
      expect(document.querySelector('.ui-scrim').style.opacity).toBe('0');
      expect(onClose).not.toHaveBeenCalled(); // 내려가는 움직임이 끝난 뒤에
      jest.advanceTimersByTime(180);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('조금 천천히 끌다 놓으면 닫히지 않고 제자리로 돌아간다', () => {
      const { onClose, panel, text } = sheet();
      const { end } = swipe(text, { dy: 60, duration: 600 });
      expect(panel.style.transform).toBe('translateY(60px)');
      end();
      jest.advanceTimersByTime(500);
      expect(panel.style.transform).toBe('');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('짧아도 빠르게 튕기면 닫힌다', () => {
      const { onClose, text } = sheet();
      swipe(text, { dy: 60, duration: 60 }).end();
      jest.advanceTimersByTime(180);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('본문이 내려가 있으면 아래로 밀어도 본문 스크롤이다 (시트를 끌지 않는다)', () => {
      const { onClose, panel, text } = sheet();
      panel.querySelector('.ui-overlay__body').scrollTop = 120;
      const { moves, end } = swipe(text, { dy: 200 });
      expect(moves.some((event) => event.defaultPrevented)).toBe(false);
      end();
      jest.advanceTimersByTime(500);
      expect(panel.style.transform).toBe('');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('옆으로 밀기(사진 넘기기)와 위로 밀기는 브라우저에 맡긴다', () => {
      const { onClose, text } = sheet();
      const sideways = swipe(text, { dx: -200, dy: 30 });
      expect(sideways.moves.some((event) => event.defaultPrevented)).toBe(false);
      sideways.end();
      const up = swipe(text, { dy: -200 });
      expect(up.moves.some((event) => event.defaultPrevented)).toBe(false);
      up.end();
      jest.advanceTimersByTime(500);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('입력 칸에서 시작한 제스처는 가져가지 않는다', () => {
      const { onClose } = sheet();
      swipe(screen.getByLabelText('메모'), { dy: 200 }).end();
      jest.advanceTimersByTime(500);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('넓은 화면(가운데 모달)·swipeToClose 를 켜지 않은 시트·mode="modal" 은 끌어도 닫히지 않는다', () => {
      phone = false;
      const wide = sheet();
      swipe(wide.text, { dy: 300 }).end();
      jest.advanceTimersByTime(500);
      expect(wide.onClose).not.toHaveBeenCalled();
      cleanup();

      phone = true;
      for (const props of [{ swipeToClose: false }, { mode: 'modal' }]) {
        const off = sheet(props);
        swipe(off.text, { dy: 300 }).end();
        jest.advanceTimersByTime(500);
        expect(off.onClose).not.toHaveBeenCalled();
        expect(off.panel.style.transform).toBe('');
        cleanup();
      }
    });

    it('onClose 가 창을 닫지 않으면 내려 둔 시트를 잠시 뒤 되돌린다 — 보이지 않는 시트가 화면을 막지 않게', () => {
      const { onClose, panel, text } = sheet(); // onClose 는 아무것도 하지 않는다 — 창이 그대로 남는다
      const scrim = document.querySelector('.ui-scrim');
      swipe(text, { dy: 200 }).end();
      jest.advanceTimersByTime(180);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(panel.style.transform).toBe('translateY(100%)');

      jest.advanceTimersByTime(600);
      expect(panel.style.transform).toBe('');
      expect(scrim.style.opacity).toBe('');

      // 다시 끌어내릴 수 있다
      swipe(text, { dy: 200 }).end();
      jest.advanceTimersByTime(180);
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('창이 열린 채 swipeToClose 가 꺼지면(예: 예약 폼으로 바뀜) 끌던 자리를 남기지 않는다', () => {
      const onClose = jest.fn();
      const view = (swipeToClose) => (
        <Modal open onClose={onClose} header={false} labelledBy="t" swipeToClose={swipeToClose}>
          <h2 id="t">상품</h2>
          <p>설명</p>
        </Modal>
      );
      const { rerender } = render(view(true));
      const panel = screen.getByRole('dialog');
      const text = screen.getByText('설명');
      touch(text, 'touchstart', { y: 100, t: 0 });
      touch(text, 'touchmove', { y: 220, t: 100 });
      expect(panel.style.transform).toBe('translateY(120px)');

      rerender(view(false));
      expect(panel.style.transform).toBe('');
      expect(document.querySelector('.ui-scrim').style.opacity).toBe('');
      touch(text, 'touchmove', { y: 400, t: 200 });
      touch(text, 'touchend', { t: 300 });
      jest.advanceTimersByTime(1000);
      expect(panel.style.transform).toBe('');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('두 손가락이 닿으면(확대) 끌던 시트를 제자리로 돌린다', () => {
      const { onClose, panel, text } = sheet();
      touch(text, 'touchstart', { y: 100, t: 0 });
      touch(text, 'touchmove', { y: 220, t: 100 });
      expect(panel.style.transform).toBe('translateY(120px)');
      const pinch = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(pinch, 'touches', { value: [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }] });
      text.dispatchEvent(pinch);
      touch(text, 'touchend', { t: 200 });
      jest.advanceTimersByTime(500);
      expect(panel.style.transform).toBe('');
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: '학생' },
    { key: 'count', header: '출석', numeric: true }
  ];
  const rows = [{ id: 1, name: '김하늘', count: 12 }];

  it('rowProps 로 행(<tr>)에 속성을 붙인다', () => {
    render(<DataTable columns={columns} rows={rows} rowProps={(row, i) => ({ 'data-index': i, 'data-name': row.name })} />);
    const row = screen.getByText('김하늘').closest('tr');
    expect(row).toHaveAttribute('data-index', '0');
    expect(row).toHaveAttribute('data-name', '김하늘');
  });

  it('컬럼 정의 하나로 표를 그린다', () => {
    render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByRole('columnheader', { name: '학생' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '김하늘' })).toBeInTheDocument();
  });

  it('모바일에서 라벨로 쓰도록 각 셀에 data-label 을 붙인다', () => {
    render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByRole('cell', { name: '김하늘' })).toHaveAttribute('data-label', '학생');
  });

  it('행이 없으면 empty 를 대신 보여준다', () => {
    render(<DataTable columns={columns} rows={[]} empty={<EmptyState title="비어 있어요" />} />);
    expect(screen.getByText('비어 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('onRowClick 을 주면 행을 눌러 열 수 있다', () => {
    const onRowClick = jest.fn();
    render(<DataTable columns={columns} rows={rows} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByRole('cell', { name: '김하늘' }).closest('tr'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('column.hidden 인 행에서는 칸을 비우고 표시만 CSS 에 맡긴다', () => {
    const withHidden = [{ ...columns[0] }, { ...columns[1], hidden: (row) => row.count == null }];
    render(<DataTable columns={withHidden} rows={[{ id: 1, name: '김하늘', count: null }]} />);

    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveAttribute('data-blank', 'true');
    expect(cells[1]).toBeEmptyDOMElement();
  });

  it('column.hidden 이 아닌 행은 그대로 그린다', () => {
    const withHidden = [{ ...columns[0] }, { ...columns[1], hidden: (row) => row.count == null }];
    render(<DataTable columns={withHidden} rows={rows} />);

    const cells = screen.getAllByRole('cell');
    expect(cells[1]).not.toHaveAttribute('data-blank');
    expect(cells[1]).toHaveTextContent('12');
  });
});

describe('Menu', () => {
  it('트리거를 누르면 열리고, Esc 로 닫힌다', () => {
    render(
      <Menu trigger={(props) => <Button {...props}>관리</Button>}>
        <MenuItem>수정</MenuItem>
      </Menu>
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '관리' }));
    expect(within(screen.getByRole('menu')).getByText('수정')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('바깥을 누르면 닫힌다', () => {
    render(
      <Menu trigger={(props) => <Button {...props}>관리</Button>}>
        <MenuItem>수정</MenuItem>
      </Menu>
    );
    fireEvent.click(screen.getByRole('button', { name: '관리' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Tabs · Chip', () => {
  it('선택된 탭만 aria-selected 를 갖는다', () => {
    render(
      <Tabs
        value="a"
        onChange={() => {}}
        items={[{ id: 'a', label: '기초' }, { id: 'b', label: '액션' }]}
      />
    );
    expect(screen.getByRole('tab', { name: '기초' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /액션/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('Chip 은 선택 상태를 aria-pressed 로 알린다', () => {
    render(<Chip selected>전체</Chip>);
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Badge · Callout · Progress · Pagination', () => {
  it('Badge 는 tone 을 data 속성으로 넘긴다', () => {
    render(<Badge tone="success">수강 중</Badge>);
    expect(screen.getByText('수강 중')).toHaveAttribute('data-tone', 'success');
  });

  it('위험 톤 Callout 은 alert 로 읽힌다', () => {
    render(<Callout tone="danger">이미 마감됐어요</Callout>);
    expect(screen.getByRole('alert')).toHaveTextContent('이미 마감됐어요');
  });

  it('Progress 는 진행률을 aria 로 노출한다', () => {
    render(<Progress value={18} max={24} label="확정 인원" />);
    const bar = screen.getByRole('progressbar', { name: '확정 인원' });
    expect(bar).toHaveAttribute('aria-valuenow', '18');
    expect(bar).toHaveAttribute('aria-valuemax', '24');
  });

  it('첫 페이지에서는 이전 버튼이 꺼져 있다', () => {
    render(<Pagination page={1} pageCount={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
  });
});

describe('Switch', () => {
  it('switch 역할로 읽히고 상태가 바뀐다', () => {
    const onChange = jest.fn();
    render(<Switch label="알림 받기" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: '알림 받기' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalled();
  });

  it('SwitchField 는 설명을 함께 보여준다', () => {
    render(<SwitchField label="AI 답변" description="FAQ 를 근거로 답합니다." checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'AI 답변' })).toBeChecked();
    expect(screen.getByText('FAQ 를 근거로 답합니다.')).toBeInTheDocument();
  });
});
