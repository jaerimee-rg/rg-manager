import React from 'react';
import { SERVICE_NAME, LOGO_SRC } from '../../utils/brand';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 로고 아래에 서비스 이름이 붙는 브랜드 블록. 헤더·로그인·관리자 사이드바가 쓴다.
 *
 * @param {'sm'|'md'|'lg'} [size]  sm 사이드바, md 상단 헤더, lg 로그인 화면
 * @param {string} [caption]       이름 아래 한 줄 더 (예: "관리자")
 * @param {string|React.ElementType} [as]  바깥 요소. 페이지의 유일한 제목이면 'h1'
 */
export default function Brand({ size = 'md', caption, as: As = 'div', className = '', ...rest }) {
  return (
    <As className={cx('ui-brand', className)} data-size={size} {...rest}>
      <img className="ui-brand__logo" src={LOGO_SRC} alt="" draggable={false} />
      <span className="ui-brand__name">{SERVICE_NAME}</span>
      {caption && <span className="ui-brand__caption">{caption}</span>}
    </As>
  );
}
