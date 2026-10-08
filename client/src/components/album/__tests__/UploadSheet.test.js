import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn().mockResolvedValue([]) }));
jest.mock('../../../utils/driveUpload', () => ({
  uploadToDrive: jest.fn().mockResolvedValue({ ok: true, file: { id: 'drive-1' } })
}));
jest.mock('../../../utils/imagePrep', () => ({
  MAX_FILES: 30,
  partitionFiles: (list) => ({ accepted: Array.from(list).map((file) => ({ file, kind: 'image' })), rejected: [] }),
  readTakenAt: jest.fn().mockResolvedValue('2026-10-12T01:00:00Z'),
  makePreview: jest.fn().mockResolvedValue(null)
}));

import { fetchWithAuth } from '../../../utils/api';
import UploadSheet from '../UploadSheet';

const TARGETS = [
  { eventId: 40, title: '전국 꿈나무 대회', date: '2026-11-20', type: 'competition', upcoming: true, hasAlbum: false, published: false, count: 0, folderName: '2026-11-20 전국 꿈나무 대회' },
  { eventId: 31, title: '회장배 대회', date: '2026-10-12', type: 'competition', upcoming: false, hasAlbum: true, published: true, count: 45, folderName: '2026-10-12 회장배 대회' },
  { eventId: 20, title: '여름 합동 공연', date: '2026-08-30', type: 'special', upcoming: false, hasAlbum: false, published: false, count: 0, folderName: '2026-08-30 여름 합동 공연' }
];

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => {
  jest.clearAllMocks();
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
    if (url.includes('/complete')) return ok({ media: {} });
    if (options.method === 'PATCH') return ok({ published: true });
    return ok({});
  });
});

const pickFile = async () => {
  const input = screen.getByTestId('album-file-input');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
  });
};

describe('UploadSheet — 이벤트 고르기 단계 (docs/photo-menu FR-513~515)', () => {
  it('targets 를 주면 "어느 이벤트 사진인가요?" 부터 보여 준다', () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    expect(screen.getByText('어느 이벤트 사진인가요? 고른 이벤트에 연결돼요. 없으면 새로 만들어요.')).toBeInTheDocument();
    // 새 폴더(이벤트) 만들기 + 이벤트 3개
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /전국 꿈나무 대회/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('예정')).toBeInTheDocument();
  });

  it('앨범 없는 이벤트는 새로 만들 폴더 이름과 "바로 공개" 체크를 보여 준다', () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    expect(screen.getByText('Drive 에 새로 만들 폴더')).toBeInTheDocument();
    expect(screen.getByText('2026-11-20 전국 꿈나무 대회')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /다 올리면 바로 학부모에게 공개/ })).not.toBeChecked();
  });

  it('공개 중인 앨범을 고르면 체크 대신 "바로 보여요" 안내', async () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /회장배 대회/ })); });

    expect(screen.getByText('올라갈 폴더')).toBeInTheDocument();
    expect(screen.getByText(/공개 중인 앨범이라 올리면 바로 학부모에게 보여요/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('고른 이벤트로 올리고, "바로 공개" 를 골랐으면 다 올린 뒤 공개한다', async () => {
    const onDone = jest.fn();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} onDone={onDone} />);

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /여름 합동 공연/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /다 올리면 바로 학부모에게 공개/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/20/media/uploads', expect.objectContaining({ method: 'POST' }));
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/20/album', { method: 'PATCH', body: JSON.stringify({ published: true }) });
    expect(onDone).toHaveBeenCalledWith({ eventId: 20, uploaded: 1, published: true });
    expect(screen.getByText(/학부모에게 공개했어요/)).toBeInTheDocument();
  });

  it('체크하지 않으면 공개하지 않는다', async () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/40/media/uploads', expect.anything());
    expect(fetchWithAuth.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('공개 요청이 실패하면 사진은 올라갔지만 비공개라고 따로 알린다', async () => {
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (url.endsWith('/media/uploads')) return ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
      if (url.includes('/complete')) return ok({ media: {} });
      if (options.method === 'PATCH') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return ok({});
    });
    const onDone = jest.fn();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} onDone={onDone} />);

    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /다 올리면 바로 학부모에게 공개/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(screen.getByText(/공개하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/학부모에게 공개했어요/)).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith({ eventId: 40, uploaded: 1, published: false });
  });

  it('공개를 고르지 않았으면 실패 안내도 없다', async () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(screen.queryByText(/공개하지 못했어요/)).not.toBeInTheDocument();
  });

  it('이벤트를 다시 고를 수 있다', async () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /이벤트 다시 고르기/ })); });

    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });
});

