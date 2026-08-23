import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// 향후 게시판·채팅을 여기에 한 줄씩 추가한다.
// 내 정보는 관례대로 맨 오른쪽에 두므로 그 앞의 자리들을 SOON 이 채운다.
export const parentNavLinks = [
  { path: '/parent/schedule', label: '일정', icon: '📅' },
  { path: '/parent/photos', label: '사진', icon: '📷' }
];

const SOON = [
  { label: '채팅', icon: '💬' }
];

const parentNavTail = [
  { path: '/parent/settings', label: '내 정보', icon: '👤' }
];

function ParentLayout({ title, subtitle, children }) {
  const location = useLocation();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-primary)'
    }}>
      <header style={{
        background: '#fff', padding: '14px 16px',
        borderBottom: '1px solid var(--color-gray-100)', flexShrink: 0
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.4px' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>{subtitle}</div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '14px 14px 20px' }}>{children}</div>
      </main>

      <nav style={{
        background: '#fff', borderTop: '1px solid var(--color-gray-100)', display: 'flex',
        padding: '6px 8px calc(10px + env(safe-area-inset-bottom))', flexShrink: 0
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', width: '100%' }}>
          {parentNavLinks.map((link) => {
            const active = location.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  fontSize: '0.6875rem', fontWeight: 600, padding: '6px 0', textDecoration: 'none',
                  color: active ? 'var(--color-primary)' : 'var(--color-gray-500)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
          {SOON.map((item) => (
            <span
              key={item.label}
              title="곧 추가됩니다"
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                fontSize: '0.6875rem', fontWeight: 600, padding: '6px 0',
                color: 'var(--color-gray-400)', opacity: 0.5
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
              {item.label}
            </span>
          ))}
          {parentNavTail.map((link) => {
            const active = location.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  fontSize: '0.6875rem', fontWeight: 600, padding: '6px 0', textDecoration: 'none',
                  color: active ? 'var(--color-primary)' : 'var(--color-gray-500)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default ParentLayout;
