import { jest } from '@jest/globals';

const {
  buildAuthUrl,
  exchangeCode,
  decodeIdToken,
  refreshAccessToken,
  createFolder,
  shareAnyoneReader,
  isSharedWithAnyone,
  getFile,
  trashFile,
  getStorageQuota,
  createResumableSession,
  isDriveConfigured,
  DriveError
} = await import('../googleDrive.js');

const jsonResponse = (data, { ok = true, status = 200, headers = {} } = {}) => ({
  ok,
  status,
  json: async () => data,
  headers: { get: (key) => headers[key.toLowerCase()] ?? null }
});

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://rg-manager.vercel.app/api/drive/callback';
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
});

describe('isDriveConfigured', () => {
  it('클라이언트 정보가 있어야 연동을 켠다', () => {
    expect(isDriveConfigured()).toBe(true);
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(isDriveConfigured()).toBe(false);
  });
});

describe('buildAuthUrl', () => {
  it('drive.file 범위만 요청한다 (Google 검수가 필요 없는 범위)', () => {
    const url = new URL(buildAuthUrl('state-123'));
    expect(url.searchParams.get('scope')).toContain('drive.file');
    expect(url.searchParams.get('scope')).not.toContain('drive.readonly');
  });

  it('refresh token 을 받도록 offline·consent 를 붙인다', () => {
    const url = new URL(buildAuthUrl('s'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('s');
  });
});

describe('decodeIdToken', () => {
  it('payload 에서 이메일과 sub 를 읽는다', () => {
    const payload = Buffer.from(JSON.stringify({ sub: '123', email: 'a@b.com' })).toString('base64url');
    expect(decodeIdToken(`header.${payload}.sig`)).toEqual({ sub: '123', email: 'a@b.com' });
  });

  it('깨진 토큰에도 터지지 않는다', () => {
    expect(decodeIdToken('nonsense')).toEqual({});
    expect(decodeIdToken(null)).toEqual({});
  });
});

describe('exchangeCode', () => {
  it('토큰과 계정 정보를 함께 돌려준다', async () => {
    const idToken = `h.${Buffer.from(JSON.stringify({ sub: 'sub-1', email: 'teacher@gmail.com' })).toString('base64url')}.s`;
    global.fetch.mockResolvedValue(jsonResponse({
      access_token: 'at', refresh_token: 'rt', expires_in: 3599, id_token: idToken
    }));

    const result = await exchangeCode('code-1');

    expect(result).toEqual({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 3599,
      googleSub: 'sub-1', googleEmail: 'teacher@gmail.com'
    });
  });

  it('실패하면 DriveError 로 바꿔 던진다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, { ok: false, status: 400 }));

    await expect(exchangeCode('bad')).rejects.toMatchObject({ name: 'DriveError', code: 'invalid_grant' });
  });
});

describe('refreshAccessToken', () => {
  it('새 access token 을 받는다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ access_token: 'new', expires_in: 3600 }));

    await expect(refreshAccessToken('rt')).resolves.toEqual({ accessToken: 'new', expiresIn: 3600 });
  });

  it('권한이 철회되면 invalid_grant 로 알려준다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'invalid_grant', error_description: '철회됨' }, { ok: false, status: 400 }));

    await expect(refreshAccessToken('rt')).rejects.toMatchObject({ code: 'invalid_grant' });
  });
});

describe('createFolder', () => {
  it('부모 폴더 아래에 폴더를 만든다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 'folder-1', name: '대회' }));

    const result = await createFolder('at', { name: '대회', parentId: 'root-1' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/drive/v3/files');
    expect(JSON.parse(options.body)).toEqual({
      name: '대회', mimeType: 'application/vnd.google-apps.folder', parents: ['root-1']
    });
    expect(options.headers.Authorization).toBe('Bearer at');
    expect(result.id).toBe('folder-1');
  });

  it('부모가 없으면 내 드라이브 최상위에 만든다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 'root-1', name: 'RG Manager' }));

    await createFolder('at', { name: 'RG Manager' });

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).parents).toBeUndefined();
  });

  it('용량이 부족하면 quota 로 알려준다', async () => {
    global.fetch.mockResolvedValue(jsonResponse(
      { error: { errors: [{ reason: 'storageQuotaExceeded' }], message: 'full' } },
      { ok: false, status: 403 }
    ));

    await expect(createFolder('at', { name: 'x' })).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('공유 설정', () => {
  it('링크가 있는 모든 사용자에게 보기 권한을 준다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 'perm-1' }));

    await shareAnyoneReader('at', 'folder-1');

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ type: 'anyone', role: 'reader' });
  });

  it('공유가 켜져 있는지 판정한다', () => {
    expect(isSharedWithAnyone({ permissions: [{ type: 'anyone', role: 'reader' }] })).toBe(true);
    expect(isSharedWithAnyone({ permissions: [{ type: 'user', role: 'writer' }] })).toBe(false);
    expect(isSharedWithAnyone(null)).toBe(false);
  });
});

describe('getFile', () => {
  it('없는 파일은 not_found 다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: { message: 'File not found' } }, { ok: false, status: 404 }));

    await expect(getFile('at', 'gone')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('필요한 필드를 요청한다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 'f1', parents: ['folder-1'] }));

    await getFile('at', 'f1');

    expect(decodeURIComponent(global.fetch.mock.calls[0][0])).toContain('parents');
  });
});

describe('trashFile', () => {
  it('영구 삭제가 아니라 휴지통으로 보낸다 (30일 안에 복구 가능)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: 'f1', trashed: true }));

    await trashFile('at', 'f1');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ trashed: true });
  });
});

describe('getStorageQuota', () => {
  it('남은 용량을 계산해 준다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({
      storageQuota: { limit: '15000000000', usage: '4200000000' },
      user: { emailAddress: 'a@b.com' }
    }));

    await expect(getStorageQuota('at')).resolves.toEqual({
      limit: 15000000000, usage: 4200000000, remaining: 10800000000, email: 'a@b.com'
    });
  });

  it('무제한 계정이면 한도를 null 로 둔다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ storageQuota: { usage: '100' } }));

    const quota = await getStorageQuota('at');
    expect(quota.limit).toBeNull();
    expect(quota.remaining).toBeNull();
  });
});

describe('createResumableSession', () => {
  it('세션 주소를 돌려주고, 브라우저가 직접 올릴 수 있게 Origin 을 보낸다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, { headers: { location: 'https://upload.google/session-1' } }));

    const uri = await createResumableSession('at', {
      name: '20260912_하은_a.jpg', parentId: 'folder-1', mimeType: 'image/jpeg', size: 1234, origin: 'https://rg-manager.vercel.app'
    });

    expect(uri).toBe('https://upload.google/session-1');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('uploadType=resumable');
    expect(options.headers.Origin).toBe('https://rg-manager.vercel.app');
    expect(options.headers['X-Upload-Content-Length']).toBe('1234');
    expect(JSON.parse(options.body)).toEqual({ name: '20260912_하은_a.jpg', parents: ['folder-1'] });
  });

  it('세션 주소가 없으면 오류다', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, { headers: {} }));

    await expect(createResumableSession('at', { name: 'a', parentId: 'p', mimeType: 'image/jpeg', size: 1 }))
      .rejects.toBeInstanceOf(DriveError);
  });
});
