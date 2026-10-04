import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 상태 배지. tone:
 *   neutral(종이) · brand(옅은 별) · success(별 노랑 — 활동 중·완료) · warning(옅은 별 + 점선 — 확인 필요)
 *   danger(빨강 — 오류) · solid(잉크 — 확정) · muted(연필 점선 — 대기·비활성)
 * dot 을 주면 앞에 점이 붙는다.
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
