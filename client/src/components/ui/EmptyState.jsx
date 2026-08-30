import React from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 목록이 비었을 때. 아이콘·제목·설명·액션 구조를 페이지마다 다시 만들지 않는다.
 */
export function EmptyState({ icon = 'inbox', title, description, action, className = '', ...rest }) {
  return (
    <div className={cx('ui-empty', className)} {...rest}>
      {icon && (
        <span className="ui-empty__icon">
          <Icon name={icon} size={24} />
        </span>
      )}
      {title && <p className="ui-empty__title">{title}</p>}
      {description && <p className="ui-empty__description">{description}</p>}
      {action && <div className="ui-empty__actions">{action}</div>}
    </div>
  );
}

export default EmptyState;
