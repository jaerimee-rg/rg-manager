import React from 'react';
import { LOGO_SRC } from '../../utils/brand';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const HOP_SIZE = { sm: 30, md: 56, lg: 84 };

/** 로고가 위아래로 통통 튄다 (착지할 때 납작해지고 바닥 그림자가 커진다). 글자 없이 로고만 쓸 때. */
export function LogoHop({ size = 56, className = '' }) {
  return (
    <span className={cx('ui-logo-hop', className)} style={{ '--hop-size': `${size}px` }} aria-hidden="true">
      <img src={LOGO_SRC} alt="" draggable={false} />
    </span>
  );
}

/**
 * 로딩 표시는 전부 이것을 쓴다: 튀는 로고 + 안내 글자. 버튼 안의 작은 원(.ui-btn__spinner)만 예외.
 *
 * @param {string}  [label]      안내 글자
 * @param {'sm'|'md'|'lg'} [size] 로고 크기. 비우면 fullscreen→lg, inline→sm, 그 외 md
 * @param {boolean} [fullscreen] 앱 골격이 뜨기 전(로그인 확인 등): 화면 한가운데 크게
 * @param {boolean} [inline]     글줄 안에서 로고 왼쪽·글자 오른쪽으로 작게
 */
export default function Spinner({ label = '불러오는 중...', size, fullscreen = false, inline = false, className = '', ...rest }) {
  const px = HOP_SIZE[size || (fullscreen ? 'lg' : inline ? 'sm' : 'md')];
  return (
    <div
      className={cx('ui-loader', className)}
      data-fullscreen={fullscreen || undefined}
      data-inline={inline || undefined}
      role="status"
      {...rest}
    >
      <LogoHop size={px} />
      <span className="ui-loader__label">{label}</span>
    </div>
  );
}
