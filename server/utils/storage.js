// Supabase Storage REST API 를 직접 호출한다 (@supabase/supabase-js 의존성 없이).
// 업로드는 service role 키로만 하고, 읽기는 공개 버킷 URL 로 나간다.

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'faq-files';

// DATABASE_URL 의 프로젝트 ref 에서 API 주소를 유추한다.
// SUPABASE_URL 을 따로 넣지 않아도 동작하게 하기 위한 편의 기능이다.
const deriveUrlFromDatabaseUrl = () => {
  const dbUrl = process.env.DATABASE_URL || '';

  // 직접 연결: postgresql://user:pw@db.<ref>.supabase.co:5432/postgres
  const direct = dbUrl.match(/db\.([a-z]{20})\.supabase\.co/);
  if (direct) return `https://${direct[1]}.supabase.co`;

  // 풀러: postgresql://<사용자>.<ref>:pw@aws-0-...pooler.supabase.com:6543/postgres
  // 사용자 이름은 postgres 가 아닐 수 있다 (이 프로젝트는 rg_app 을 쓴다).
  const pooler = dbUrl.match(/\/\/[^:@/]+\.([a-z]{20})[:@]/);
  if (pooler) return `https://${pooler[1]}.supabase.co`;

  return null;
};

// Supabase 가 키 이름을 바꿨다 (service_role -> secret key).
// 새 이름(sb_secret_...)을 먼저 보고, 예전 이름도 계속 읽는다.
const resolveKey = () =>
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;

export const getStorageConfig = () => {
  const url = process.env.SUPABASE_URL || deriveUrlFromDatabaseUrl();
  const key = resolveKey();
  return { url: url ? url.replace(/\/$/, '') : null, key, bucket: BUCKET };
};

export const isStorageConfigured = () => {
  const { url, key } = getStorageConfig();
  return Boolean(url && key);
};

export const buildPublicUrl = (storagePath) => {
  const { url, bucket } = getStorageConfig();
  if (!url) return null;
  // 경로의 각 구간만 인코딩한다 (슬래시는 그대로 두어야 한다).
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${url}/storage/v1/object/public/${bucket}/${encoded}`;
};

/**
 * 파일을 올리고 공개 URL 을 돌려준다.
 * 실패하면 Storage 가 준 메시지를 그대로 담아 던진다 (원인을 숨기지 않는다).
 */
export const uploadFile = async (storagePath, buffer, contentType) => {
  const { url, key, bucket } = getStorageConfig();
  if (!url || !key) throw new Error('Supabase Storage 환경변수가 설정되지 않았습니다.');

  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType,
      // 같은 경로를 덮어쓰지 않는다. 경로에 난수가 들어가므로 충돌은 사실상 없다.
      'x-upsert': 'false'
    },
    body: buffer
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`파일 업로드 실패 (${response.status}): ${detail.slice(0, 200)}`);
  }

  return buildPublicUrl(storagePath);
};

/**
 * 파일을 지운다. 저장소에 이미 없더라도 DB 행은 지워야 하므로 오류를 삼키고 알린다.
 */
export const deleteFile = async (storagePath) => {
  const { url, key, bucket } = getStorageConfig();
  if (!url || !key) return false;

  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  try {
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, apikey: key }
    });
    if (!response.ok) {
      console.error(`저장소 파일 삭제 실패 (${response.status}): ${storagePath}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('저장소 파일 삭제 오류:', error?.message || error);
    return false;
  }
};

/**
 * 저장소에서 파일 바이트를 가져온다.
 *
 * Supabase 는 공개 버킷의 HTML 을 반드시 text/plain 으로 내려준다 (그들의 XSS 방어).
 * 그래서 HTML 은 우리 서버가 대신 받아 올바른 Content-Type 으로 다시 내보낸다.
 */
export const downloadFile = async (storagePath) => {
  const { url, key, bucket } = getStorageConfig();
  if (!url || !key) throw new Error('Supabase Storage 환경변수가 설정되지 않았습니다.');

  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key }
  });

  if (!response.ok) {
    throw new Error(`파일을 가져오지 못했습니다 (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
};
