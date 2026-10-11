import React, { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';
import Calendar from './Calendar';
import { formatIsoDate } from '../../utils/calendar';

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
        <label className="ui-field__label" htmlFor={id} id={`${id}-label`}>
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

/**
 * 날짜 하나를 고르는 칸 — 누르면 바로 아래에 앱의 달력(Calendar)이 펼쳐지고, 날을 누르면 닫힌다.
 * 달력에는 한 해씩 넘기는 버튼(« »)도 있다 — 지난해 사진 폴더 날짜를 열두 번 넘기지 않고 고르게.
 *
 * <input type="date"> 대신 쓴다. iPad Safari 의 기본 피커는 연·월 바퀴만 보이는 상태로 떠
 * 날을 고를 수 없는 일이 있었다(2026-10). 브라우저 피커에 기대지 않으니 어디서나 같은 달력이다.
 * Field 안에 두면 라벨 + 지금 값이 이 칸의 이름이 된다(예: "날짜 2026년 10월 10일 (토)").
 * value · onChange 는 'YYYY-MM-DD' 문자열. Esc 는 달력만 닫는다(모달까지 닫지 않는다).
 */
export function DateField({
  id: idProp, value, onChange, min, max, placeholder = '날짜 선택', disabled = false, invalid, className = '',
  'aria-describedby': describedBy, 'aria-invalid': ariaInvalid
}) {
  const autoId = useId();
  const id = idProp || autoId;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // 시트·모달 아래쪽에서 열면 달력이 버튼 줄에 가려 안 보인다 — 펼친 달력까지 보이게 스크롤한다
  useEffect(() => {
    if (open) rootRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (!open || event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  };

  return (
    <div ref={rootRef} className={cx('ui-date-field', className)} data-open={open || undefined} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className="ui-input ui-date-field__button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={describedBy}
        aria-invalid={invalid || ariaInvalid === 'true' ? 'true' : undefined}
        aria-expanded={open}
        aria-controls={open ? `${id}-calendar` : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="calendar" size={16} />
        <span className="ui-date-field__value" id={`${id}-value`} data-empty={value ? undefined : 'true'}>
          {value ? formatIsoDate(value, { withYear: true }) : placeholder}
        </span>
        <Icon name="chevronDown" size={16} className="ui-date-field__chevron" />
      </button>
      {open && (
        <Calendar
          id={`${id}-calendar`}
          className="ui-date-field__calendar"
          yearNav
          value={value}
          min={min}
          max={max}
          onChange={(iso) => {
            onChange?.(iso);
            close();
          }}
        />
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
