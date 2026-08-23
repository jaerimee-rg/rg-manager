import React from 'react';
import { render, screen } from '@testing-library/react';
import RichText from '../RichText';

const BASE = 'https://vrzsommyxtvdqlpoufes.supabase.co/storage/v1/object/public/faq-files';
const PDF = `${BASE}/3/uuid/%EC%88%98%EC%97%85%EC%95%88%EB%82%B4.pdf`;
const HTML = `${BASE}/3/uuid/notice.html`;

describe('RichText', () => {
  it('파일 링크를 주소 대신 파일 이름으로 보여준다', () => {
    render(<RichText text={`안내문은 [수업안내.pdf](${PDF}) 입니다`} />);

    const link = screen.getByRole('link', { name: /수업안내\.pdf/ });
    expect(link).toHaveAttribute('href', PDF);
    expect(link).not.toHaveTextContent('supabase.co');
  });

  it('주소만 붙여넣어도 파일 이름으로 보여준다', () => {
    render(<RichText text={`안내문: ${PDF}`} />);

    expect(screen.getByRole('link', { name: /수업안내\.pdf/ })).toBeInTheDocument();
  });

  it('링크는 새 탭에서 열리고 opener 를 넘기지 않는다', () => {
    render(<RichText text={`[수업안내.pdf](${PDF})`} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('링크가 아닌 글자는 그대로 남긴다', () => {
    const { container } = render(<RichText text={`수업 안내\n\n- 월요일`} />);

    expect(container.textContent).toBe('수업 안내\n\n- 월요일');
  });

  describe('채팅에서 HTML 바로 보여주기 (embedHtml)', () => {
    it('HTML 파일은 채팅 안에서 펼쳐 보여준다', () => {
      render(<RichText text={`[공지.html](${HTML})`} embedHtml />);

      const frame = screen.getByTitle('공지.html');
      expect(frame.tagName).toBe('IFRAME');
      expect(frame).toHaveAttribute('src', HTML);
    });

    it('펼친 HTML 은 앱 로그인 정보에 손대지 못하게 격리한다', () => {
      render(<RichText text={`[공지.html](${HTML})`} embedHtml />);

      const sandbox = screen.getByTitle('공지.html').getAttribute('sandbox');

      // allow-same-origin 이 있으면 iframe 이 스스로 sandbox 를 풀 수 있다.
      expect(sandbox).not.toContain('allow-same-origin');
      expect(sandbox).toContain('allow-scripts');
    });

    it('펼친 HTML 도 새 탭에서 열 수 있다', () => {
      render(<RichText text={`[공지.html](${HTML})`} embedHtml />);

      expect(screen.getByRole('link', { name: '새 탭에서 열기' })).toHaveAttribute('href', HTML);
    });

    it('PDF 는 펼치지 않고 파일 이름 링크로만 보여준다', () => {
      render(<RichText text={`[수업안내.pdf](${PDF})`} embedHtml />);

      expect(screen.queryByTitle('수업안내.pdf')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /수업안내\.pdf/ })).toBeInTheDocument();
    });

    it('embedHtml 을 끄면 HTML 도 링크로만 보여준다 (목록 화면용)', () => {
      render(<RichText text={`[공지.html](${HTML})`} />);

      expect(screen.queryByTitle('공지.html')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /공지\.html/ })).toBeInTheDocument();
    });
  });

  it('javascript: 주소는 링크로 만들지 않는다', () => {
    // eslint-disable-next-line no-script-url
    render(<RichText text="[누르세요](javascript:alert(1))" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
