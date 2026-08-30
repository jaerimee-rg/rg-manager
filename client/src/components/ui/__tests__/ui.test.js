import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  Badge, Button, Callout, DataTable, EmptyState, Field, IconButton, Input,
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
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: '학생' },
    { key: 'count', header: '출석', numeric: true }
  ];
  const rows = [{ id: 1, name: '김하늘', count: 12 }];

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
