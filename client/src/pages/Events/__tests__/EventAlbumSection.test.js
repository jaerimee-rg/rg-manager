import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

// 테스트에서 실제 ML 을 돌리지 않는다.
jest.mock('../../../utils/faceClient', () => ({
  detectFaces: jest.fn(() => Promise.resolve([])),
  detectSingleFace: jest.fn(() => Promise.resolve({ ok: false, reason: 'none' })),
  loadFaceApi: jest.fn(() => Promise.resolve({}))
}));

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => {
    const react = require('react');
    return react.createElement('a', { href: to, ...rest }, children);
  }
}));

import { fetchWithAuth } from '../../../utils/api';
import EventAlbumSection from '../EventAlbumSection';

const EVENT = { id: 7, type: 'competition', title: '2026 서울시 리듬체조 대회', date: '2026-09-12' };

const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

const NO_ALBUM = {
  eventId: 7,
  albumStatus: 'none',
  driveFolderId: null,
  driveFolderName: null,
  folderUrl: null,
  albumUploadOpen: true,
  defaultFolderName: '2026-09-12 2026 서울시 리듬체조 대회',
  foreignAccount: false,
  drive: { configured: true, connected: true, status: 'connected', email: 'teacher@example.com', rootFolderName: 'RG Manager' },
  counts: { images: 0, videos: 0, hidden: 0, untagged: 0, candidates: 0, unanalyzed: 0 },
  totalSize: 0
};

const READY_ALBUM = {
  ...NO_ALBUM,
  albumStatus: 'ready',
  driveFolderId: 'folder-1',
  driveFolderName: '2026-09-12 2026 서울시 리듬체조 대회',
  folderUrl: 'https://drive.google.com/drive/folders/folder-1',
  counts: { images: 27, videos: 3, hidden: 1, untagged: 5, candidates: 2, unanalyzed: 4 },
  totalSize: 1932735283
};

const MEDIA = [
  {
    id: 101, kind: 'image',
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=a&sz=w400',
    largeUrl: 'https://drive.google.com/thumbnail?id=a&sz=w1600',
    originalUrl: 'https://drive.google.com/file/d/a/view',
    previewUrl: null, downloadUrl: 'https://drive.google.com/uc?export=download&id=a',
    fileName: 'IMG_4001.JPG', driveName: 'IMG_4001.JPG', size: 3200000,
    takenAt: '2026-09-12T01:12:00.000Z', uploaderRole: 'teacher', uploaderName: '선생님',
    isHidden: false, faceStatus: 'done', faceCount: 1,
    faces: [{ id: 1010, box: { x: 0.2, y: 0.2, w: 0.15, h: 0.2 }, score: 0.91 }],
    tags: [{ studentId: 1, name: '김하은', source: 'face', distance: 0.34, faceId: 1010 }]
  },
  {
    id: 102, kind: 'image',
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=b&sz=w400',
    largeUrl: 'https://drive.google.com/thumbnail?id=b&sz=w1600',
    originalUrl: 'https://drive.google.com/file/d/b/view',
    previewUrl: null, downloadUrl: 'https://drive.google.com/uc?export=download&id=b',
    fileName: 'IMG_4002.JPG', driveName: 'IMG_4002.JPG', size: 2100000,
    takenAt: '2026-09-12T02:41:00.000Z', uploaderRole: 'parent', uploaderName: '하은엄마',
    isHidden: false, faceStatus: 'none', faceCount: 0, faces: [], tags: []
  }
];

const STUDENTS = [{ id: 1, name: '김하은' }, { id: 2, name: '박서연' }];

/** 앨범/미디어/학생 응답을 주소별로 돌려준다. */
const respondWith = (album, { items = MEDIA, patch, create } = {}) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    const method = options.method || 'GET';

    if (url === '/api/events/7/album' && method === 'GET') return ok(album);
    if (url === '/api/events/7/album' && method === 'POST') return ok(create || { albumStatus: 'ready' });
    if (url === '/api/events/7/album' && method === 'PATCH') {
      return ok(patch || { ...JSON.parse(options.body), albumStatus: album.albumStatus });
    }
    if (url === '/api/events/7/album/refresh') return ok({ albumStatus: 'ready', checked: 3, missing: [] });
    if (url.startsWith('/api/events/7/media?')) return ok({ items, nextCursor: null });
    if (url === '/api/events/7/media/bulk') return ok({ affected: 1 });
    if (url === '/api/students') return ok(STUDENTS);
    return ok({});
  });
};

const renderSection = async (event = EVENT) => {
  await act(async () => {
    render(<EventAlbumSection event={event} />);
  });
};

const mediaCalls = () =>
  fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => String(url).startsWith('/api/events/7/media?'));

