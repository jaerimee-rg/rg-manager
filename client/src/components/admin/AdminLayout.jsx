import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../hooks/useMediaQuery';

const adminMenuItems = [
  { path: '/admin/students', label: '학생', icon: '👥' },
  { path: '/admin/classes', label: '수업', icon: '📚' },
  { path: '/admin/competitions', label: '대회', icon: '🏆' },
  { path: '/admin/events', label: '이벤트', icon: '📅' },
  { path: '/admin/parents', label: '학부모', icon: '👨‍👩‍👧' },
  { path: '/admin/attendance', label: '출석', icon: '✓' },
  { path: '/admin/users', label: '사용자', icon: '👤' },
  { path: '/admin/logs', label: '로그', icon: '📝' },
  { path: '/admin/notifications', label: '알림', icon: '🔔' },
  { path: '/admin/faq', label: 'FAQ', icon: '💬' },
  { path: '/admin/settings', label: '설정', icon: '⚙️' },
];

function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

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

  const isActive = (path) => {
    if (path === '/admin/students') {
      return location.pathname === '/admin' || location.pathname.startsWith('/admin/students');
    }
    return location.pathname.startsWith(path);
  };

  const handleMenuItemClick = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const getCurrentPageLabel = () => {
    const currentItem = adminMenuItems.find(item => isActive(item.path));
    return currentItem ? currentItem.label : '관리자';
  };

  return (
    <div className="admin-layout">
      {/* Desktop Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h2>관리자</h2>
        </div>
        <nav className="admin-sidebar-nav">
          {adminMenuItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="admin-sidebar-icon">{item.icon}</span>
              <span className="admin-sidebar-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-sidebar-back">
            <span>←</span>
            <span>메인으로 돌아가기</span>
          </Link>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="admin-mobile-header">
        <button
          className="admin-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <span className="admin-mobile-title">{getCurrentPageLabel()}</span>
        <Link to="/" className="admin-mobile-back-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </Link>
      </header>

      {/* Mobile Fullscreen Menu */}
      <div className={`admin-mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="admin-mobile-menu-header">
          <span className="admin-mobile-menu-title">관리자 메뉴</span>
          <button
            className="admin-mobile-menu-close"
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="admin-mobile-menu-content">
          <div className="admin-mobile-menu-section">
            <div className="admin-mobile-menu-section-title">관리</div>
            {adminMenuItems.map(item => (
              <button
                key={item.path}
                onClick={() => handleMenuItemClick(item.path)}
                className={`admin-mobile-menu-item ${isActive(item.path) ? 'active' : ''}`}
              >
                <span className="admin-mobile-menu-icon">{item.icon}</span>
                <span className="admin-mobile-menu-label">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="admin-mobile-menu-section">
            <div className="admin-mobile-menu-section-title">이동</div>
            <Link
              to="/"
              className="admin-mobile-menu-item"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="admin-mobile-menu-icon">🏠</span>
              <span className="admin-mobile-menu-label">메인으로 돌아가기</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
