import React from 'react';

/**
 * 화면 아래 잠깐 뜨는 알림. 내용이 비면 아무것도 그리지 않는다.
 * 띄우고 지우는 타이밍은 화면이 정한다 (보통 2~3초 뒤 setState('')).
 */
export function Toast({ children, ...rest }) {
  if (!children) return null;
  return (
    <div role="status" className="ui-toast" {...rest}>
      {children}
    </div>
  );
}

export default Toast;
