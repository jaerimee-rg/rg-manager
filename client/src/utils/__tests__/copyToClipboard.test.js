import { copyToClipboard } from '../copyToClipboard';

describe('copyToClipboard', () => {
  const originalClipboard = navigator.clipboard;
  const originalSecureContext = window.isSecureContext;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: originalSecureContext,
      configurable: true
    });
    delete document.execCommand;
    jest.restoreAllMocks();
  });

  const setClipboard = (impl) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: impl ? { writeText: impl } : undefined,
      configurable: true
    });
  };

  const setSecure = (value) => {
    Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
  };

  it('HTTPS 환경에서는 clipboard API 를 사용한다', async () => {
    const writeText = jest.fn().mockResolvedValue();
    setClipboard(writeText);
    setSecure(true);

    const result = await copyToClipboard('https://example.com/chat/abc');

    expect(writeText).toHaveBeenCalledWith('https://example.com/chat/abc');
    expect(result).toBe(true);
  });

  it('clipboard API 가 없으면 execCommand 로 폴백한다', async () => {
    setClipboard(undefined);
    setSecure(false);
    document.execCommand = jest.fn().mockReturnValue(true);

    const result = await copyToClipboard('링크');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('clipboard API 가 거부되면 execCommand 로 폴백한다', async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error('denied')));
    setSecure(true);
    document.execCommand = jest.fn().mockReturnValue(true);

    const result = await copyToClipboard('링크');

    expect(document.execCommand).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('복사에 실패하면 false 를 반환한다', async () => {
    setClipboard(undefined);
    setSecure(false);
    document.execCommand = jest.fn(() => {
      throw new Error('unsupported');
    });

    const result = await copyToClipboard('링크');

    expect(result).toBe(false);
  });

  it('폴백에 사용한 임시 textarea 를 남기지 않는다', async () => {
    setClipboard(undefined);
    setSecure(false);
    document.execCommand = jest.fn().mockReturnValue(true);

    await copyToClipboard('링크');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
