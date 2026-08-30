import React from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** 페이지 가로 여백. 데스크탑에서는 전체 폭을 쓰고 여백만 넓어진다. */
export function Container({ children, width = 'full', className = '', ...rest }) {
  return (
    <div
      className={cx('ui-container', width === 'reading' && 'ui-container--reading', width === 'narrow' && 'ui-container--narrow', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 세로 스택. gap 은 space 토큰 번호(1~7). */
export function Stack({ children, gap = 4, as: As = 'div', className = '', ...rest }) {
  return (
    <As className={cx('ui-stack', className)} data-gap={String(gap)} {...rest}>
      {children}
    </As>
  );
}

/** 가로 줄. justify: between | end | center, align: start | baseline */
export function Row({ children, gap = 2, justify, align, wrap = false, as: As = 'div', className = '', ...rest }) {
  return (
    <As
      className={cx('ui-row', className)}
      data-gap={String(gap)}
      data-justify={justify}
      data-align={align}
      data-wrap={wrap || undefined}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * 반응형 그리드. cols 는 데스크탑 기준이고 태블릿에서 2열, 모바일에서 1열이 된다.
 * auto 를 주면 260px 최소 폭으로 자동 채운다.
 */
export function Grid({ children, cols = 2, auto = false, className = '', ...rest }) {
  return (
    <div className={cx('ui-grid', className)} data-cols={String(cols)} data-auto={auto || undefined} {...rest}>
      {children}
    </div>
  );
}

export function Divider({ spacing, label, className = '', ...rest }) {
  if (label) {
    return (
      <div className={cx('ui-divider', className)} data-label={label} data-spacing={spacing} {...rest}>
        {label}
      </div>
    );
  }
  return <hr className={cx('ui-divider', className)} data-spacing={spacing} {...rest} />;
}

/** 카드 안팎에서 쓰는 소제목 블록. */
export function Section({ title, description, actions, children, className = '', ...rest }) {
  return (
    <section className={cx('ui-section', className)} {...rest}>
      {(title || description || actions) && (
        <div className="ui-section__head">
          <div>
            {title && <h2 className="ui-section__title">{title}</h2>}
            {description && <p className="ui-section__description">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
