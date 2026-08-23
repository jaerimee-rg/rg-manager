import { jest } from '@jest/globals';

jest.unstable_mockModule('../../models/GoogleDriveAccount.js', () => ({
  default: {
    getByUserId: jest.fn(),
    updateTokens: jest.fn(),
    markError: jest.fn(),
    setRootFolder: jest.fn()
  }
}));

jest.unstable_mockModule('../../utils/googleDrive.js', () => {
  class DriveError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.name = 'DriveError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    DriveError,
    refreshAccessToken: jest.fn(),
    createFolder: jest.fn(),
    getFile: jest.fn(),
    isDriveConfigured: jest.fn(() => true)
  };
});

const GoogleDriveAccount = (await import('../../models/GoogleDriveAccount.js')).default;
const { refreshAccessToken, createFolder, getFile, isDriveConfigured, DriveError } = await import('../../utils/googleDrive.js');
const { isExpired, getAccessToken, ensureRootFolder, runWithDrive } = await import('../driveAccess.js');

const future = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

const account = (overrides = {}) => ({
  id: 1,
  userId: 7,
  googleEmail: 'teacher@gmail.com',
  accessToken: 'at',
  refreshToken: 'rt',
  tokenExpiresAt: future(),
  rootFolderId: 'root-1',
  rootFolderName: 'RG Manager',
  status: 'connected',
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  isDriveConfigured.mockReturnValue(true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('isExpired', () => {
  it('만료 1분 전이면 만료된 것으로 본다 (요청 중 만료를 피한다)', () => {
    expect(isExpired(new Date(Date.now() + 30 * 1000).toISOString())).toBe(true);
    expect(isExpired(new Date(Date.now() + 10 * 60 * 1000).toISOString())).toBe(false);
  });

  it('값이 없거나 이상하면 만료로 본다', () => {
    expect(isExpired(null)).toBe(true);
    expect(isExpired('언젠가')).toBe(true);
  });
});

describe('getAccessToken', () => {
  it('아직 유효하면 그대로 쓴다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());

    await expect(getAccessToken(7)).resolves.toMatchObject({ ok: true, accessToken: 'at' });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('만료됐으면 갱신해서 저장한다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account({ tokenExpiresAt: past() }));
    refreshAccessToken.mockResolvedValue({ accessToken: 'new-at', expiresIn: 3600 });
    GoogleDriveAccount.updateTokens.mockResolvedValue(account({ accessToken: 'new-at' }));

    const result = await getAccessToken(7);

    expect(result).toMatchObject({ ok: true, accessToken: 'new-at' });
    expect(GoogleDriveAccount.updateTokens).toHaveBeenCalledWith(7, expect.objectContaining({ accessToken: 'new-at' }));
  });

  it('권한이 철회되면 상태를 error 로 남긴다 (화면 배너용)', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account({ tokenExpiresAt: past() }));
    refreshAccessToken.mockRejectedValue(new DriveError('invalid_grant', '철회됨'));
    GoogleDriveAccount.markError.mockResolvedValue(account({ status: 'error' }));

    const result = await getAccessToken(7);

    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect(GoogleDriveAccount.markError).toHaveBeenCalledWith(7, '철회됨');
  });

  it('연결한 적이 없으면 not_connected', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await expect(getAccessToken(7)).resolves.toMatchObject({ ok: false, reason: 'not_connected' });
  });

  it('환경변수가 없으면 not_configured (연결 시도 자체를 막는다)', async () => {
    isDriveConfigured.mockReturnValue(false);

    await expect(getAccessToken(7)).resolves.toMatchObject({ ok: false, reason: 'not_configured' });
    expect(GoogleDriveAccount.getByUserId).not.toHaveBeenCalled();
  });

  it('이미 error 상태면 다시 갱신을 시도하지 않는다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account({ status: 'error' }));

    await expect(getAccessToken(7)).resolves.toMatchObject({ ok: false, reason: 'error' });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('runWithDrive', () => {
  it('토큰을 넘겨 주고 결과를 돌려준다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());

    await expect(runWithDrive(7, async (token) => `ok:${token}`)).resolves.toBe('ok:at');
  });

  it('연결이 없으면 DriveError 를 던진다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(null);

    await expect(runWithDrive(7, async () => 'x')).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('호출 도중 인증이 깨지면 계정을 error 로 표시한다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());

    await expect(runWithDrive(7, async () => { throw new DriveError('unauthorized', '만료'); }))
      .rejects.toMatchObject({ code: 'unauthorized' });
    expect(GoogleDriveAccount.markError).toHaveBeenCalled();
  });

  it('그 밖의 오류는 상태를 건드리지 않는다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());

    await expect(runWithDrive(7, async () => { throw new DriveError('quota', '용량 부족'); }))
      .rejects.toMatchObject({ code: 'quota' });
    expect(GoogleDriveAccount.markError).not.toHaveBeenCalled();
  });
});

describe('ensureRootFolder', () => {
  it('저장된 폴더가 살아 있으면 그대로 쓴다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());
    getFile.mockResolvedValue({ id: 'root-1', name: 'RG Manager', trashed: false });

    await expect(ensureRootFolder(7)).resolves.toEqual({ id: 'root-1', name: 'RG Manager' });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('폴더가 사라졌으면 새로 만든다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());
    getFile.mockRejectedValue(new DriveError('not_found', '없음'));
    createFolder.mockResolvedValue({ id: 'root-2', name: 'RG Manager' });

    await expect(ensureRootFolder(7)).resolves.toEqual({ id: 'root-2', name: 'RG Manager' });
    expect(GoogleDriveAccount.setRootFolder).toHaveBeenCalledWith(7, { rootFolderId: 'root-2', rootFolderName: 'RG Manager' });
  });

  it('휴지통에 있는 폴더도 새로 만든다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account());
    getFile.mockResolvedValue({ id: 'root-1', name: 'RG Manager', trashed: true });
    createFolder.mockResolvedValue({ id: 'root-3', name: 'RG Manager' });

    await expect(ensureRootFolder(7)).resolves.toMatchObject({ id: 'root-3' });
  });

  it('처음 연결이면 만들어서 저장한다', async () => {
    GoogleDriveAccount.getByUserId.mockResolvedValue(account({ rootFolderId: null }));
    createFolder.mockResolvedValue({ id: 'root-9', name: 'RG Manager' });

    await ensureRootFolder(7);

    expect(getFile).not.toHaveBeenCalled();
    expect(createFolder).toHaveBeenCalledWith('at', { name: 'RG Manager' });
  });
});
