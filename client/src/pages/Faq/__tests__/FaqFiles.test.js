import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

const mockCopy = jest.fn().mockResolvedValue(true);
jest.mock('../../../utils/copyToClipboard', () => ({
  copyToClipboard: (...args) => mockCopy(...args)
}));

import { fetchWithAuth } from '../../../utils/api';
import FaqFiles from '../FaqFiles';

const URL_PDF =
  'https://vrzsommyxtvdqlpoufes.supabase.co/storage/v1/object/public/faq-files/3/uuid/%EC%88%98%EC%97%85%EC%95%88%EB%82%B4.pdf';

const FILES = [
  {
    id: 1,
    userId: 3,
    filename: '수업안내.pdf',
    kind: 'pdf',
    size: 204800,
    url: URL_PDF,
    createdAt: '2026-08-23T00:00:00.000Z'
  }
];

const jsonResponse = (data, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(data) });

const mockApi = ({ files = FILES, storageReady = true, upload, remove } = {}) => {
  fetchWithAuth.mockImplementation((url, options) => {
    if (options?.method === 'POST') return upload || jsonResponse({ filename: '새파일.pdf' });
    if (options?.method === 'DELETE') return remove || jsonResponse({ message: 'ok' });
    return jsonResponse({ files, storageReady });
  });
};

const renderPage = async (props = {}) => {
  await act(async () => {
    render(<FaqFiles onToast={jest.fn()} {...props} />);
  });
};

const makeFile = (name, type, size = 100) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('FaqFiles — 파일 업로드 탭', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    mockCopy.mockResolvedValue(true);
    mockApi();
  });

  it('올린 파일 목록을 파일 이름으로 보여준다', async () => {
    await renderPage();

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/faq-files');
    const link = screen.getByRole('link', { name: '수업안내.pdf' });
    expect(link).toHaveAttribute('href', URL_PDF);
  });

  it('파일 크기와 날짜를 보여준다', async () => {
    await renderPage();

    expect(screen.getByText(/200KB/)).toBeInTheDocument();
  });

  it('파일을 고르면 바이트를 그대로 올린다 (base64 로 감싸지 않는다)', async () => {
    await renderPage();

    const file = makeFile('공지.html', 'text/html');
    await act(async () => {
      fireEvent.change(screen.getByTestId('faq-file-input'), { target: { files: [file] } });
    });

    const call = fetchWithAuth.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(call[0]).toBe(`/api/faq-files?filename=${encodeURIComponent('공지.html')}`);
    expect(call[1].body).toBe(file);
  });

  it('4MB 를 넘으면 서버에 보내지 않고 막는다', async () => {
    const onToast = jest.fn();
    await renderPage({ onToast });

    const tooBig = makeFile('big.pdf', 'application/pdf', 5 * 1024 * 1024);
    await act(async () => {
      fireEvent.change(screen.getByTestId('faq-file-input'), { target: { files: [tooBig] } });
    });

    expect(fetchWithAuth.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('4MB'));
  });

  it('FAQ 링크 복사는 파일 이름이 보이는 형식으로 복사한다', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'FAQ 링크 복사' }));

    expect(mockCopy).toHaveBeenCalledWith(`[수업안내.pdf](${URL_PDF})`);
  });

  it('주소만 복사도 따로 제공한다', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: '주소만' }));

    expect(mockCopy).toHaveBeenCalledWith(URL_PDF);
  });

  it('삭제 전에 FAQ 링크가 끊긴다는 것을 알린다', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });

    expect(window.confirm.mock.calls[0][0]).toContain('열리지 않게');
    expect(fetchWithAuth.mock.calls.some(([u, o]) => o?.method === 'DELETE' && u === '/api/faq-files/1')).toBe(true);
  });

  it('취소하면 지우지 않는다', async () => {
    window.confirm = jest.fn(() => false);
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });

    expect(fetchWithAuth.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
  });

  it('저장소가 설정되지 않았으면 안내하고 업로드를 막는다', async () => {
    mockApi({ storageReady: false });
    await renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('파일 저장소가 설정되지 않아');
    expect(screen.getByRole('button', { name: '파일 선택' })).toBeDisabled();
  });

  it('올린 파일이 없으면 안내 문구를 보여준다', async () => {
    mockApi({ files: [] });
    await renderPage();

    expect(screen.getByText('올린 파일이 없습니다')).toBeInTheDocument();
  });

  it('업로드 실패 사유를 그대로 알려준다', async () => {
    const onToast = jest.fn();
    mockApi({ upload: jsonResponse({ error: '허용되지 않는 형식입니다.' }, false) });
    await renderPage({ onToast });

    await act(async () => {
      fireEvent.change(screen.getByTestId('faq-file-input'), {
        target: { files: [makeFile('a.js', 'text/javascript')] }
      });
    });

    expect(onToast).toHaveBeenCalledWith('허용되지 않는 형식입니다.');
  });

  it('관리자 화면에서는 사용자로 걸러 부른다', async () => {
    await renderPage({ filterUserId: '3', userName: () => '문아람' });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/faq-files?filterUserId=3');
  });
});
