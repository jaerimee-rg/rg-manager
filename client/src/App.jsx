import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useIsMobile } from './hooks/useMediaQuery';
import StudentList from './components/Students/StudentList';
import StudentForm from './pages/Students/StudentForm';
import ClassList from './components/Classes/ClassList';
import ClassForm from './pages/Classes/ClassForm';
import ClassStudentManagement from './pages/Classes/ClassStudentManagement';
import AttendanceCheck from './components/Attendance/AttendanceCheck';
import Dashboard from './pages/Dashboard';
import StudentAttendance from './pages/StudentAttendance';
import Login from './pages/Login';
import CompetitionForm from './pages/Competitions/CompetitionForm';
import CompetitionStudentManagement from './pages/Competitions/CompetitionStudentManagement';
import StudentCompetitions from './pages/StudentCompetitions';
import KakaoCallback from './pages/KakaoCallback';
import RegisterName from './pages/RegisterName';
import Settings from './pages/Settings';
import DesignSystem from './pages/DesignSystem';
import FaqList from './pages/Faq/FaqList';
import PublicChat from './pages/PublicChat';
import EventList from './pages/Events/EventList';
import EventForm from './pages/Events/EventForm';
import ParentList from './pages/Parents/ParentList';
import InviteLanding from './pages/parent/InviteLanding';
import TeacherInviteLanding from './pages/TeacherInviteLanding';
import ParentApp from './components/parent/ParentApp';
import RoleSwitcher from './components/common/RoleSwitcher';
import ImpersonationBanner from './components/common/ImpersonationBanner';
import RememberReturnTo from './components/common/RememberReturnTo';

// Admin components
import AdminRoute from './components/admin/AdminRoute';
import AdminLayout from './components/admin/AdminLayout';
import AdminStudents from './pages/admin/AdminStudents';
import AdminClasses from './pages/admin/AdminClasses';
import AdminCompetitions from './pages/admin/AdminCompetitions';
import AdminAttendance from './pages/admin/AdminAttendance';
import AdminUsers from './pages/admin/AdminUsers';
import AdminLogs from './pages/admin/AdminLogs';
import AdminNotifications from './pages/admin/AdminNotifications';
import AdminFaq from './pages/admin/AdminFaq';
import AdminSettings from './pages/admin/AdminSettings';
import AdminEvents from './pages/admin/AdminEvents';
import AdminParents from './pages/admin/AdminParents';
import AdminTeacherInvites from './pages/admin/AdminTeacherInvites';

