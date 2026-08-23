import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: {
    getByUserId: jest.fn(),
    upsert: jest.fn(),
    setRootFolder: jest.fn(),
    delete: jest.fn(),
    presentable: (account) => (account ? { connected: true, email: account.googleEmail, status: account.status } : { connected: false })
  }
}));

jest.unstable_mockModule('../../models/Event.js', () => ({
  default: { listByDriveAccount: jest.fn().mockResolvedValue([]) }
}));

jest.unstable_mockModule('../../utils/googleDrive.js', () => {
  class DriveError extends Error {
    constructor(code, message) { super(message); this.name = 'DriveError'; this.code = code; }
  }
  return {
    DriveError,
    isDriveConfigured: jest.fn(() => true),
    buildAuthUrl: jest.fn((state) => `https://accounts.google.com/auth?state=${state}`),
    exchangeCode: jest.fn(),
    revokeToken: jest.fn().mockResolvedValue(true),
    renameFile: jest.fn(),
    getStorageQuota: jest.fn().mockResolvedValue({ limit: 15e9, usage: 1e9, remaining: 14e9 })
  };
});

jest.unstable_mockModule('../../services/driveAccess.js', () => ({
  getAccessToken: jest.fn(),
  ensureRootFolder: jest.fn().mockResolvedValue({ id: 'root-1', name: 'RG Manager' }),
  expiryFromNow: jest.fn(() => '2026-09-12T10:00:00.000Z'),
  runWithDrive: jest.fn(async (userId, fn) => fn('at', {}))
}));

const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const { isDriveConfigured, exchangeCode, revokeToken, renameFile } = await import('../../utils/googleDrive.js');
const { getAccessToken, ensureRootFolder } = await import('../../services/driveAccess.js');
const {
  getAccount, startConnect, handleCallback, updateAccount, disconnect, signState, verifyState
} = await import('../driveController.js');

const teacher = { id: 7, username: '이재림', role: 'user' };
let req;
let res;

beforeEach(() => {
  jest.clearAllMocks();
  isDriveConfigured.mockReturnValue(true);
  process.env.JWT_SECRET = 'test-secret';
  req = { body: {}, params: {}, query: {}, user: { ...teacher } };
  res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis()
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('state 서명', () => {
  it('사용자에 묶인 state 를 만들고 되읽는다', () => {
    expect(verifyState(signState(7))).toBe(7);
  });

  it('남이 만든 값은 통과하지 못한다', () => {
    expect(verifyState('nonsense')).toBeNull();
  });
});

describe('getAccount', () => {
  it('연결 전에는 configured 만 알려준다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await getAccount(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ connected: false, configured: true }));
  });

  it('환경변수가 없으면 configured=false 로 화면이 안내하게 한다', async () => {
    isDriveConfigured.mockReturnValue(false);

    await getAccount(req, res);

    expect(res.json).toHaveBeenCalledWith({ connected: false, configured: false });
    expect(GoogleDriveAccount.getByUserId).not.toHaveBeenCalled();
  });

  it('연결돼 있으면 남은 용량도 함께 준다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue({ googleEmail: 'a@b.com', status: 'connected' });
    getAccessToken.mockResolvedValue({ ok: true, accessToken: 'at' });

    await getAccount(req, res);

    expect(res.json.mock.calls[0][0]).toMatchObject({ connected: true, quota: { remaining: 14e9 } });
  });

  it('용량 조회가 실패해도 연결 정보는 보여준다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue({ googleEmail: 'a@b.com', status: 'connected' });
    getAccessToken.mockRejectedValue(new Error('네트워크'));

    await getAccount(req, res);

    expect(res.json.mock.calls[0][0]).toMatchObject({ connected: true });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('토큰이 응답에 새지 않는다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue({ googleEmail: 'a@b.com', status: 'connected', accessToken: 'SECRET', refreshToken: 'SECRET2' });
    getAccessToken.mockResolvedValue({ ok: true, accessToken: 'at' });

    await getAccount(req, res);

    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('SECRET');
  });
});

describe('startConnect', () => {
  it('동의 화면 주소를 준다', async () => {
    await startConnect(req, res);

    expect(res.json.mock.calls[0][0].url).toContain('accounts.google.com');
  });

  it('설정이 없으면 503 으로 막는다', async () => {
    isDriveConfigured.mockReturnValue(false);

    await startConnect(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe('handleCallback', () => {
  it('코드를 교환하고 계정을 저장한 뒤 설정 화면으로 보낸다', async () => {
    req.query = { code: 'c', state: signState(7) };
    exchangeCode.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, googleSub: 's', googleEmail: 'a@b.com'
    });

    await handleCallback(req, res);

    expect(GoogleDriveAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, googleEmail: 'a@b.com' }));
    expect(ensureRootFolder).toHaveBeenCalledWith(7);
    expect(res.redirect.mock.calls[0][0]).toContain('drive=connected');
  });

  it('사용자가 거절하면 denied 로 돌려보낸다', async () => {
    req.query = { error: 'access_denied' };

    await handleCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain('drive=denied');
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('state 가 만료되면 저장하지 않는다', async () => {
    req.query = { code: 'c', state: 'stale' };

    await handleCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain('drive=expired');
    expect(GoogleDriveAccount.upsert).not.toHaveBeenCalled();
  });

  it('refresh token 을 못 받고 기존 것도 없으면 다시 동의를 받게 한다', async () => {
    req.query = { code: 'c', state: signState(7) };
    exchangeCode.mockResolvedValue({ accessToken: 'at', refreshToken: '', expiresIn: 3600, googleSub: 's', googleEmail: 'a@b.com' });
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await handleCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain('drive=norefresh');
    expect(GoogleDriveAccount.upsert).not.toHaveBeenCalled();
  });

  it('교환이 실패해도 화면은 안내로 끝난다 (500 을 던지지 않는다)', async () => {
    req.query = { code: 'c', state: signState(7) };
    exchangeCode.mockRejectedValue(new Error('boom'));

    await handleCallback(req, res);

    expect(res.redirect.mock.calls[0][0]).toContain('drive=error');
  });
});

describe('updateAccount', () => {
  it('Drive 폴더 이름도 함께 바꾼다', async () => {
    req.body = { rootFolderName: '우리학원 사진' };
    GoogleDriveAccount.getByUserId.mockResolvedValue({ rootFolderId: 'root-1', googleEmail: 'a@b.com', status: 'connected' });
    GoogleDriveAccount.setRootFolder.mockResolvedValue({ googleEmail: 'a@b.com', status: 'connected' });

    await updateAccount(req, res);

    expect(renameFile).toHaveBeenCalledWith('at', 'root-1', '우리학원 사진');
    expect(GoogleDriveAccount.setRootFolder).toHaveBeenCalledWith(7, { rootFolderName: '우리학원 사진' });
  });

  it('빈 이름은 막는다', async () => {
    req.body = { rootFolderName: '   ' };

    await updateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('연결이 없으면 400', async () => {
    req.body = { rootFolderName: 'x' };
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await updateAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('disconnect', () => {
  it('토큰을 무효화하고 행을 지운다 (Drive 의 사진은 남는다)', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue({ id: 3, refreshToken: 'rt' });

    await disconnect(req, res);

    expect(revokeToken).toHaveBeenCalledWith('rt');
    expect(GoogleDriveAccount.delete).toHaveBeenCalledWith(7);
    expect(res.json.mock.calls[0][0]).toMatchObject({ albums: 0 });
  });

  it('연결이 없으면 404', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await disconnect(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
