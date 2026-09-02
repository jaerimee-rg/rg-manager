import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import ParentSchedule from '../../pages/parent/ParentSchedule';
import ParentEventDetail from '../../pages/parent/ParentEventDetail';
import ParentSettings from '../../pages/parent/ParentSettings';
import ParentAlbumList from '../../pages/parent/ParentAlbumList';
import ParentAlbum from '../../pages/parent/ParentAlbum';
import ParentOnboarding from '../../pages/parent/ParentOnboarding';
import InviteLanding from '../../pages/parent/InviteLanding';
import RememberReturnTo from '../common/RememberReturnTo';

/**
 * 학부모 전용 앱. 선생님 라우팅과 완전히 분리해 서로 영향이 없게 한다.
 * 아이를 아직 등록하지 않았으면 어떤 주소로 들어와도 온보딩으로 보낸다.
 */
function ParentApp() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/parent/me');
      if (response.ok) {
        const data = await response.json();
        setMe(data);
        return data;
      }
    } catch {
      // 네트워크 오류면 다음 진입에서 다시 시도한다
    }
    return null;
  }, []);

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
  }, [loadMe]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', color: 'var(--color-gray-500)'
      }}>
        불러오는 중...
      </div>
    );
  }

  const needsOnboarding = me && (me.children || []).length === 0;
  // 학부모가 여러 선생님과 연결될 수 있어 온보딩이 선생님을 고를 수 있어야 한다
  const teachers = me?.teachers || [];

  return (
    <Routes>
      <Route path="/invite/:token" element={<InviteLanding />} />
      {/* 아이를 저장한 뒤 내 정보를 다시 읽어야 아래 가드가 일정 화면을 열어 준다.
          (읽지 않으면 저장에 성공하고도 온보딩으로 되돌아온다) */}
      <Route
        path="/parent/onboarding"
        element={<ParentOnboarding teachers={teachers} onDone={loadMe} />}
      />
      {needsOnboarding ? (
        /* 공유 링크로 들어왔다면 아이를 등록한 뒤 그 이벤트로 돌아가야 한다 */
        <Route path="*" element={<RememberReturnTo to="/parent/onboarding" />} />
      ) : (
        <>
          <Route path="/parent/schedule" element={<ParentSchedule />} />
          {/* 이벤트 상세 — 일정 카드를 누르거나 선생님이 공유한 링크를 열면 이 전체 화면이 뜬다 */}
          <Route path="/parent/events/:eventId" element={<ParentEventDetail />} />
          <Route path="/parent/photos" element={<ParentAlbumList />} />
          <Route path="/parent/photos/:eventId" element={<ParentAlbum />} />
          <Route path="/parent/settings" element={<ParentSettings />} />
          <Route path="*" element={<Navigate to="/parent/schedule" replace />} />
        </>
      )}
    </Routes>
  );
}

export default ParentApp;
