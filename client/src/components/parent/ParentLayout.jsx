import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton } from '../ui';

// 향후 게시판·채팅을 여기에 한 줄씩 추가한다.
// 내 정보는 관례대로 맨 오른쪽에 두므로 그 앞의 자리들을 SOON 이 채운다.
// icon 은 components/ui/Icon 의 이름 (이모지는 기기마다 모양이 달라 쓰지 않는다)
export const parentNavLinks = [
  // 공유 링크(/parent/events/12)로 열린 상세도 일정 화면 위에 뜨므로 같은 탭이다
  { path: '/parent/schedule', label: '일정', icon: 'calendar', alsoActive: ['/parent/events'] },
  { path: '/parent/photos', label: '사진', icon: 'image' }
];

const SOON = [
  { label: '채팅', icon: 'message' }
];

const parentNavTail = [
  { path: '/parent/settings', label: '내 정보', icon: 'user' }
];

function TabLink({ link, active }) {
  return (
    <Link
      to={link.path}
      className="ui-tabbar__item"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={link.icon} size={24} />
      <span className="ui-tabbar__label">{link.label}</span>
    </Link>
  );
}

/**
 * 학부모 화면 골격 — 위에 제목 줄, 아래에 탭 바 (휴대폰 앱 모양).
 * 모양은 styles/ui.css 의 `.ui-mobile-app` · `.ui-tabbar` 블록이 정한다.
 *
 * @param {string} [back] 있으면 제목 왼쪽에 뒤로 가기 버튼이 붙고, 누르면 그 주소로 간다.
 *   (상세 화면처럼 한 단계 안으로 들어온 페이지가 쓴다)
 * @param {React.ReactNode} [action] 제목 줄 오른쪽 끝에 붙는 것 (일정의 "지난 일정 보기" 링크)
 */
function ParentLayout({ title, subtitle, back, action, children }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="ui-mobile-app">
      <header className="ui-mobile-app__header">
        <div className="ui-mobile-app__inner ui-mobile-app__head-row">
          {back && (
            <IconButton icon="arrowLeft" label="뒤로" variant="ghost" size="sm" onClick={() => navigate(back)} />
          )}
          <div className="ui-mobile-app__titles">
            {/* 페이지 제목은 h1 — 화면에 하나뿐이고 스크린리더·테스트가 heading 으로 찾는다 */}
            <h1 className="ui-mobile-app__title">{title}</h1>
            {subtitle && <div className="ui-mobile-app__subtitle">{subtitle}</div>}
          </div>
          {action && <div className="ui-mobile-app__head-action">{action}</div>}
        </div>
      </header>

      <main className="ui-mobile-app__main">
        <div className="ui-mobile-app__inner ui-mobile-app__content">{children}</div>
      </main>

      <nav className="ui-tabbar" aria-label="학부모 메뉴">
        <div className="ui-mobile-app__inner ui-tabbar__row">
          {parentNavLinks.map((link) => (
            <TabLink
              key={link.path}
              link={link}
              active={[link.path, ...(link.alsoActive || [])].some((p) => location.pathname.startsWith(p))}
            />
          ))}
          {SOON.map((item) => (
            <span key={item.label} title="곧 추가됩니다" className="ui-tabbar__item" data-soon="true">
              <Icon name={item.icon} size={24} />
              <span className="ui-tabbar__label">{item.label}</span>
            </span>
          ))}
          {parentNavTail.map((link) => (
            <TabLink key={link.path} link={link} active={location.pathname.startsWith(link.path)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

export default ParentLayout;
