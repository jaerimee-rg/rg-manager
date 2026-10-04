import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 숫자 요약 타일. 대시보드에서 반복되던 카드 모양을 여기로 모았다. 숫자는 제목 서체다.
 * variant: star(지금 봐야 할 숫자 — 별 노랑 채움) · ink(합계 — 잉크 채움) · alert(바로 처리할 것 — 빨간 선)
 * tone 은 오른쪽 아이콘 타일의 색이다.
 */
export function Stat({ label, value, hint, icon, tone, variant, onClick, className = '', ...rest }) {
  const As = onClick ? 'button' : 'div';
  return (
    <As
      className={cx('ui-stat', className)}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      data-variant={variant}
      data-clickable={onClick ? 'true' : undefined}
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