function AuthLoading() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px' }}></div>
        <div style={{ color: 'var(--color-gray-500)', fontSize: '0.9375rem' }}>로딩 중...</div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  // 메뉴 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeMobileMenu();
  };

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  // 관리자 페이지 여부 확인
  const isAdminPage = location.pathname.startsWith('/admin');

  // 학부모 공개 채팅은 앱 헤더 없이 단독 화면으로 보여준다
  const isPublicChatPage = location.pathname.startsWith('/chat/');

  // 초대 링크도 마찬가지다. 학부모가 처음 여는 화면이라 앱 메뉴가 끼어들면 안 되고,
  // 선생님이 자기 링크를 눌러 확인할 때도 같은 화면을 보여야 한다.
  const isInvitePage = location.pathname.startsWith('/invite/');
  // 관리자가 보낸 선생님 초대 링크도 같은 성격이다 (로그인 전에 여는 화면).
  const isTeacherInvitePage = location.pathname.startsWith('/teacher-invite/');

  // 로그인과 무관한 화면이므로 인증 확인을 기다리지 않는다.
  if (isPublicChatPage || isInvitePage || isTeacherInvitePage) {
    return (
      <Routes>
        <Route path="/chat/:publicId" element={<PublicChat />} />
        <Route path="/invite/:token" element={<InviteLanding />} />
        <Route path="/teacher-invite/:token" element={<TeacherInviteLanding />} />
      </Routes>
    );
  }

  // 저장된 토큰을 확인하는 동안에는 라우팅을 판단하지 않는다.
  // 이때 비로그인 라우트를 그리면 아래 "*" 가 주소를 /login 으로 바꿔버려
  // 새로고침·북마크로 들어온 딥링크(/admin, /students ...)가 사라진다.
  if (loading) {
    return <AuthLoading />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Navigate to="/login" />} />
        <Route path="/oauth/kakao/callback" element={<KakaoCallback />} />
        <Route path="/register-name" element={<RegisterName />} />
        {/* 디자인 시스템 목록은 로그인 없이도 열린다 — 데이터가 없는 참고 화면이다 */}
        <Route path="/design-system" element={<DesignSystem />} />
        {/* 공유 링크(/parent/events/12) 같은 딥링크는 주소를 남겨 두고 로그인으로 보낸다.
            카카오 로그인이 끝나면 KakaoCallback 이 그 주소로 되돌려 준다. */}
        <Route path="*" element={<RememberReturnTo to="/login" />} />
      </Routes>
    );
  }

  // 학부모는 선생님 화면을 쓰지 않는다. 레이아웃·라우팅이 아예 다르므로
  // 여기서 갈라 두면 아래 선생님 트리는 손대지 않아도 된다.
  // 관리자가 다른 계정으로 들어와 있으면(FR-388) 어느 역할 화면이든 맨 위에 배너가 붙는다.
  if (user.role === 'parent') {
    return (
      <>
        <ImpersonationBanner />
        <ParentApp />
      </>
    );
  }

  const navLinks = [
    { path: '/', label: '대시보드', icon: '📊' },
    { path: '/students', label: '학생 관리', icon: '👥' },
    { path: '/classes', label: '수업 관리', icon: '📚' },
    { path: '/events', label: '이벤트 관리', icon: '📅' },
    { path: '/attendance', label: '출석 체크', icon: '✓' },
    { path: '/student-attendance', label: '학생별 출석', icon: '📋' },
    { path: '/student-competitions', label: '학생별 대회', icon: '🎖️' },
    { path: '/parents', label: '학부모', icon: '👨‍👩‍👧' },
    { path: '/faq', label: 'FAQ', icon: '💬' },
  ];


  // 관리자 페이지일 경우 별도 레이아웃 사용
  if (isAdminPage) {
    return (
      <>
        <ImpersonationBanner />
        <Routes>
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Navigate to="/admin/students" replace />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="students/new" element={<StudentForm />} />
            <Route path="students/edit" element={<StudentForm />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="classes/new" element={<ClassForm />} />
            <Route path="classes/edit" element={<ClassForm />} />
            <Route path="classes/manage" element={<ClassStudentManagement />} />
            <Route path="competitions" element={<AdminCompetitions />} />
            <Route path="competitions/new" element={<CompetitionForm />} />
            <Route path="competitions/edit" element={<CompetitionForm />} />
            <Route path="competitions/manage" element={<CompetitionStudentManagement />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="events/new" element={<EventForm basePath="/admin/events" />} />
            <Route path="events/edit" element={<EventForm basePath="/admin/events" />} />
            <Route path="parents" element={<AdminParents />} />
            <Route path="teachers" element={<AdminTeacherInvites />} />
            <Route path="attendance" element={<AdminAttendance />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="faq" element={<AdminFaq />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin/students" />} />
        </Routes>
      </>
    );
  }

  return (
    <div className="app">
      <ImpersonationBanner />
      <header className="app-header">
        <div className="app-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ marginBottom: 0 }}>리듬체조 출석</h1>
            <button className="mobile-menu-button" onClick={toggleMobileMenu}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          </div>
          {/* Desktop Navigation */}
          <nav className="desktop-nav">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={isActive(link.path) ? 'active' : ''}
              >
                {link.label}
              </Link>
            ))}
            <RoleSwitcher variant="menu" />
            <Link
              to="/settings"
              className={isActive('/settings') ? 'active' : ''}
            >
              설정
            </Link>
            <button
              onClick={handleLogout}
              className="btn btn-ghost"
              style={{
                fontSize: '0.875rem',
              }}
            >
              로그아웃
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Fullscreen Menu */}
      <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-header">
          <span className="mobile-menu-title">메뉴</span>
          <button className="mobile-menu-close" onClick={closeMobileMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="mobile-menu-content">
          <div className="mobile-menu-section">
            <div className="mobile-menu-section-title">메인</div>
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={closeMobileMenu}
                className={`mobile-menu-item ${isActive(link.path) ? 'active' : ''}`}
              >
                <span className="mobile-menu-icon">{link.icon}</span>
                <span className="mobile-menu-label">{link.label}</span>
              </Link>
            ))}
          </div>
          <div className="mobile-menu-section">
            <div className="mobile-menu-section-title">역할</div>
            <RoleSwitcher variant="list" onNavigate={closeMobileMenu} />
          </div>

          <div className="mobile-menu-section">
            <div className="mobile-menu-section-title">계정</div>
            <Link
              to="/settings"
              onClick={closeMobileMenu}
              className={`mobile-menu-item ${isActive('/settings') ? 'active' : ''}`}
            >
              <span className="mobile-menu-icon">⚙️</span>
              <span className="mobile-menu-label">설정</span>
            </Link>
            <button
              onClick={handleLogout}
              className="mobile-menu-item"
            >
              <span className="mobile-menu-icon">🚪</span>
              <span className="mobile-menu-label">로그아웃</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          {/* 디자인 시스템 목록 — 새 화면을 만들기 전에 여기서 컴포넌트를 찾는다 */}
          <Route path="/design-system" element={<DesignSystem />} />
          <Route path="/students" element={<ProtectedRoute><StudentList /></ProtectedRoute>} />
          <Route path="/students/new" element={<ProtectedRoute><StudentForm /></ProtectedRoute>} />
          <Route path="/students/edit" element={<ProtectedRoute><StudentForm /></ProtectedRoute>} />
          <Route path="/classes" element={<ProtectedRoute><ClassList /></ProtectedRoute>} />
          <Route path="/classes/new" element={<ProtectedRoute><ClassForm /></ProtectedRoute>} />
          <Route path="/classes/edit" element={<ProtectedRoute><ClassForm /></ProtectedRoute>} />
          <Route path="/classes/manage" element={<ProtectedRoute><ClassStudentManagement /></ProtectedRoute>} />
          {/* 목록은 이벤트 관리로 옮겼다. 옛 주소·북마크는 그대로 살려 둔다. */}
          <Route path="/competitions" element={<Navigate to="/events" replace />} />
          <Route path="/events" element={<ProtectedRoute><EventList /></ProtectedRoute>} />
          <Route path="/events/new" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
          <Route path="/events/edit" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
          <Route path="/parents" element={<ProtectedRoute><ParentList /></ProtectedRoute>} />
          <Route path="/competitions/new" element={<ProtectedRoute><CompetitionForm /></ProtectedRoute>} />
          <Route path="/competitions/edit" element={<ProtectedRoute><CompetitionForm /></ProtectedRoute>} />
          <Route path="/competitions/manage" element={<ProtectedRoute><CompetitionStudentManagement /></ProtectedRoute>} />
          <Route path="/attendance" element={<ProtectedRoute><AttendanceCheck /></ProtectedRoute>} />
          <Route path="/student-attendance" element={<ProtectedRoute><StudentAttendance /></ProtectedRoute>} />
          <Route path="/student-competitions" element={<ProtectedRoute><StudentCompetitions /></ProtectedRoute>} />
          <Route path="/faq" element={<ProtectedRoute><FaqList /></ProtectedRoute>} />
          <Route path="/faq/chats" element={<ProtectedRoute><FaqList initialTab="chats" /></ProtectedRoute>} />
          <Route path="/faq/manage" element={<ProtectedRoute><FaqList initialTab="faq" /></ProtectedRoute>} />
          <Route path="/faq/files" element={<ProtectedRoute><FaqList initialTab="files" /></ProtectedRoute>} />
          <Route path="/chat/:publicId" element={<PublicChat />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
