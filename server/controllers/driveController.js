import jwt from 'jsonwebtoken';
import GoogleDriveAccount from '../models/GoogleDriveAccount.js';
import Event from '../models/Event.js';
import {
  isDriveConfigured,
  buildAuthUrl,
  exchangeCode,
  revokeToken,
  renameFile,
  getStorageQuota,
  DriveError
} from '../utils/googleDrive.js';
import { getAccessToken, ensureRootFolder, expiryFromNow, runWithDrive } from '../services/driveAccess.js';
import { APP_URL } from '../utils/appUrl.js';

/**
 * 선생님의 Google Drive 연결.
 * 토큰은 이 서버 밖으로 나가지 않는다 — 응답에는 presentable() 결과만 담는다.
 */

const STATE_TTL_SECONDS = 600; // 10분

/** OAuth state 를 서명해 사용자와 묶는다. 콜백에는 Authorization 헤더가 없기 때문이다. */
export const signState = (userId) =>
  jwt.sign({ userId, purpose: 'drive_connect' }, process.env.JWT_SECRET, { expiresIn: STATE_TTL_SECONDS });

export const verifyState = (state) => {
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (decoded?.purpose !== 'drive_connect') return null;
    return decoded.userId;
  } catch {
    return null;
  }
};

/** GET /api/drive/account */
export const getAccount = async (req, res) => {
  try {
    if (!isDriveConfigured()) {
      return res.json({ connected: false, configured: false });
    }

    const account = await GoogleDriveAccount.getByUserId(req.user.id);
    const payload = { ...GoogleDriveAccount.presentable(account), configured: true };

    if (account && account.status !== 'error') {
      try {
        const token = await getAccessToken(req.user.id);
        if (token.ok) payload.quota = await getStorageQuota(token.accessToken);
      } catch (error) {
        // 용량 조회가 실패해도 연결 정보는 보여준다.
        console.error('Drive 용량 조회 실패:', error?.message || error);
      }
    }

    res.json(payload);
  } catch (error) {
    console.error('Drive 연결 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** GET /api/drive/connect — 동의 화면 주소를 준다 (프런트가 이동시킨다). */
export const startConnect = async (req, res) => {
  try {
    if (!isDriveConfigured()) {
      return res.status(503).json({ error: 'Google Drive 연동이 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
    }
    res.json({ url: buildAuthUrl(signState(req.user.id)) });
  } catch (error) {
    console.error('Drive 연결 시작 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/**
 * GET /api/drive/callback — Google 이 브라우저를 여기로 보낸다.
 * 헤더 토큰이 없으므로 state 안의 서명된 사용자 id 를 믿는다.
 */
export const handleCallback = async (req, res) => {
  const redirect = (result) => res.redirect(`${APP_URL}/settings?drive=${result}`);

  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) return redirect('denied');
    if (!code || !state) return redirect('error');

    const userId = verifyState(state);
    if (!userId) return redirect('expired');

    const tokens = await exchangeCode(code);
    if (!tokens.refreshToken) {
      // refresh token 이 없으면 다음 갱신에서 반드시 끊긴다. 다시 동의를 받게 한다.
      const existing = await GoogleDriveAccount.getByUserId(userId);
      if (!existing?.refreshToken) return redirect('norefresh');
    }

    await GoogleDriveAccount.upsert({
      userId,
      googleSub: tokens.googleSub,
      googleEmail: tokens.googleEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: expiryFromNow(tokens.expiresIn)
    });

    await ensureRootFolder(userId);
    redirect('connected');
  } catch (error) {
    console.error('Drive 연결 오류:', error?.message || error);
    redirect('error');
  }
};

/** PATCH /api/drive/account — 루트 폴더 이름 변경 */
export const updateAccount = async (req, res) => {
  try {
    const name = String(req.body?.rootFolderName || '').trim();
    if (!name || name.length > 60) {
      return res.status(400).json({ error: '폴더 이름은 1~60자로 입력해 주세요.' });
    }

    const account = await GoogleDriveAccount.getByUserId(req.user.id);
    if (!account) return res.status(400).json({ error: 'Google Drive 가 연결되어 있지 않습니다.' });

    if (account.rootFolderId) {
      await runWithDrive(req.user.id, (accessToken) => renameFile(accessToken, account.rootFolderId, name));
    }
    const updated = await GoogleDriveAccount.setRootFolder(req.user.id, { rootFolderName: name });
    res.json(GoogleDriveAccount.presentable(updated));
  } catch (error) {
    if (error instanceof DriveError) {
      console.error('Drive 폴더 이름 변경 실패:', error.message);
      return res.status(400).json({ error: 'Google Drive 폴더 이름을 바꾸지 못했습니다. 연결 상태를 확인해 주세요.' });
    }
    console.error('Drive 연결 수정 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

/** DELETE /api/drive/account — 연결 해제. Drive 의 파일은 그대로 둔다. */
export const disconnect = async (req, res) => {
  try {
    const account = await GoogleDriveAccount.getByUserId(req.user.id);
    if (!account) return res.status(404).json({ error: '연결된 Google 계정이 없습니다.' });

    await revokeToken(account.refreshToken || account.accessToken);
    await GoogleDriveAccount.delete(req.user.id);

    // 이전 연결로 만든 앨범은 남지만 업로드는 막힌다 (events.driveAccountId 가 NULL 이 된다).
    const orphaned = await Event.listByDriveAccount(account.id);
    res.json({ message: 'Google Drive 연결을 해제했습니다.', albums: orphaned.length });
  } catch (error) {
    console.error('Drive 연결 해제 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

export default { getAccount, startConnect, handleCallback, updateAccount, disconnect, signState, verifyState };
