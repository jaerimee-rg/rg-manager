import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { CheckRow } from './List';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const includesLabel = (option, query) => option.label.toLowerCase().includes(query.toLowerCase());

// 목록이 이보다 낮아지면 본문 스크롤에 맡긴다(아주 작은 화면)
const MIN_OPTIONS_HEIGHT = 160;

/** 가장 가까운 세로 스크롤 상자(시트·모달 본문). 페이지 자체가 스크롤이면 null. */
function scrollParent(el) {
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * 펼친 목록이 스크롤 상자 안에 다 보이게 한다 — 검색칸을 상자 맨 위(필요할 때만)에 두고,
 * 목록 높이는 그 아래 남는 자리만큼(최대 CSS 값)으로 줄인다. 검색칸이 위로 밀려 가리지 않는 게 먼저다.
 */
function fitPanel(root, field, panel, options) {
  const scroller = scrollParent(root);
  if (!scroller || !field || !panel || !options) return;
  const box = scroller.getBoundingClientRect();
  const fieldBox = field.getBoundingClientRect();
  const chrome = panel.getBoundingClientRect().height - options.getBoundingClientRect().height; // 테두리·완료 줄
  const gap = panel.getBoundingClientRect().top - fieldBox.bottom;
  const room = box.height - fieldBox.height - gap - chrome - 8;
  panel.style.setProperty('--ui-multiselect-room', `${Math.max(MIN_OPTIONS_HEIGHT, Math.floor(room))}px`);

  const rootBox = root.getBoundingClientRect();
  let delta = 0;
  if (rootBox.bottom > box.bottom) delta = rootBox.bottom - box.bottom;
  if (fieldBox.top - delta < box.top) delta = fieldBox.top - box.top;
  if (Math.abs(delta) >= 1) scroller.scrollBy?.({ top: delta, behavior: 'smooth' });
}

/**
 * 검색칸 + 드롭다운 체크 목록 — 여러 개를 골라야 할 때 쓴다(한 개만 고르면 Select).
 * 검색칸을 누르거나 입력하면 바로 아래에 목록이 펼쳐지고, 체크해도 닫히지 않는다.
 * 바깥을 누르거나 Esc · [완료] 로 닫는다. 고른 것을 보여 주는 자리는 화면이 따로 그린다.
 *
 * options: [{ value, label, description, trailing, disabled }]
 * value: 고른 value 배열 · onToggle(value): 하나 넣고 빼기
 * filter(option, query): 검색 규칙(기본은 label 포함). query 는 앞뒤 공백을 뺀 값이다.
 * summary: 목록 아래 줄에 보일 글자(예: "2명 선택")
 * Field 안에 두면 라벨이 검색칸의 이름이 된다(id · aria-describedby 를 그대로 받는다).
 */
export function MultiSelect({
  id,
  options,
  value = [],
  onToggle,
  filter = includesLabel,
  placeholder = '검색',
  emptyText = '검색 결과가 없어요',
  listLabel = '목록',
  summary,
  doneLabel = '완료',
  disabled = false,
  className = '',
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focusFirst, setFocusFirst] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const fieldRef = useRef(null);
  const optionsRef = useRef(null);
  // 닫으면서 검색칸으로 포커스를 돌려줄 때는 "포커스하면 펼침" 이 다시 열지 않게 한다
  const quietFocus = useRef(false);
  const panelId = `${id}-options`;

  const text = query.trim();
  const visible = text ? options.filter((option) => filter(option, text)) : options;

  // 바깥(시트의 다른 칸 포함)을 누르면 닫는다
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  // 시트·모달 본문은 스크롤 상자라 아래쪽에서 열면 목록이 버튼 줄에 가린다 — 열 때 맞춰 둔다
  useLayoutEffect(() => {
    if (open) fitPanel(rootRef.current, fieldRef.current, panelRef.current, optionsRef.current);
  }, [open]);

  const enabledBoxes = () => [...(panelRef.current?.querySelectorAll('input[type="checkbox"]:not(:disabled)') || [])];

  // ↓ 로 열었으면 펼쳐진 뒤 첫 칸으로 간다
  useEffect(() => {
    if (open && focusFirst) {
      enabledBoxes()[0]?.focus();
      setFocusFirst(false);
    }
  }, [open, focusFirst]);

  const focusInput = () => {
    quietFocus.current = true;
    inputRef.current?.focus();
    quietFocus.current = false;
  };

  const close = (focusTarget) => {
    setOpen(false);
    if (focusTarget === inputRef) focusInput();
    else focusTarget?.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && open) {
      // 목록만 닫는다 — 시트·모달까지 닫히지 않게
      event.stopPropagation();
      close(inputRef);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    if (event.target === inputRef.current) {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (open) enabledBoxes()[0]?.focus();
      else {
        setOpen(true);
        setFocusFirst(true);
      }
      return;
    }

    const boxes = enabledBoxes();
    const at = boxes.indexOf(event.target);
    if (at === -1) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') boxes[Math.min(at + 1, boxes.length - 1)].focus();
    else if (at === 0) inputRef.current?.focus();
    else boxes[at - 1].focus();
  };

  // Tab 으로 바깥 칸에 가면 닫는다. 누른 곳이 포커스를 안 받는 자리(relatedTarget 없음)면 바깥 누르기가 맡는다.
  const onBlur = (event) => {
    const next = event.relatedTarget;
    if (next && rootRef.current && !rootRef.current.contains(next)) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={cx('ui-multiselect', className)}
      data-open={open || undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <div ref={fieldRef} className="ui-search ui-multiselect__field">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          aria-controls={open ? panelId : undefined}
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          onFocus={() => {
            if (!quietFocus.current) setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {query && (
          <button
            type="button"
            className="ui-search__clear"
            aria-label="검색어 지우기"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="ui-multiselect__toggle"
          aria-label={open ? `${listLabel} 닫기` : `${listLabel} 열기`}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          disabled={disabled}
          onClick={() => setOpen((was) => !was)}
        >
          <Icon name="chevronDown" size={16} />
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="ui-multiselect__panel"
          role="group"
          aria-label={listLabel}
          // 체크해도 검색칸의 포커스(휴대폰이면 키보드)가 그대로 남아 이어서 검색할 수 있게
          onMouseDown={(event) => event.preventDefault()}
        >
          <div ref={optionsRef} className="ui-multiselect__options">
            {visible.length === 0 ? (
              <p className="ui-multiselect__empty">{emptyText}</p>
            ) : (
              visible.map((option) => (
                <CheckRow
                  key={option.value}
                  title={option.label}
                  subtitle={option.description}
                  trailing={option.trailing}
                  checked={value.includes(option.value)}
                  disabled={option.disabled}
                  onChange={() => onToggle?.(option.value)}
                />
              ))
            )}
          </div>
          <div className="ui-multiselect__foot">
            <span className="ui-multiselect__summary">{summary}</span>
            <button type="button" className="ui-btn" data-variant="primary" data-size="sm" onClick={() => close(toggleRef)}>
              {doneLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
