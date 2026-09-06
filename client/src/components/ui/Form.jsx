import React, { useId } from 'react';
import Icon from './Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * 라벨 + 힌트 + 에러를 묶는 폼 래퍼.
 * children 이 함수면 {id, describedBy, invalid} 를 넘겨 준다.
 */
export function Field({
  label,
  hint,
  error,
  counter,
  required = false,
  htmlFor,
  children,
  className = '',
  ...rest
}) {
  const autoId = useId();
  const id = htmlFor || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  // counter={{ value, max }} — 글자 수 표시. 넘으면 over 가 붙는다.
  const over = counter ? counter.value > counter.max : false;

  return (
    <div className={cx('ui-field', className)} {...rest}>
      {label && (
        <label className="ui-field__label" htmlFor={id}>
          {label}
          {required && <span className="ui-field__required" aria-hidden="true">*</span>}
        </label>
      )}
      {typeof children === 'function'
        ? children({ id, 'aria-describedby': describedBy, 'aria-invalid': error || over ? 'true' : undefined })
        : children}
      {(hint || error || counter) && (
        <div className="ui-field__foot">
          <span>
            {error ? (
              <span className="ui-field__error" id={errorId} role="alert">{error}</span>
            ) : hint ? (
              <span className="ui-field__hint" id={hintId}>{hint}</span>
            ) : null}
          </span>
          {counter && (
            <span className={cx('ui-field__counter', over && 'over')}>
              {counter.value} / {counter.max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function Input({ invalid, className = '', ...rest }) {
  return <input className={cx('ui-input', className)} aria-invalid={invalid ? 'true' : undefined} {...rest} />;
}

/**
 * 값을 다시 비울 수 있는 입력칸 — 값이 있을 때만 지우기(×) 버튼이 뜬다.
 *
 * 날짜·시간 칸 때문에 만들었다. 모바일 피커에는 "비우기" 가 없어서 한 번 고른
 * 값을 되돌릴 수 없다 — 시간을 지워 "종일" 로, 마감을 지워 "마감 없음" 으로
 * 되돌리는 길이 아예 막힌다.
 *
 * clearLabel 은 어느 칸을 지우는지 읽어 주는 이름이다 (예: "종료일 지우기").
 */
export function ClearableInput({ value, onClear, clearLabel = '지우기', disabled = false, className = '', ...rest }) {
  return (
    <div className={cx('ui-clearable', className)}>
      <Input value={value} disabled={disabled} {...rest} />
      {value && !disabled && (
        <button
          type="button"
          className="ui-clearable__clear"
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function Textarea({ invalid, className = '', ...rest }) {
  return <textarea className={cx('ui-textarea', className)} aria-invalid={invalid ? 'true' : undefined} {...rest} />;
}

export function Select({ invalid, children, className = '', ...rest }) {
  return (
    <select className={cx('ui-select', className)} aria-invalid={invalid ? 'true' : undefined} {...rest}>
      {children}
    </select>
  );
}

/** 인풋 뒤에 단위/접미사를 붙인다. 예: 시간 "분", 금액 "원" */
export function InputGroup({ children, addon, className = '', ...rest }) {
  return (
    <div className={cx('ui-input-group', className)} {...rest}>
      {children}
      {addon && <span className="ui-input-group__addon">{addon}</span>}
    </div>
  );
}

export function Checkbox({ label, disabled = false, className = '', ...rest }) {
  return (
    <label className={cx('ui-check', className)} data-disabled={disabled || undefined}>
      <input type="checkbox" disabled={disabled} {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Radio({ label, disabled = false, className = '', ...rest }) {
  return (
    <label className={cx('ui-check', className)} data-disabled={disabled || undefined}>
      <input type="radio" disabled={disabled} {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** 라디오/체크 대신 쓰는 선택 카드. 터치 타깃이 48px 이라 모바일에서 편하다. */
export function Choice({ children, selected = false, onClick, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={cx('ui-choice', className)}
      aria-pressed={selected}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Switch({ label, checked, onChange, disabled = false, className = '', ...rest }) {
  return (
    <label className={cx('ui-switch', className)}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      <span className="ui-switch__track">
        <span className="ui-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * 스위치 + 설명 한 줄. 설정 화면에서 계속 나오는 모양이라 컴포넌트로 둔다.
 * description 은 켜짐/꺼짐에 따라 다른 문구를 넘기면 된다.
 */
export function SwitchField({ label, description, checked, onChange, disabled = false, className = '', ...rest }) {
  return (
    <div className={cx('ui-switch-field', className)}>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} {...rest} />
      {description && <p className="ui-switch-field__description">{description}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, onClear, placeholder = '검색', shortcut, className = '', ...rest }) {
  return (
    <div className={cx('ui-search', className)}>
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={onChange} placeholder={placeholder} {...rest} />
      {value && onClear && (
        <button type="button" className="ui-search__clear" onClick={onClear} aria-label="검색어 지우기">
          <Icon name="x" size={14} />
        </button>
      )}
      {shortcut && !value && <span className="ui-search__shortcut">{shortcut}</span>}
    </div>
  );
}
