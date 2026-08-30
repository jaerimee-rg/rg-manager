import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 앱 골격. 모바일에서는 사이드바가 드로어로 열리고,
 * 768px 이상에서는 고정되며 콘텐츠가 남은 폭을 전부 쓴다.
 */
export function AppShell({ sidebar, sidebarOpen = false, onCloseSidebar, children, className = '', ...rest }) {
  return (
    <div className={cx('ui-shell', className)} {...rest}>
      {sidebar && (
        <>
          {sidebarOpen && <div className="ui-shell__scrim" onClick={onCloseSidebar} aria-hidden="true" />}
          <nav className="ui-shell__sidebar" data-open={sidebarOpen || undefined} aria-label="주요 메뉴">
            {sidebar}
          </nav>
        </>
      )}
      <div className="ui-shell__body">{children}</div>
    </div>
  );
}

export function Topbar({ children, className = '', ...rest }) {
  return (
    <header className={cx('ui-shell__topbar', className)} {...rest}>
      {children}
    </header>
  );
}

export function Main({ children, className = '', ...rest }) {
  return (
    <main className={cx('ui-shell__main', className)} {...rest}>
      {children}
    </main>
  );
}

export function NavItem({ icon, children, active = false, trailing, as: As = 'button', className = '', ...rest }) {
  return (
    <As
      className={cx('ui-nav-item', className)}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      type={As === 'button' ? 'button' : undefined}
      {...rest}
    >
      {icon && (
        <span className="ui-nav-item__icon">
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="ui-truncate">{children}</span>
      {trailing && <span className="ui-nav-item__trailing">{trailing}</span>}
    </As>
  );
}

export function NavSection({ children }) {
  return <div className="ui-nav-section">{children}</div>;
}

/** 상세 화면의 보조 내비. 넓은 화면에서는 왼쪽 열, 좁으면 가로 탭. */
export function SubNav({ children, className = '', ...rest }) {
  return (
    <nav className={cx('ui-subnav', className)} aria-label="하위 메뉴" {...rest}>
      {children}
    </nav>
  );
}

export function DetailLayout({ nav, children, className = '', ...rest }) {
  return (
    <div className={cx('ui-detail-layout', className)} {...rest}>
      {nav}
      <div className="ui-detail-layout__content">{children}</div>
    </div>
  );
}

/** 모바일에서 화면 아래 붙는 액션 바. 데스크탑에서는 오른쪽 정렬로 바뀐다. */
export function StickyActions({ children, className = '', ...rest }) {
  return (
    <div className={cx('ui-sticky-actions', className)} {...rest}>
      {children}
    </div>
  );
}

export default AppShell;
