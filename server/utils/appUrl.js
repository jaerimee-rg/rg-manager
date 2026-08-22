// 앱의 바깥 주소를 한 곳에서 정한다.
// 카카오 로그인 redirect_uri 와 카카오 메시지 버튼 링크가 서로 어긋나면
// 로그인이 깨지거나 죽은 주소로 안내되므로 같은 값에서 끌어 쓴다.

const DEFAULT_PRODUCTION_URL = 'https://rg-manager.vercel.app';
const DEFAULT_LOCAL_URL = 'http://localhost:3000';

const stripTrailingSlash = (url) => url.replace(/\/+$/, '');

const fallbackUrl =
  process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_URL : DEFAULT_LOCAL_URL;

export const APP_URL = stripTrailingSlash(process.env.APP_URL || fallbackUrl);

// 카카오 개발자 콘솔에 등록된 값과 반드시 일치해야 한다.
export const KAKAO_REDIRECT_URI =
  process.env.KAKAO_REDIRECT_URI || `${APP_URL}/oauth/kakao/callback`;
