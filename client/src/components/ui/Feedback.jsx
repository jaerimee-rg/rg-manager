import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 로딩 자리 표시. width/height 는 CSS 값을 그대로 받는다. */
export function Skeleton({ width = '100%', height = 16, radius, className = '', style, ...rest }) {
  return (
    <span
      className={cx('ui-skeleton', className)}
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

/** 목록이 로딩 중일 때 쓰는 행 묶음. */
export function SkeletonList({ rows = 3, className = '' }) {
  return (
    <div className={cx('ui-stack', className)} data-gap="3" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <div className="ui-card" data-padding="sm" key={i}>
          <Skeleton width="40%" height={14} />
          <div style={{ height: 8 }} />
          <Skeleton width="70%" height={12} />
        </div>
      ))}
    </div>
  );
}

export function Progress({ value = 0, max = 100, tone, label, className = '', ...rest }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx('ui-progress', className)}
      data-tone={tone}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      {...rest}
    >
      <div className="ui-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 페이지 넘김. */
export function Pagination({ page, pageCount, onChange, info, className = '', ...rest }) {
  if (pageCount <= 1 && !info) return null;

  // 앞뒤 두 칸씩만 보여 주고 나머지는 접는다.
  const pages = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  return (
    <nav className={cx('ui-pagination', className)} aria-label="페이지" {...rest}>
      {info && <span className="ui-pagination__info">{info}</span>}
      <div className="ui-pagination__pages">
        <button type="button" className="ui-pagination__page" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="이전 페이지">
          ‹
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="ui-pagination__page" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className="ui-pagination__page"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button type="button" className="ui-pagination__page" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="다음 페이지">
          ›
        </button>
      </div>
    </nav>
  );
}
