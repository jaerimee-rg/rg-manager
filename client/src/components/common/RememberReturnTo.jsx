import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { saveReturnTo } from '../../utils/returnTo';

/**
 * 지금 주소를 "로그인 뒤 돌아갈 곳" 으로 남기고 `to` 로 보낸다.
 * 로그인 안 된 딥링크(App) 와 아이 등록 전 학부모(ParentApp) 가 같은 일을 해서 공유했다.
 * 저장할 수 없는 주소(`/` · 로그인 화면 …)는 그냥 지나간다.
 */
function RememberReturnTo({ to }) {
  const location = useLocation();
  saveReturnTo(`${location.pathname}${location.search}`);
  return <Navigate to={to} replace />;
}

export default RememberReturnTo;