describe('EventAlbumSection — 앨범 만들기 전', () => {
  beforeEach(() => jest.clearAllMocks());

  it('closure 이벤트에는 앨범 영역을 그리지 않는다', async () => {
    respondWith(NO_ALBUM);
    await renderSection({ ...EVENT, type: 'closure' });

    expect(screen.queryByText(/사진 · 영상/)).not.toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('Drive 가 연결되어 있지 않으면 설정 안내를 보여주고 만들기 버튼이 없다', async () => {
    respondWith({ ...NO_ALBUM, drive: { configured: true, connected: false, status: 'none', email: null } });
    await renderSection();

    expect(screen.getByText(/설정에서 Google Drive 를 연결해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '설정으로 가기' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button', { name: /앨범 폴더 만들기/ })).not.toBeInTheDocument();
  });

  it('Drive 연동 자체가 설정되지 않았으면 관리자 안내를 보여준다', async () => {
    respondWith({ ...NO_ALBUM, drive: { configured: false, connected: false, status: 'none', email: null } });
    await renderSection();

    expect(screen.getByText(/관리자에게 문의해 주세요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /앨범 폴더 만들기/ })).not.toBeInTheDocument();
  });

  it('폴더 이름이 기본값으로 채워지고, 그 이름으로 앨범을 만든다', async () => {
    respondWith(NO_ALBUM);
    await renderSection();

    const input = screen.getByLabelText('폴더 이름');
    expect(input).toHaveValue('2026-09-12 2026 서울시 리듬체조 대회');

    fireEvent.change(input, { target: { value: '서울시 대회 앨범' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /앨범 폴더 만들기/ }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/album', {
      method: 'POST',
      body: JSON.stringify({ folderName: '서울시 대회 앨범' })
    });
  });
});

describe('EventAlbumSection — 앨범이 있을 때', () => {
  beforeEach(() => jest.clearAllMocks());

  it('폴더 경로와 통계를 보여준다', async () => {
    respondWith(READY_ALBUM);
    await renderSection();

    expect(screen.getByText('앨범 있음')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();     // 사진
    expect(screen.getByText('3')).toBeInTheDocument();      // 영상
    expect(screen.getByText('85%')).toBeInTheDocument();    // 얼굴 분석
    expect(screen.getByText('1.8GB')).toBeInTheDocument();  // 사용 용량
    expect(screen.getByRole('link', { name: 'Drive 에서 열기' }))
      .toHaveAttribute('href', 'https://drive.google.com/drive/folders/folder-1');
  });

  it('처음에는 filter=all 로 사진을 불러온다', async () => {
    respondWith(READY_ALBUM);
    await renderSection();

    expect(mediaCalls()).toContain('/api/events/7/media?filter=all&limit=60');
    expect(screen.getByText('김하은')).toBeInTheDocument();
    expect(screen.getByText('태그 없음')).toBeInTheDocument(); // 태그가 없는 사진의 뱃지
  });

  it('필터 칩을 누르면 그 filter 로 다시 불러온다', async () => {
    respondWith(READY_ALBUM);
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^태그 없음/ }));
    });

    expect(mediaCalls()).toContain('/api/events/7/media?filter=untagged&limit=60');
    expect(screen.getByRole('button', { name: /^태그 없음/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('학부모 업로드 받기 토글은 PATCH 로 보낸다', async () => {
    respondWith(READY_ALBUM, { patch: { albumUploadOpen: false, albumStatus: 'ready' } });
    await renderSection();

    const toggle = screen.getByLabelText('학부모 업로드 받기');
    expect(toggle).toBeChecked();

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/album', {
      method: 'PATCH',
      body: JSON.stringify({ albumUploadOpen: false })
    });
    expect(screen.getByLabelText('학부모 업로드 받기')).not.toBeChecked();
  });

  it('선택 모드에서 사진을 고르면 일괄 작업 바가 뜬다', async () => {
    respondWith(READY_ALBUM);
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '선택' }));
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });

    expect(screen.getByText('1개 선택')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '숨기기' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/events/7/media/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'hide', mediaIds: [101] })
    });
  });

  it('폴더가 사라지면 빨간 안내를 보여준다', async () => {
    respondWith({ ...READY_ALBUM, albumStatus: 'missing' });
    await renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('Drive 에서 폴더를 찾을 수 없습니다');
    expect(screen.getByRole('button', { name: /사진·영상 올리기/ })).toBeDisabled();
  });

  it('링크 공유가 꺼져 있으면 경고를 보여준다', async () => {
    respondWith({ ...READY_ALBUM, albumStatus: 'unshared' });
    await renderSection();

    expect(screen.getByText(/링크 공유가 꺼져/)).toBeInTheDocument();
  });

  it('Drive 연결이 끊어지면 안내와 함께 쓰기 버튼을 막는다', async () => {
    respondWith({
      ...READY_ALBUM,
      drive: { configured: true, connected: true, status: 'error', email: 'teacher@example.com' }
    });
    await renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('Google Drive 연결이 끊어져');
    expect(screen.getByRole('link', { name: '설정에서 다시 연결' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: /다시 매칭/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /새로고침/ })).not.toBeDisabled();
  });
});
