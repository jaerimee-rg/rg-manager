import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 평면 + 1px 보더 카드. 그림자는 쓰지 않는다(뜬 것만 그림자를 갖는다).
 * onClick 을 주면 button 으로 렌더되고 hover/focus 상태가 붙는다.
 */
export function Card({ children, padding = 'md', onClick, as, className = '', ...rest }) {
  const interactive = Boolean(onClick);
  const As = as || (interactive ? 'button' : 'div');

  return (
    <As
      className={cx('ui-card', className)}
      data-padding={padding}
      data-interactive={interactive || undefined}
      onClick={onClick}
      type={As === 'button' ? 'button' : undefined}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({ title, description, actions, children, className = '', ...rest }) {
  return (
    <div className={cx('ui-card__header', className)} {...rest}>
      <div>
        {title && <h3 className="ui-card__title">{title}</h3>}
        {description && <p className="ui-card__description">{description}</p>}
        {children}
      </div>
      {actions}
    </div>
  );
}

export function CardFooter({ children, stackMobile = true, className = '', ...rest }) {
  return (
    <div className={cx('ui-card__footer', className)} data-stack-mobile={stackMobile || undefined} {...rest}>
      {children}
    </div>
  );
}

export default Card;
