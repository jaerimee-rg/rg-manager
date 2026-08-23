// 테스트는 실제 DB에 연결하지 않는다.
// database.js는 DATABASE_URL이 없으면 process.exit(1)을 호출하므로 더미 값을 넣어준다.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

// 카카오 로그인 컨트롤러는 모듈을 읽을 때 키를 한 번만 읽는다.
// 테스트에서 인가 URL 을 확인하려면 그 전에 값이 있어야 한다.
process.env.KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || 'test-kakao-client-id';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';
