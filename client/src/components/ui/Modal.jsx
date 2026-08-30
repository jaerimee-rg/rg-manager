import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 오버레이 하나로 모달과 바텀시트를 모두 처리한다.
 * 모바일에서는 아래에서 올라오는 시트, 768px 이상에서는 가운데 모달로 뜬다.
 * 페이지마다 fixed/overlay 를 직접 만들지 말고 이걸 쓴다.
 *
 * mode: sheet(기본, 모바일에서 시트) | modal(항상 가운데)
 * size: sm | md | lg
 */
export function Modal({
  open = true,
  onClose,
  title,
  description,
  footer,
  children,
  mode = 'sheet',
  size = 'md',
  closeOnScrim = true,
  labelledBy,
  className = '',
  ...rest
}) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      // 포커스를 오버레이 안에 가둔다.
      const items = panelRef.current.querySelectorAll(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // 뒤 배경 스크롤을 막는다.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 첫 포커스는 패널 자체에 준다(닫기 버튼으로 시작하면 읽는 순서가 어색하다).
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current instanceof HTMLElement) restoreFocusRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="ui-scrim" onClick={closeOnScrim ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cx('ui-overlay', className)}
        data-mode={mode}
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={!labelledBy && typeof title === 'string' ? title : undefined}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        {...rest}
      >
        <div className="ui-overlay__grip" aria-hidden="true" />
        {(title || onClose) && (
          <div className="ui-overlay__header">
            <div>
              {title && <h2 className="ui-overlay__title">{title}</h2>}
              {description && <p className="ui-overlay__description">{description}</p>}
            </div>
            {onClose && (
              <button type="button" className="ui-callout__dismiss" onClick={onClose} aria-label="닫기">
                <Icon name="x" size={20} />
              </button>
            )}
          </div>
        )}
        <div className="ui-overlay__body">{children}</div>
        {footer && <div className="ui-overlay__footer">{footer}</div>}
      </div>
    </>,
    document.body
  );
}

/** 예/아니오 확인. window.confirm 을 대신한다. */
export function ConfirmDialog({ open, title, message, confirmLabel = '확인', cancelLabel = '취소', tone = 'primary', onConfirm, onCancel, busy = false }) {
  // Button 을 import 하면 순환이 생기지 않지만, 확인 창은 버튼 두 개뿐이라 직접 그린다.
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      mode="modal"
      size="sm"
      footer={
        <>
          <button type="button" className="ui-btn" data-variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="ui-btn"
            data-variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <span className="ui-btn__spinner" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export default Modal;