describe('UploadSheet — 새 폴더(이벤트) 만들기 (docs/photo-menu FR-517)', () => {
  const CREATED = {
    eventId: 50, title: '가을 소풍', date: '2026-09-27', type: 'special', upcoming: false,
    hasAlbum: false, published: false, count: 0, folderName: '2026-09-27 가을 소풍'
  };

  const mockServer = ({ create = () => ok({ created: true, target: CREATED }), uploads } = {}) => {
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (url === '/api/albums') return create();
      if (url.endsWith('/media/uploads')) return uploads ? uploads() : ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
      if (url.includes('/complete')) return ok({ media: {} });
      if (options.method === 'PATCH') return ok({ published: true });
      return ok({});
    });
  };

  const fillNewFolder = async ({ title = '가을 소풍', date = '2026-09-27' } = {}) => {
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /새 폴더\(이벤트\) 만들기/ })); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/이름/), { target: { value: title } }); });
    await act(async () => { fireEvent.change(screen.getByLabelText(/날짜/), { target: { value: date } }); });
  };

  const uploadOne = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });
  };

  it('이벤트가 하나도 없으면 새 폴더 만들기가 골라져 있고, 이름을 쓰기 전에는 [사진 고르기] 를 막는다', () => {
    render(<UploadSheet targets={[]} allowPublish onClose={() => {}} />);

    expect(screen.getByRole('radio', { name: /새 폴더\(이벤트\) 만들기/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/이벤트 관리에서 먼저 등록/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/이름/)).toHaveValue('');
    expect(screen.getByLabelText(/날짜/).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);   // 오늘
    expect(screen.getByRole('button', { name: '사진 고르기' })).toBeDisabled();
  });

  it('이름·날짜를 쓰면 Drive 에 만들 폴더 이름을 미리 보여 준다', async () => {
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await fillNewFolder({ title: '스페셜: 리본' });

    expect(screen.getByText('Drive 에 새로 만들 폴더')).toBeInTheDocument();
    expect(screen.getByText('2026-09-27 스페셜 리본')).toBeInTheDocument();
    expect(screen.getByText(/신청을 받지 않는 스페셜 이벤트로 함께 만들어져요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 고르기' })).toBeEnabled();
  });

  it('[사진 고르기] 만으로는 이벤트를 만들지 않는다 — 파일을 고르다 그만두면 빈 이벤트가 남지 않게', async () => {
    mockServer();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await fillNewFolder();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '사진 고르기' })); });
    await pickFile();

    expect(screen.getByText('가을 소풍 앨범에 올려요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('[올리기] 를 누르면 이벤트를 만들고 그 이벤트로 올린 뒤, 골랐으면 공개한다', async () => {
    mockServer();
    const onDone = jest.fn();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} onDone={onDone} />);

    await fillNewFolder();
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /다 올리면 바로 학부모에게 공개/ })); });
    await uploadOne();

    expect(fetchWithAuth.mock.calls[0]).toEqual(['/api/albums', {
      method: 'POST', body: JSON.stringify({ title: '가을 소풍', date: '2026-09-27' })
    }]);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/50/media/uploads', expect.objectContaining({ method: 'POST' }));
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/50/media/9/complete', expect.anything());
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/50/album', { method: 'PATCH', body: JSON.stringify({ published: true }) });
    expect(onDone).toHaveBeenCalledWith({ eventId: 50, uploaded: 1, published: true });
  });

  it('같은 이름·날짜의 이벤트가 이미 있어 서버가 그것을 주면, 공개 중이면 다시 공개하지 않는다', async () => {
    mockServer({ create: () => ok({ created: false, target: { ...CREATED, eventId: 31, hasAlbum: true, published: true } }) });
    const onDone = jest.fn();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} onDone={onDone} />);

    await fillNewFolder();
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /다 올리면 바로 학부모에게 공개/ })); });
    await uploadOne();

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/31/media/uploads', expect.anything());
    expect(fetchWithAuth.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
    expect(onDone).toHaveBeenCalledWith({ eventId: 31, uploaded: 1, published: true });
  });

  it('이벤트를 만들지 못하면 서버 안내를 보여 주고 올리지 않는다', async () => {
    mockServer({ create: () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: '날짜를 선택해 주세요.' }) }) });
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await fillNewFolder();
    await uploadOne();

    expect(screen.getByText('날짜를 선택해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled();
    expect(fetchWithAuth.mock.calls.some(([url]) => url.endsWith('/media/uploads'))).toBe(false);
  });

  it('이벤트를 만든 뒤 업로드가 실패해 다시 올려도 이벤트는 한 번만 만든다', async () => {
    let attempts = 0;
    mockServer({
      uploads: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'Google 연결을 확인해 주세요.' }) })
          : ok({ items: [{ name: 'a.jpg', mediaId: 9, sessionUri: 'https://upload' }] });
      }
    });
    const onDone = jest.fn();
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} onDone={onDone} />);

    await fillNewFolder();
    await uploadOne();
    expect(screen.getByText('Google 연결을 확인해 주세요.')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1개 올리기' })); });

    expect(fetchWithAuth.mock.calls.filter(([url]) => url === '/api/albums')).toHaveLength(1);
    expect(onDone).toHaveBeenCalledWith({ eventId: 50, uploaded: 1, published: false });
  });

  it('만든 이벤트는 다시 고르기 목록 맨 위에 골라진 채로 있다', async () => {
    mockServer({ uploads: () => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: '실패' }) }) });
    render(<UploadSheet targets={TARGETS} allowPublish onClose={() => {}} />);

    await fillNewFolder();
    await uploadOne();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /이벤트 다시 고르기/ })); });

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios[1]).toHaveTextContent('가을 소풍');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });
});

describe('UploadSheet — 학부모(기존 사용법)', () => {
  it('targets 없이 쓰면 바로 파일 고르기이고 공개 체크가 없다', () => {
    render(<UploadSheet apiBase="/api/parent/events/31" eventTitle="회장배 대회" onClose={() => {}} />);

    expect(screen.getByText('회장배 대회 앨범에 올려요')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
