import { getStorageConfig, isStorageConfigured, buildPublicUrl } from '../storage.js';

const REF = 'vrzsommyxtvdqlpoufes';
const ENV_KEYS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

describe('storage 설정', () => {
  const saved = {};

  beforeEach(() => {
    ENV_KEYS.forEach((k) => {
      saved[k] = process.env[k];
      delete process.env[k];
    });
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  describe('SUPABASE_URL 유추', () => {
    it('풀러 주소에서 프로젝트 ref 를 찾는다 (사용자 이름이 postgres 가 아니어도)', () => {
      process.env.DATABASE_URL = `postgresql://rg_app.${REF}:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

      expect(getStorageConfig().url).toBe(`https://${REF}.supabase.co`);
    });

    it('사용자 이름이 postgres 인 풀러 주소도 찾는다', () => {
      process.env.DATABASE_URL = `postgresql://postgres.${REF}:pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;

      expect(getStorageConfig().url).toBe(`https://${REF}.supabase.co`);
    });

    it('직접 연결 주소에서도 찾는다', () => {
      process.env.DATABASE_URL = `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`;

      expect(getStorageConfig().url).toBe(`https://${REF}.supabase.co`);
    });

    it('SUPABASE_URL 을 직접 넣으면 그것을 쓴다', () => {
      process.env.DATABASE_URL = `postgresql://rg_app.${REF}:pw@aws-0.pooler.supabase.com:6543/postgres`;
      process.env.SUPABASE_URL = 'https://다른곳.supabase.co/';

      // 끝의 슬래시는 떼어낸다 (주소를 이어 붙일 때 // 가 되지 않도록)
      expect(getStorageConfig().url).toBe('https://다른곳.supabase.co');
    });

    it('Supabase 가 아닌 DB 주소면 유추하지 않는다', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/rg_manager';

      expect(getStorageConfig().url).toBeNull();
    });
  });

  describe('키 이름', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = `postgresql://rg_app.${REF}:pw@aws-0.pooler.supabase.com:6543/postgres`;
    });

    it('새 이름(SUPABASE_SECRET_KEY)을 읽는다', () => {
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_abc';

      expect(getStorageConfig().key).toBe('sb_secret_abc');
      expect(isStorageConfigured()).toBe(true);
    });

    it('예전 이름(SUPABASE_SERVICE_ROLE_KEY)도 계속 읽는다', () => {
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-jwt';

      expect(getStorageConfig().key).toBe('legacy-jwt');
      expect(isStorageConfigured()).toBe(true);
    });

    it('둘 다 있으면 새 이름을 쓴다', () => {
      process.env.SUPABASE_SECRET_KEY = 'sb_secret_abc';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-jwt';

      expect(getStorageConfig().key).toBe('sb_secret_abc');
    });

    it('키가 없으면 준비되지 않은 것으로 본다', () => {
      expect(isStorageConfigured()).toBe(false);
    });
  });

  describe('buildPublicUrl', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = `https://${REF}.supabase.co`;
    });

    it('공개 버킷 주소를 만든다', () => {
      expect(buildPublicUrl('3/uuid/notice.pdf')).toBe(
        `https://${REF}.supabase.co/storage/v1/object/public/faq-files/3/uuid/notice.pdf`
      );
    });

    it('한글 파일 이름을 인코딩하되 경로 구분자는 남긴다', () => {
      const url = buildPublicUrl('3/uuid/수업안내.pdf');

      expect(url).toContain('/faq-files/3/uuid/');
      expect(url).toContain(encodeURIComponent('수업안내.pdf'));
      expect(url).not.toContain('%2F');
    });
  });
});
