/**
 * Google Drive 토큰을 다루는 유일한 곳.
 * utils/googleDrive.js 는 DB 를 모르고, 여기서 저장된 토큰과 갱신을 엮는다.
 */

import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import {
  DriveError,
  refreshAccessToken,
  createFolder,
  getFile,
  isDriveConfigured
} from '../utils/googleDrive.js';

/** 만료 60초 전이면 미리 갱신한다 (요청 도중에 만료되는 것을 피한다). */
const EXPIRY_MARGIN_MS = 60 * 1000;

export const isExpired = (tokenExpiresAt, now = Date.now()) => {
  const at = Date.parse(tokenExpiresAt || '');
  if (!Number.isFinite(at)) return true;
  return at - EXPIRY_MARGIN_MS <= now;
};

export const expiryFromNow = (expiresIn) => new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString();

/**
 * 쓸 수 있는 access token 을 준다.
 * → { ok: true, account, accessToken } | { ok: false, reason, account }
 *
 * reason: not_configured | not_connected | error(권한 철회 등)
 */
export const getAccessToken = async (userId) => {
  if (!isDriveConfigured()) return { ok: false, reason: 'not_configured', account: null };

  const account = await GoogleDriveAccount.getByUserId(userId);
  if (!account) return { ok: false, reason: 'not_connected', account: null };
  if (account.status === 'error') return { ok: false, reason: 'error', account };

  if (!isExpired(account.tokenExpiresAt)) {
    return { ok: true, account, accessToken: account.accessToken };
  }

  try {
    const refreshed = await refreshAccessToken(account.refreshToken);
    const updated = await GoogleDriveAccount.updateTokens(userId, {
      accessToken: refreshed.accessToken,
      tokenExpiresAt: expiryFromNow(refreshed.expiresIn)
    });
    return { ok: true, account: updated || account, accessToken: refreshed.accessToken };
  } catch (error) {
    // 선생님이 Google 에서 권한을 철회하면 여기로 온다. 상태를 남겨 화면에 배너를 띄운다.
    console.error('Drive 토큰 갱신 실패:', error?.message || error);
    const marked = await GoogleDriveAccount.markError(userId, error?.message || '토큰 갱신 실패');
    return { ok: false, reason: 'error', account: marked || account };
  }
};

/**
 * Drive 호출을 감싸 401/invalid_grant 를 계정 상태에 반영한다.
 * 호출자는 DriveError 를 그대로 받아 사용자 메시지로 바꾼다.
 */
export const runWithDrive = async (userId, fn) => {
  const token = await getAccessToken(userId);
  if (!token.ok) throw new DriveError(token.reason === 'not_configured' ? 'not_configured' : 'not_connected',
    token.reason === 'error' ? 'Google Drive 연결이 끊어졌습니다.' : 'Google Drive 가 연결되지 않았습니다.');

  try {
    return await fn(token.accessToken, token.account);
  } catch (error) {
    if (error instanceof DriveError && (error.code === 'invalid_grant' || error.code === 'unauthorized')) {
      await GoogleDriveAccount.markError(userId, error.message);
    }
    throw error;
  }
};

/**
 * 루트 폴더(기본 이름 RG Manager)를 확보한다.
 * 저장된 id 가 아직 살아 있으면 그대로 쓰고, 없으면 새로 만든다.
 */
export const ensureRootFolder = async (userId) => runWithDrive(userId, async (accessToken, account) => {
  if (account.rootFolderId) {
    try {
      const existing = await getFile(accessToken, account.rootFolderId, 'id,name,trashed');
      if (existing && !existing.trashed) return { id: account.rootFolderId, name: existing.name };
    } catch (error) {
      if (!(error instanceof DriveError) || error.code !== 'not_found') throw error;
      // 폴더가 사라졌으면 아래에서 새로 만든다.
    }
  }

  const created = await createFolder(accessToken, { name: account.rootFolderName || 'RG Manager' });
  await GoogleDriveAccount.setRootFolder(userId, { rootFolderId: created.id, rootFolderName: created.name });
  return { id: created.id, name: created.name };
});

export default { isExpired, expiryFromNow, getAccessToken, runWithDrive, ensureRootFolder };
