import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import ParentSchedule from '../../pages/parent/ParentSchedule';
import ParentSettings from '../../pages/parent/ParentSettings';
import ParentOnboarding from '../../pages/parent/ParentOnboarding';
import InviteLanding from '../../pages/parent/InviteLanding';

/**
 * 학부모 전용 앱. 선생님 라우팅과 완전히 분리해 서로 영향이 없게 한다.
 * 아이를 아직 등록하지 않았으면 어떤 주소로 들어와도 온보딩으로 보낸다.
 */
function ParentApp() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth('/api/parent/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
  const teacherName = me?.teacher?.name || '';

  return (
    <Routes>
      <Route path="/invite/:token" element={<InviteLanding />} />
      <Route path="/parent/onboarding" element={<ParentOnboarding teacherName={teacherName} />} />
      {needsOnboarding ? (
        <Route path="*" element={<Navigate to="/parent/onboarding" replace />} />
      ) : (
        <>
          <Route path="/parent/schedule" element={<ParentSchedule />} />
          <Route path="/parent/settings" element={<ParentSettings />} />
          <Route path="*" element={<Navigate to="/parent/schedule" replace />} />
        </>
      )}
    </Routes>
  );
}

export default ParentApp;
