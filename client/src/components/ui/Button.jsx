import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 앱의 모든 버튼은 이걸 쓴다. 페이지에서 <button className="btn ..."> 를 다시 만들지 않는다.
 *
 * variant: primary(진한 잉크) | brand(브랜드 블루) | secondary(잉크 보더)
 *          | outline(연한 보더) | ghost | danger | danger-quiet
 * size:    sm | md | lg
 */
export function Button({
  children,
  variant = 'outline',
  size = 'md',
  icon,
  iconEnd,
  block = false,
  loading = false,
  disabled = false,
  as: As = 'button',
  className = '',
  type,
  ...rest
}) {
  const isButton = As === 'button';

  return (
    <As
      className={cx('ui-btn', className)}
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      type={isButton ? type || 'button' : undefined}
      disabled={isButton ? disabled || loading : undefined}
      aria-disabled={!isButton && (disabled || loading) ? 'true' : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-btn__spinner" /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
      {iconEnd && !loading ? <Icon name={iconEnd} size={size === 'sm' ? 16 : 18} /> : null}
    </As>
  );
}

/** 아이콘만 있는 원형 버튼. label 은 스크린리더용이라 필수다. */
export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'outline',
  badge,
  className = '',
  as: As = 'button',
  ...rest
}) {
  return (
    <As
      className={cx('ui-icon-btn', className)}
      data-size={size}
      data-variant={variant}
      type={As === 'button' ? 'button' : undefined}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
      {badge ? <span className="ui-icon-btn__badge">{badge}</span> : null}
    </As>
  );
}

/** 버튼 묶음. 모바일에서 세로로 쌓으려면 stackMobile 을 준다. */
export function ButtonGroup({ children, stackMobile = false, className = '', ...rest }) {
  return (
    <div className={cx('ui-button-group', className)} data-stack-mobile={stackMobile || undefined} {...rest}>
      {children}
    </div>
  );
}

export default Button;
