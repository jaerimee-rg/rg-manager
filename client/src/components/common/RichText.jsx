import React from 'react';
import { parseRichText } from '../../utils/richText';

const KIND_ICON = {
  html: '📄',
  pdf: '📕',
  image: '🖼️',
  file: '📎'
};

/**
 * 업로드한 HTML 은 채팅 안에서 바로 펼쳐 보여준다.
 *
 * sandbox 에 allow-same-origin 을 주지 않는다. 그래야 iframe 안의 문서가
 * 고유한(빈) 출처를 갖게 되어, 스크립트가 돌더라도 이 앱의 로그인 정보에
 * 손대지 못한다. allow-scripts 와 allow-same-origin 을 함께 주면
 * 문서가 스스로 sandbox 를 풀 수 있으므로 절대 같이 쓰지 않는다.
 */
function HtmlPreview({ label, url }) {
  return (
    <span className="rt-embed">
      <span className="rt-embed-head">
        <span className="rt-embed-name">
          <span aria-hidden="true">📄</span> {label}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="rt-embed-open">
          새 탭에서 열기
        </a>
      </span>
      <iframe
        src={url}
        title={label}
        className="rt-embed-frame"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}

function FileLink({ label, url, kind }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={kind ? 'rt-file' : 'rt-link'}
    >
      {kind && <span aria-hidden="true">{KIND_ICON[kind] || KIND_ICON.file} </span>}
      {label}
    </a>
  );
}

/**
 * FAQ 답변·채팅 메시지를 보여준다.
 * 저장된 글자는 그대로 두고, 링크만 눌러서 열 수 있게 바꾼다.
 *
 * embedHtml 을 켜면 HTML 파일을 그 자리에서 펼쳐 보여준다 (채팅 전용).
 * 목록·미리보기 화면에서는 꺼서 파일 이름 링크로만 보여준다.
 */
function RichText({ text, embedHtml = false, className = '' }) {
  const segments = parseRichText(text);

  if (segments.length === 0) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <React.Fragment key={i}>{seg.value}</React.Fragment>;

        if (embedHtml && seg.kind === 'html') {
          return <HtmlPreview key={i} label={seg.label} url={seg.url} />;
        }

        return <FileLink key={i} label={seg.label} url={seg.url} kind={seg.kind} />;
      })}
    </span>
  );
}

export default RichText;
