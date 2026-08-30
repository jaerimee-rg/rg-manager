import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 표까지는 필요 없는 목록. 카드 하나 안에 행을 쌓는다. */
export function List({ children, className = '', ...rest }) {
  return (
    <div className={cx('ui-list', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * 목록의 한 줄. leading(아바타·아이콘) / 제목 / 부제 / trailing(배지·화살표) 구조.
 */
export function ListRow({ leading, title, subtitle, trailing, onClick, chevron, children, className = '', ...rest }) {
  const As = onClick ? 'button' : 'div';
  return (
    <As
      className={cx('ui-list-row', className)}
      data-clickable={onClick ? 'true' : undefined}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...rest}
    >
      {leading}
      <div className="ui-list-row__body">
        {title && <div className="ui-list-row__title">{title}</div>}
        {subtitle && <div className="ui-list-row__subtitle">{subtitle}</div>}
        {children}
      </div>
      {(trailing || chevron) && (
        <div className="ui-list-row__trailing">
          {trailing}
          {chevron && <Icon name="chevronRight" size={18} />}
        </div>
      )}
    </As>
  );
}

/** 상세 화면의 라벨/값 목록. */
export function DescriptionList({ items = [], columns = 1, className = '', ...rest }) {
  return (
    <dl className={cx('ui-dl', className)} data-columns={String(columns)} {...rest}>
      {items.map((item) => (
        <div className="ui-dl__row" key={item.label}>
          <dt className="ui-dl__label">{item.label}</dt>
          <dd className="ui-dl__value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default List;
