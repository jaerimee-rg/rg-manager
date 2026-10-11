import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from './Button';
import {
  WEEKDAYS, addDays, addMonths, clampIso, compareMonth, isWithin, monthOf, monthWeeks, parseIso, shiftMonth, todayIso
} from '../../utils/calendar';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const KEY_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * 한 달 달력에서 날짜 하나를 고른다. 날짜는 'YYYY-MM-DD' 문자열로 주고받는다.
 * 입력칸 위에 뜨는 팝업이 아니라 그 자리에 펼쳐지는 달력이다 — 바텀시트 안에서도 그대로 쓴다.
 *
 * min · max 밖의 날짜는 누를 수 없고, 그 밖의 달로는 넘어가지 않는다.
 * unavailable: 범위 안이지만 고를 수 없는 날('YYYY-MM-DD' 배열) — 줄을 그어 보이고, 눌러도 고르지 않는다.
 *   키보드로는 지나갈 수 있고(aria-disabled), 화면 읽기에는 unavailableLabel 이 붙는다.
 * 키보드: 고른 날(없으면 오늘)에만 Tab 이 멈추고, ←→↑↓ 로 하루·한 주씩 옮긴다(달이 바뀌면 따라 넘어간다).
 * yearNav: 달 버튼 바깥에 한 해씩 넘기는 버튼(« »)도 둔다 — 몇 해 전 날짜를 고를 때 열두 번씩 누르지 않게.
 *   범위 끝을 넘으면 그 끝 달에 멈춘다. 고를 수 있는 날이 몇 달뿐인 달력(예약)에는 켜지 않는다.
 */
export function Calendar({
  value, onChange, min, max, unavailable, unavailableLabel = '선택 불가', label = '날짜 선택', yearNav = false, invalid,
  className = '', ...rest
}) {
  const anchor = clampIso(value || todayIso(), min, max);
  const [view, setView] = useState(() => monthOf(anchor));
  const [focusIso, setFocusIso] = useState(anchor);
  const gridRef = useRef(null);
  const moved = useRef(false); // 키보드로 옮겼을 때만 포커스를 따라 옮긴다(처음 그릴 때 빼앗지 않게)
  const blockedDays = useMemo(() => new Set(unavailable || []), [unavailable]);

  // 밖에서 값이 바뀌면(초기화 등) 그 달을 보여 준다
  useEffect(() => {
    if (!value) return;
    setView(monthOf(value));
    setFocusIso(value);
  }, [value]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    gridRef.current?.querySelector(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, view]);

  const canPrev = !min || compareMonth(addMonths(view, -1), monthOf(min)) >= 0;
  const canNext = !max || compareMonth(addMonths(view, 1), monthOf(max)) <= 0;

  const go = (n) => {
    const next = shiftMonth(view, n, min, max);
    setView(next);
    // 넘긴 달 안에 Tab 이 멈출 날이 있게 — 그 달 1일(범위 안으로)
    setFocusIso(clampIso(`${next.year}-${String(next.month + 1).padStart(2, '0')}-01`, min, max));
  };

  const onKeyDown = (event) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = addDays(focusIso, step);
    if (!isWithin(next, min, max)) return;
    moved.current = true;
    setFocusIso(next);
    if (compareMonth(monthOf(next), view) !== 0) setView(monthOf(next));
  };

  const today = todayIso();
  const title = `${view.year}년 ${view.month + 1}월`;
  // Tab 이 멈출 날: 보이는 달 안의 focusIso, 아니면 그 달에서 고를 수 있는 첫날
  const weeks = monthWeeks(view);
  const days = weeks.flat().filter(Boolean);
  const tabStop = days.includes(focusIso) ? focusIso : days.find((iso) => isWithin(iso, min, max));

  return (
    <div className={cx('ui-calendar', className)} data-invalid={invalid || undefined} {...rest}>
      <div className="ui-calendar__head">
        <span className="ui-calendar__nav">
          {yearNav && (
            <IconButton icon="chevronsLeft" label="이전 해" size="sm" variant="plain" onClick={() => go(-12)} disabled={!canPrev} />
          )}
          <IconButton icon="chevronLeft" label="이전 달" size="sm" variant="plain" onClick={() => go(-1)} disabled={!canPrev} />
        </span>
        <span className="ui-calendar__title" aria-live="polite">{title}</span>
        <span className="ui-calendar__nav">
          <IconButton icon="chevronRight" label="다음 달" size="sm" variant="plain" onClick={() => go(1)} disabled={!canNext} />
          {yearNav && (
            <IconButton icon="chevronsRight" label="다음 해" size="sm" variant="plain" onClick={() => go(12)} disabled={!canNext} />
          )}
        </span>
      </div>
      <div className="ui-calendar__grid" role="grid" aria-label={`${label} — ${title}`} ref={gridRef} onKeyDown={onKeyDown}>
        <div className="ui-calendar__row" role="row">
          {WEEKDAYS.map((name, i) => (
            <span key={name} className="ui-calendar__weekday" role="columnheader" data-weekday={i} aria-label={`${name}요일`}>
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div className="ui-calendar__row" role="row" key={w}>
            {week.map((iso, i) => {
              if (!iso) return <span key={i} className="ui-calendar__cell" role="gridcell" />;
              const { month, day } = parseIso(iso);
              const selected = iso === value;
              const enabled = isWithin(iso, min, max);
              const blocked = enabled && blockedDays.has(iso);
              return (
                <span key={iso} className="ui-calendar__cell" role="gridcell" aria-selected={selected}>
                  <button
                    type="button"
                    className="ui-calendar__day"
                    data-iso={iso}
                    data-weekday={i}
                    data-today={iso === today || undefined}
                    data-unavailable={blocked || undefined}
                    aria-pressed={selected}
                    aria-label={`${month + 1}월 ${day}일 ${WEEKDAYS[i]}요일${iso === today ? ', 오늘' : ''}${blocked ? `, ${unavailableLabel}` : ''}`}
                    aria-current={iso === today ? 'date' : undefined}
                    aria-disabled={blocked || undefined}
                    tabIndex={iso === tabStop ? 0 : -1}
                    disabled={!enabled}
                    onClick={() => {
                      setFocusIso(iso);
                      if (!blocked) onChange?.(iso);
                    }}
                  >
                    {day}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Calendar;
