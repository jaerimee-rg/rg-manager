import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { listenForInstallPrompt } from './utils/homeScreen';
import { getUser } from './utils/tokenStorage';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/App.css';

// 홈 화면 설치 이벤트는 페이지가 열리자마자 한 번만 온다 — 앱이 뜨기 전에 받아 둔다 (components/parent/HomeScreenPrompt).
// 크롬 기본 설치 안내줄은 학부모에게만 막는다(우리 팝업이 대신한다). 선생님 화면은 그대로.
listenForInstallPrompt({ shouldDefer: () => getUser()?.role === 'parent' });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
