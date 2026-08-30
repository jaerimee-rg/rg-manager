import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 밑줄 탭. items: [{ id, label, count? }]
 * 좁은 화면에서는 가로 스크롤된다.
 */
export function Tabs({ items = [], value, onChange, className = '', ...rest }) {
  return (
    <div className={cx('ui-tabs', className)} role="tablist" {...rest}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className="ui-tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count != null && <span className="ui-text-muted"> ({item.count})</span>}
        </button>
      ))}
    </div>
  );
}

/** 뷰 전환용 세그먼트. 탭보다 가벼운 선택에 쓴다. */
export function Segmented({ items = [], value, onChange, className = '', ...rest }) {
  return (
    <div className={cx('ui-segmented', className)} role="group" {...rest}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ui-segmented__item"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
