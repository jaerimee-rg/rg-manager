import React from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner, LogoHop } from '..';
import { LOGO_SRC } from '../../../utils/brand';

describe('Spinner — 로고가 위아래로 튀는 로딩 표시', () => {
  it('기본: 로고 + "불러오는 중..." 글자, role=status', () => {
    const { container } = render(<Spinner />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('불러오는 중...');

    const hop = container.querySelector('.ui-logo-hop');
    expect(hop).toHaveAttribute('aria-hidden', 'true');
    expect(hop).toHaveStyle({ '--hop-size': '56px' });
    expect(hop.querySelector('img')).toHaveAttribute('src', LOGO_SRC);
  });

  it('fullscreen 이면 크게(84px), inline 이면 작게(30px), 글자는 바꿀 수 있다', () => {
    const { container, rerender } = render(<Spinner fullscreen label="로딩 중..." />);
    expect(screen.getByRole('status')).toHaveAttribute('data-fullscreen', 'true');
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
    expect(container.querySelector('.ui-logo-hop')).toHaveStyle({ '--hop-size': '84px' });

    rerender(<Spinner inline />);
    expect(screen.getByRole('status')).toHaveAttribute('data-inline', 'true');
    expect(container.querySelector('.ui-logo-hop')).toHaveStyle({ '--hop-size': '30px' });

    rerender(<Spinner size="sm" />);
    expect(container.querySelector('.ui-logo-hop')).toHaveStyle({ '--hop-size': '30px' });
  });

  it('LogoHop 만 쓰면 글자 없이 로고만 튄다', () => {
    const { container } = render(<LogoHop size={30} />);
    expect(container.querySelector('.ui-logo-hop')).toHaveStyle({ '--hop-size': '30px' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
