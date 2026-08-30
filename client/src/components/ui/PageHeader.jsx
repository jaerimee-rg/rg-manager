import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 모든 페이지의 제목 줄. 좁은 화면에서는 액션이 제목 아래로 내려가 폭을 채운다.
 */
export function PageHeader({ title, description, actions, onBack, backLabel = '뒤로', children, className = '', ...rest }) {
  return (
    <header className={cx('ui-page-header', className)} {...rest}>
      {onBack && (
        <button type="button" className="ui-page-header__back" onClick={onBack}>
          <Icon name="arrowLeft" size={16} />
          {backLabel}
        </button>
      )}
      <div className="ui-page-header__top">
        <div>
          <h1 className="ui-page-header__title">{title}</h1>
          {description && <p className="ui-page-header__description">{description}</p>}
        </div>
        {actions && <div className="ui-page-header__actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function Breadcrumb({ items = [], className = '', ...rest }) {
  return (
    <nav className={cx('ui-breadcrumb', className)} aria-label="위치" {...rest}>
      {items.map((item, i) => (
        <React.Fragment key={item.href || item.label}>
          {i > 0 && <span className="ui-breadcrumb__sep" aria-hidden="true">/</span>}
          {item.href && i < items.length - 1 ? (
            <a href={item.href}>{item.label}</a>
          ) : (
            <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export default PageHeader;
