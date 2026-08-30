import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 숫자 요약 타일. 대시보드에서 반복되던 카드 모양을 여기로 모았다. */
export function Stat({ label, value, hint, icon, tone, onClick, className = '', ...rest }) {
  const As = onClick ? 'button' : 'div';
  return (
    <As
      className={cx('ui-stat', className)}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      style={onClick ? { cursor: 'pointer', textAlign: 'left', font: 'inherit' } : undefined}
      {...rest}
    >
      <div className="ui-row" data-gap="2" data-justify="between">
        <span className="ui-stat__label">{label}</span>
        {icon && (
          <span className="ui-icon-tile" data-tone={tone}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <span className="ui-stat__value">{value}</span>
      {hint && <span className="ui-stat__hint">{hint}</span>}
    </As>
  );
}

export function IconTile({ icon, tone, size, className = '', ...rest }) {
  return (
    <span className={cx('ui-icon-tile', className)} data-tone={tone} data-size={size} {...rest}>
      <Icon name={icon} size={size === 'lg' ? 20 : 16} />
    </span>
  );
}

export default Stat;
