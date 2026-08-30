import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 상태 배지. tone: neutral | brand | success | warning | danger | solid
 * dot 을 주면 앞에 점이 붙는다(Deel 의 상태 표기 방식).
 */
export function Badge({ children, tone = 'neutral', size, dot = false, className = '', ...rest }) {
  return (
    <span className={cx('ui-badge', className)} data-tone={tone} data-size={size} {...rest}>
      {dot && <span className="ui-badge__dot" />}
      {children}
    </span>
  );
}

/** 지울 수 있는 라벨. 선택된 필터를 보여줄 때 쓴다. */
export function Tag({ children, onRemove, removeLabel = '지우기', className = '', ...rest }) {
  return (
    <span className={cx('ui-tag', className)} {...rest}>
      {children}
      {onRemove && (
        <button type="button" className="ui-tag__remove" onClick={onRemove} aria-label={removeLabel}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

export default Badge;
