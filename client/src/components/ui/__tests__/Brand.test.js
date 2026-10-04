import React from 'react';
import { render, screen } from '@testing-library/react';
import { Brand } from '..';
import { SERVICE_NAME, LOGO_SRC } from '../../../utils/brand';

describe('Brand — 로고 아래 서비스명', () => {
  it('로고 그림 다음에 서비스 이름이 온다 (로고 위, 이름 아래)', () => {
    const { container } = render(<Brand />);

    const block = container.querySelector('.ui-brand');
    expect(block).toHaveAttribute('data-size', 'md');

    const [logo, name] = block.children;
    expect(logo.tagName).toBe('IMG');
    expect(logo).toHaveAttribute('src', LOGO_SRC);
    // 장식용 그림이라 스크린리더가 읽지 않게 alt 는 비운다 — 이름은 바로 아래 글자가 알려 준다
    expect(logo).toHaveAttribute('alt', '');
    expect(name).toHaveTextContent(SERVICE_NAME);
    expect(SERVICE_NAME).toBe('JR 리듬체조');
  });

  it('페이지 제목으로 쓰면 h1 이 되고, 크기·추가 설명을 받는다', () => {
    render(<Brand as="h1" size="lg" caption="관리자" />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('ui-brand');
    expect(heading).toHaveAttribute('data-size', 'lg');
    expect(heading).toHaveTextContent('JR 리듬체조');
    expect(screen.getByText('관리자')).toHaveClass('ui-brand__caption');
  });
});
