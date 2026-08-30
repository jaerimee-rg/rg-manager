import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const toneIcon = {
  neutral: 'info',
  brand: 'info',
  success: 'checkCircle',
  warning: 'alert',
  danger: 'alert'
};

/** 화면 안에 붙는 알림 줄. 폼 에러·안내 문구를 여기로 통일한다. */
export function Callout({ tone = 'neutral', icon, children, onDismiss, className = '', ...rest }) {
  return (
    <div className={cx('ui-callout', className)} data-tone={tone} role={tone === 'danger' ? 'alert' : undefined} {...rest}>
      <span className="ui-callout__icon">
        <Icon name={icon || toneIcon[tone]} size={18} />
      </span>
      <div className="ui-callout__body">{children}</div>
      {onDismiss && (
        <button type="button" className="ui-callout__dismiss" onClick={onDismiss} aria-label="닫기">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** 안내/유도용 큰 카드. */
export function PromoCard({ tone = 'brand', title, children, action, onDismiss, className = '', ...rest }) {
  return (
    <div className={cx('ui-promo', className)} data-tone={tone} {...rest}>
      {onDismiss && (
        <button type="button" className="ui-promo__dismiss" onClick={onDismiss} aria-label="닫기">
          <Icon name="x" size={16} />
        </button>
      )}
      {title && <h3 className="ui-promo__title">{title}</h3>}
      {children && <p className="ui-promo__body">{children}</p>}
      {action}
    </div>
  );
}

export default Callout;
