// 테스트는 실제 DB에 연결하지 않는다.
// database.js는 DATABASE_URL이 없으면 process.exit(1)을 호출하므로 더미 값을 넣어준다.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
