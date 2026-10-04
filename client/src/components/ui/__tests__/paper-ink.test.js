import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Badge, Divider, Icon, PageHeader, Stat, iconNames } from '../index';
import ParentLayout from '../../parent/ParentLayout';

/**
 * 종이 · 잉크 · 별 디자인 개편(mockup/)에서 컴포넌트에 더한 것들.
 * 모양은 CSS(ui.css)가 정하고, 컴포넌트는 data 속성으로 "어떤 모양인지"만 넘긴다.
 */

describe('PageHeader — 제목 옆 별 세 개', () => {
  it('목록 화면(뒤로 가기 없음)에는 별을 붙인다', () => {
    const { container } = render(<PageHeader title="학생 관리" />);
    expect(container.querySelector('.ui-page-header')).toHaveAttribute('data-doodle', 'true');
  });

  it('뒤로 가기가 있는 하위 화면에는 붙이지 않는다', () => {
    const { container } = render(<PageHeader title="학생 추가" onBack={() => {}} />);
    expect(container.querySelector('.ui-page-header')).not.toHaveAttribute('data-doodle');
  });

  it('doodle 로 직접 켜고 끈다', () => {
    const { container, rerender } = render(<PageHeader title="대시보드" doodle={false} />);
    expect(container.querySelector('.ui-page-header')).not.toHaveAttribute('data-doodle');
    rerender(<PageHeader title="학생 추가" onBack={() => {}} doodle />);
    expect(container.querySelector('.ui-page-header')).toHaveAttribute('data-doodle', 'true');
  });

  it('별은 CSS 배경이라 제목의 접근성 이름은 글자 그대로다', () => {
    render(<PageHeader title="이벤트 관리" />);
    expect(screen.getByRole('heading', { level: 1, name: '이벤트 관리' })).toBeInTheDocument();
  });
});

describe('Stat — 강조 변형', () => {
  it('variant 를 data 속성으로 넘긴다 (star · ink · alert)', () => {
    render(
      <>
        <Stat label="지금 수업 중" value="2반" variant="star" />
        <Stat label="합계" value="512회" variant="ink" />
        <Stat label="미확정" value="7건" variant="alert" />
      </>
    );
    expect(screen.getByText('2반').closest('.ui-stat')).toHaveAttribute('data-variant', 'star');
    expect(screen.getByText('512회').closest('.ui-stat')).toHaveAttribute('data-variant', 'ink');
    expect(screen.getByText('7건').closest('.ui-stat')).toHaveAttribute('data-variant', 'alert');
  });

  it('누를 수 있으면 button 이 되고, 모양은 인라인 스타일이 아니라 CSS 가 정한다', () => {
    const onClick = jest.fn();
    render(<Stat label="전체 학생" value="48명" onClick={onClick} />);
    const tile = screen.getByRole('button', { name: /전체 학생/ });
    expect(tile).toHaveAttribute('data-clickable', 'true');
    expect(tile).not.toHaveAttribute('style');
    tile.click();
    expect(onClick).toHaveBeenCalled();
  });

  it('누를 수 없으면 div 이고 data-clickable 이 없다', () => {
    render(<Stat label="전체 수업" value="3개" />);
    const tile = screen.getByText('3개').closest('.ui-stat');
    expect(tile.tagName).toBe('DIV');
    expect(tile).not.toHaveAttribute('data-clickable');
  });
});

describe('Badge · Divider', () => {
  it('muted 톤(대기 · 비활성)을 넘긴다', () => {
    render(<Badge tone="muted">휴원</Badge>);
    expect(screen.getByText('휴원')).toHaveAttribute('data-tone', 'muted');
  });

  it('Divider variant="zig" 는 지그재그 선이다', () => {
    const { container } = render(<Divider variant="zig" />);
    expect(container.querySelector('hr.ui-divider')).toHaveAttribute('data-variant', 'zig');
  });

  it('variant 가 없으면 보통 선이다', () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('hr.ui-divider')).not.toHaveAttribute('data-variant');
  });
});

describe('Icon — 잉크 펜 굵기와 메뉴 아이콘', () => {
  it('기본 선 굵기는 1.8 이다', () => {
    const { container } = render(<Icon name="home" />);
    expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.8');
  });

  it.each(['book', 'clipboard', 'message', 'bag', 'heart', 'shield', 'music', 'ticket'])(
    '메뉴용 아이콘 %s 가 있다',
    (name) => {
      expect(iconNames).toContain(name);
      const { container } = render(<Icon name={name} />);
      expect(container.querySelector('svg path')).not.toBeNull();
    }
  );
});

describe('ParentLayout — 제목 줄 + 아래 탭 바', () => {
  const renderAt = (path, props = {}) => render(
    <MemoryRouter initialEntries={[path]}>
      <ParentLayout title="일정" subtitle="2026년 남은 일정" {...props}>본문</ParentLayout>
    </MemoryRouter>
  );

  it('페이지 제목은 h1 하나다', () => {
    renderAt('/parent/schedule');
    expect(screen.getByRole('heading', { level: 1, name: '일정' })).toBeInTheDocument();
    expect(screen.getByText('2026년 남은 일정')).toBeInTheDocument();
  });

  it('탭은 링크이고 이모지 대신 선 아이콘을 그린다 — 접근성 이름은 글자뿐', () => {
    renderAt('/parent/schedule');
    const nav = screen.getByRole('navigation', { name: '학부모 메뉴' });
    const schedule = screen.getByRole('link', { name: '일정' });
    expect(nav).toContainElement(schedule);
    expect(schedule.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('link', { name: '사진' })).toHaveAttribute('href', '/parent/photos');
    expect(screen.getByRole('link', { name: '내 정보' })).toHaveAttribute('href', '/parent/settings');
  });

  it('현재 탭에만 aria-current 가 붙는다', () => {
    renderAt('/parent/photos/12');
    expect(screen.getByRole('link', { name: '사진' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '일정' })).not.toHaveAttribute('aria-current');
  });

  it('공유 링크로 연 이벤트 상세는 일정 탭이 켜진다', () => {
    renderAt('/parent/events/7');
    expect(screen.getByRole('link', { name: '일정' })).toHaveAttribute('aria-current', 'page');
  });

  it('아직 없는 채팅 탭은 링크가 아니다', () => {
    renderAt('/parent/schedule');
    expect(screen.queryByRole('link', { name: '채팅' })).toBeNull();
    expect(screen.getByText('채팅').closest('[data-soon]')).toHaveAttribute('title', '곧 추가됩니다');
  });

  it('back 이 있으면 뒤로 가기 버튼이 붙는다', () => {
    renderAt('/parent/events/7', { back: '/parent/schedule' });
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
  });
});
