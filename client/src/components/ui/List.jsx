import React, { useId } from 'react';
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

/**
 * 체크박스가 달린 목록 한 줄 — 줄 어디를 눌러도 체크가 바뀐다. 여러 개를 고르는 목록에 쓴다.
 * 체크박스의 이름은 title 이고, subtitle·trailing 은 설명으로 읽힌다.
 */
export function CheckRow({ title, subtitle, trailing, checked = false, onChange, disabled = false, className = '', ...rest }) {
  const id = useId();
  const describedBy = [subtitle && `${id}-sub`, trailing && `${id}-trail`].filter(Boolean).join(' ') || undefined;
  return (
    <label
      className={cx('ui-list-row', 'ui-check-row', className)}
      data-clickable={disabled ? undefined : 'true'}
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={describedBy}
        {...rest}
      />
      <span className="ui-list-row__body">
        <span className="ui-list-row__title" id={`${id}-title`}>{title}</span>
        {subtitle && <span className="ui-list-row__subtitle" id={`${id}-sub`}>{subtitle}</span>}
      </span>
      {trailing && <span className="ui-list-row__trailing" id={`${id}-trail`}>{trailing}</span>}
    </label>
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
