import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 필터 줄. 모바일에서는 가로로 스크롤된다. */
export function Toolbar({ children, scrollOnMobile = true, className = '', ...rest }) {
  return (
    <div className={cx('ui-toolbar', className)} data-scroll-mobile={scrollOnMobile || undefined} role="toolbar" {...rest}>
      {children}
    </div>
  );
}

/** 필터 칩. 선택되면 잉크로 채워진다. count 를 주면 뒤에 숫자가 붙는다. */
export function Chip({ children, selected = false, count, dropdown = false, className = '', ...rest }) {
  return (
    <button type="button" className={cx('ui-chip', className)} aria-pressed={selected} {...rest}>
      {children}
      {count != null && <span className="ui-chip__count">{count}</span>}
      {dropdown && <Icon name="chevronDown" size={14} />}
    </button>
  );
}

export default Toolbar;
