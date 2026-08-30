import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const initialsOf = (name = '') => {
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  // 한글 이름은 성을 뺀 이름 두 글자가 더 알아보기 쉽다.
  if (/^[가-힣]+$/.test(trimmed)) return trimmed.length > 2 ? trimmed.slice(1, 3) : trimmed;
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

export function Avatar({ name, src, size, className = '', ...rest }) {
  return (
    <span className={cx('ui-avatar', className)} data-size={size} title={name || undefined} {...rest}>
      {src ? <img src={src} alt={name ? `${name} 프로필` : ''} /> : initialsOf(name)}
    </span>
  );
}

/** 여러 명을 겹쳐 보여주고 넘치면 +N 으로 접는다. */
export function AvatarGroup({ people = [], max = 4, size = 'sm', className = '', ...rest }) {
  const shown = people.slice(0, max);
  const rest_ = people.length - shown.length;

  return (
    <span className={cx('ui-avatar-group', className)} {...rest}>
      {shown.map((person, i) => (
        <Avatar key={person.id ?? i} name={person.name} src={person.src} size={size} />
      ))}
      {rest_ > 0 && (
        <span className="ui-avatar ui-avatar-group__more" data-size={size}>
          +{rest_}
        </span>
      )}
    </span>
  );
}

export default Avatar;
