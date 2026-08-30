import React, { useId, useState } from 'react';
import Icon from './Icon';

/**
 * 마우스/포커스로 뜨는 짧은 설명. 모바일에서는 탭으로 토글된다.
 */
export function Tooltip({ content, children, placement = 'top' }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const position =
    placement === 'bottom'
      ? { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span role="tooltip" id={id} className="ui-tooltip" style={{ position: 'absolute', ...position }}>
          {content}
        </span>
      )}
    </span>
  );
}

/** 표 머리글 옆에 붙는 ⓘ 아이콘. */
export function InfoHint({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="ui-info-icon"
        aria-label={typeof content === 'string' ? content : '설명'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="info" size={14} />
      </button>
    </Tooltip>
  );
}

export default Tooltip;
