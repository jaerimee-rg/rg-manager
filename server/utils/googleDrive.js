/**
 * Google Drive REST 를 fetch 로 직접 부른다 (googleapis SDK 는 번들이 수십 MB 라 쓰지 않는다).
 * 이 파일은 DB 를 모른다 — 토큰을 인자로 받고, 결과와 오류만 돌려준다.
 *
 * 권한 범위는 drive.file 하나뿐이다: **앱이 만든 파일·폴더만** 보고 쓴다.
 * 그래서 Google 검수가 필요 없고, 선생님의 다른 파일에는 접근할 수 없다.
 */

import { APP_URL } from './appUrl.js';

const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const getOAuthConfig = () => ({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || null,
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || `${APP_URL}/api/drive/callback`
});

export const isDriveConfigured = () => {
  const { clientId, clientSecret } = getOAuthConfig();
  return Boolean(clientId && clientSecret);
};

/** 동의 화면 주소. state 는 호출자가 만든 1회용 값이다. */
export const buildAuthUrl = (state) => {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: 'offline',
    // 재연결에서도 refresh token 을 받으려면 매번 동의를 받아야 한다.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
};

/** Google 오류를 화면에서 쓸 수 있는 코드로 바꾼다. */
export class DriveError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'DriveError';
    this.code = code;     // invalid_grant | quota | not_found | forbidden | drive_error
    this.status = status;
  }
}

const parseError = async (response) => {
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const reason = body?.error?.errors?.[0]?.reason || body?.error || '';
  const message = body?.error?.message || body?.error_description || `Drive 요청 실패 (${response.status})`;

  if (reason === 'invalid_grant' || body?.error === 'invalid_grant') return new DriveError('invalid_grant', message, response.status);
  if (reason === 'storageQuotaExceeded') return new DriveError('quota', message, response.status);
  if (response.status === 404) return new DriveError('not_found', message, response.status);
  if (response.status === 401) return new DriveError('unauthorized', message, response.status);
  if (response.status === 403) return new DriveError('forbidden', message, response.status);
  return new DriveError('drive_error', message, response.status);
};

/** 인증 코드 → 토큰. 반환에 googleSub·googleEmail 이 함께 담긴다. */
export const exchangeCode = async (code) => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) throw await parseError(response);
  const data = await response.json();

  const profile = decodeIdToken(data.id_token);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: data.expires_in || 3600,
    googleSub: profile.sub || '',
    googleEmail: profile.email || ''
  };
};

/**
 * id_token 의 payload 만 읽는다. 서명 검증은 하지 않는다 —
 * 이 값은 Google 과 직접 주고받은 응답이라 중간자가 없고, 표시용으로만 쓴다.
 */
export const decodeIdToken = (idToken) => {
  if (typeof idToken !== 'string') return {};
  const parts = idToken.split('.');
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

/** refresh token 으로 access token 을 새로 받는다. */
export const refreshAccessToken = async (refreshToken) => {
  const { clientId, clientSecret } = getOAuthConfig();
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) throw await parseError(response);
  const data = await response.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
};

export const revokeToken = async (token) => {
  try {
    await fetch(OAUTH_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token })
    });
    return true;
  } catch {
    // 이미 무효한 토큰이면 그만이다. 연결 해제 자체는 계속 진행한다.
    return false;
  }
};

const driveFetch = async (accessToken, path, options = {}) => {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return null;
  return response.json();
};

/** 폴더 만들기. parentId 가 없으면 내 드라이브 최상위에 만든다. */
export const createFolder = async (accessToken, { name, parentId = null }) => {
  const body = { name, mimeType: FOLDER_MIME };
  if (parentId) body.parents = [parentId];

  return driveFetch(accessToken, '/files?fields=id,name,webViewLink', {
    method: 'POST',
    body: JSON.stringify(body)
  });
};

export const renameFile = async (accessToken, fileId, name) =>
  driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}?fields=id,name`, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  });

/**
 * "링크가 있는 모든 사용자 — 보기" 로 공유한다.
 * 앱 갤러리가 Drive 썸네일 주소를 그대로 쓰기 때문에 필요하다 (FR-221).
 */
export const shareAnyoneReader = async (accessToken, fileId) =>
  driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
    method: 'POST',
    body: JSON.stringify({ type: 'anyone', role: 'reader' })
  });

export const listPermissions = async (accessToken, fileId) =>
  driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role)`);

/** 링크 공유가 켜져 있는지 */
export const isSharedWithAnyone = (permissions) =>
  Boolean(permissions?.permissions?.some((p) => p.type === 'anyone' && (p.role === 'reader' || p.role === 'writer')));

const FILE_FIELDS = 'id,name,mimeType,size,parents,trashed,createdTime,imageMediaMetadata(width,height,time),videoMediaMetadata(width,height,durationMillis)';

export const getFile = async (accessToken, fileId, fields = FILE_FIELDS) =>
  driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`);

/** 휴지통으로 보낸다 (영구 삭제는 하지 않는다 — 30일 안에 복구할 수 있다). */
export const trashFile = async (accessToken, fileId) =>
  driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}?fields=id,trashed`, {
    method: 'PATCH',
    body: JSON.stringify({ trashed: true })
  });

export const getStorageQuota = async (accessToken) => {
  const data = await driveFetch(accessToken, '/about?fields=storageQuota,user(emailAddress)');
  const quota = data?.storageQuota || {};
  const limit = Number(quota.limit || 0);
  const usage = Number(quota.usage || 0);
  return {
    limit: limit || null,
    usage,
    remaining: limit ? Math.max(0, limit - usage) : null,
    email: data?.user?.emailAddress || null
  };
};

/**
 * 브라우저가 이어서 올릴 수 있는 업로드 세션을 만든다.
 *
 * Origin 헤더를 넣어야 Google 이 그 출처에 CORS 를 허용해, 브라우저가
 * 세션 URI 로 직접 PUT 할 수 있다. 세션 URI 자체가 자격 증명이므로
 * 브라우저는 우리 토큰을 알 필요가 없다 (FR-232).
 */
export const createResumableSession = async (accessToken, { name, parentId, mimeType, size, origin = APP_URL }) => {
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
      Origin: origin
    },
    body: JSON.stringify({ name, parents: [parentId] })
  });

  if (!response.ok) throw await parseError(response);

  const location = response.headers.get('location') || response.headers.get('Location');
  if (!location) throw new DriveError('drive_error', '업로드 세션 주소를 받지 못했습니다.', response.status);
  return location;
};

/** 재분석용 — 사진의 JPEG 썸네일 바이트를 받는다 (HEIC 도 JPEG 로 온다). */
export const fetchThumbnailBytes = async (accessToken, fileId, size = 1600) => {
  const response = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw await parseError(response);
  return Buffer.from(await response.arrayBuffer());
};

export default {
  DRIVE_SCOPE,
  FOLDER_MIME,
  DriveError,
  getOAuthConfig,
  isDriveConfigured,
  buildAuthUrl,
  exchangeCode,
  decodeIdToken,
  refreshAccessToken,
  revokeToken,
  createFolder,
  renameFile,
  shareAnyoneReader,
  listPermissions,
  isSharedWithAnyone,
  getFile,
  trashFile,
  getStorageQuota,
  createResumableSession,
  fetchThumbnailBytes
};
