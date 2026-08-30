import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 바깥 클릭 / Esc 로 닫히는 팝업 래퍼. Menu 와 Popover 가 함께 쓴다. */
function useDismissable(open, onClose) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return ref;
}

/**
 * 트리거 + 드롭다운 메뉴. trigger 는 (props) => ReactNode 로 받는다.
 * 모바일에서는 화면 아래 시트로 붙는다(작은 화면에서 잘리는 걸 막는다).
 */
export function Menu({ trigger, children, align = 'end', sheetOnMobile = true, label = '메뉴' }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismissable(open, close);
  const id = useId();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined
      })}
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="ui-menu"
          data-sheet-mobile={sheetOnMobile || undefined}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', [align === 'end' ? 'right' : 'left']: 0 }}
          onClick={close}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, tone, as: As = 'button', className = '', ...rest }) {
  return (
    <As className={cx('ui-menu__item', className)} data-tone={tone} role="menuitem" type={As === 'button' ? 'button' : undefined} {...rest}>
      {icon && (
        <span className="ui-menu__item-icon">
          <Icon name={icon} size={18} />
        </span>
      )}
      {children}
    </As>
  );
}

export function MenuSeparator() {
  return <hr className="ui-menu__separator" />;
}

export function MenuLabel({ children }) {
  return <div className="ui-menu__label">{children}</div>;
}

/**
 * 헤더 + 본문 + 액션 푸터를 갖는 팝오버. 필터 패널이 대표 사례다.
 */
export function Popover({ trigger, title, children, footer, size, align = 'start' }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismissable(open, close);
  const id = useId();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        close
      })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={typeof title === 'string' ? title : undefined}
          className="ui-popover"
          data-size={size}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', [align === 'end' ? 'right' : 'left']: 0 }}
        >
          {title && (
            <div className="ui-popover__header">
              <h3 className="ui-popover__title">{title}</h3>
              <button type="button" className="ui-callout__dismiss" onClick={close} aria-label="닫기">
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          <div className="ui-popover__body">{children}</div>
          {footer && <div className="ui-popover__footer">{typeof footer === 'function' ? footer({ close }) : footer}</div>}
        </div>
      )}
    </div>
  );
}

export function OptionRow({ children, className = '', ...rest }) {
  return (
    <button type="button" className={cx('ui-option-row', className)} {...rest}>
      {children}
    </button>
  );
}

export default Menu;
