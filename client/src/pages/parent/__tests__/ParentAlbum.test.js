import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/copyToClipboard', () => ({ copyToClipboard: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../utils/faceClient', () => ({ detectFaces: jest.fn(), detectSingleFace: jest.fn() }));
jest.mock('../../../utils/faceCrops', () => ({ cropFaces: jest.fn((url, covers) => Promise.resolve(covers.map(() => 'data:image/jpeg;base64,x'))) }));

import { fetchWithAuth } from '../../../utils/api';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import ParentAlbum from '../ParentAlbum';

const media = (overrides = {}) => ({
  id: 1,
  kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w400',
  largeUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w1600',
  originalUrl: 'https://drive.google.com/file/d/f1/view',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=f1',
  previewUrl: null,
  fileName: 'IMG_1.jpg',
  takenAt: '2026-09-12T10:24:00',
  uploader: 'teacher',
  canDelete: false,
  myTags: [],
  ...overrides
});

const payload = (overrides = {}) => ({
  event: { id: 3, title: '서울시 대회', date: '2026-09-12', uploadOpen: true, albumStatus: 'ready' },
  children: [{ studentId: 5, name: '김하은' }],
  items: [media({ id: 1 }), media({ id: 2, kind: 'video', durationMs: 64000 })],
  candidates: [],
  nextCursor: null,
  ...overrides
});

const jsonResponse = (data, { ok = true, status = 200 } = {}) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(data) });

const renderAlbum = async (entry = '/parent/photos/3') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/parent/photos/:eventId" element={<ParentAlbum />} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
});

describe('ParentAlbum', () => {
  it('앨범을 열면 사진이 갤러리로 보인다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum();

    expect(screen.getByText('서울시 대회')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
  });

  it('우리 아이 사진만 보기를 켜면 mine=1 로 다시 불러온다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    const urls = fetchWithAuth.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes('mine=1'))).toBe(true);
  });

  it('영상 칩을 누르면 영상만 남는다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /영상 1/ }));
    });

    expect(screen.getAllByRole('button', { name: '영상 열기' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '사진 열기' })).not.toBeInTheDocument();
  });

  it('사진을 누르면 뷰어가 열리고 저장 버튼이 원본 주소를 가리킨다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });

    const viewer = screen.getByRole('dialog', { name: '사진 보기' });
    expect(viewer).toBeInTheDocument();
    const save = screen.getByRole('link', { name: /저장/ });
    expect(save).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=f1');
  });

  it('선생님이 붙인 설명이 뷰어 아래쪽에 보인다 — 학부모는 고칠 수 없다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({
      items: [media({ id: 1, caption: '단체전 결승 무대' }), media({ id: 2, kind: 'video', caption: '개인전 곤봉' })]
    })));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });
    expect(screen.getByTestId('media-caption')).toHaveTextContent('단체전 결승 무대');
    expect(screen.queryByRole('button', { name: /설명 (추가|수정)/ })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId('media-caption')).toHaveTextContent('개인전 곤봉');
  });

  it('내가 올린 사진에만 삭제가 보인다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({
      items: [media({ id: 1, uploader: 'me', canDelete: true })]
    })));
    await renderAlbum();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: '사진 열기' })[0]);
    });

    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('미확정이면 안내 화면을 보여준다', async () => {
    fetchWithAuth.mockImplementation(() =>
      jsonResponse({ error: '자녀가 확정된 이벤트의 사진만 볼 수 있어요.', reason: 'not_confirmed' }, { ok: false, status: 403 }));

    await renderAlbum();

    expect(screen.getByText('아직 사진을 볼 수 없어요')).toBeInTheDocument();
    expect(screen.getByText(/확정된 이벤트의 사진만/)).toBeInTheDocument();
  });

  it('선생님이 공개하지 않은 앨범이면 기다려 달라는 안내 (docs/photo-menu FR-541)', async () => {
    fetchWithAuth.mockImplementation(() =>
      jsonResponse({ error: '선생님이 아직 공개하지 않은 앨범이에요.', reason: 'album_private' }, { ok: false, status: 403 }));

    await renderAlbum();

    expect(screen.getByText('선생님이 아직 공개하지 않은 앨범이에요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사진 목록으로' })).toBeInTheDocument();
    expect(screen.queryByText(/신청 후 선생님이 확정하면/)).not.toBeInTheDocument();
  });

  it('이벤트 상세에서 누른 사진(?open=)은 바로 크게 열린다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum('/parent/photos/3?open=2');

    expect(screen.getByRole('dialog', { name: '사진 보기' })).toBeInTheDocument();
  });

  it('업로드가 마감이면 올리기 버튼이 잠긴다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({
      event: { id: 3, title: '서울시 대회', date: '2026-09-12', uploadOpen: false }
    })));

    await renderAlbum();

    expect(screen.getByRole('button', { name: '업로드 마감' })).toBeDisabled();
  });

  it('혹시 우리 아이? 후보에서 맞아요를 누르면 확인을 보낸다', async () => {
    fetchWithAuth.mockImplementation((url, options) => {
      if (options?.method === 'POST') return jsonResponse({ tag: { studentId: 5, source: 'parent_confirmed' } });
      return jsonResponse(payload({
        items: [],
        candidates: [media({ id: 9, myTags: [{ studentId: 5, name: '김하은', source: 'candidate' }] })]
      }));
    });

    await renderAlbum();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    expect(screen.getByText(/혹시 우리 아이/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '맞아요' }));
    });

    const call = fetchWithAuth.mock.calls.find(([url]) => url.includes('/confirm'));
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).toEqual({ studentId: 5, confirmed: true });
  });

  it('우리 아이만 켰는데 찾은 사진이 없으면 얼굴 등록을 안내한다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ items: [], candidates: [] })));

    await renderAlbum();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /우리 아이 사진만 보기/ }));
    });

    expect(screen.getByRole('button', { name: /얼굴 사진 등록하러 가기/ })).toBeInTheDocument();
  });
});

describe('ParentAlbum — 공유 링크의 초대 (docs/photo-menu FR-518)', () => {
  const notFound = () => jsonResponse({ error: '이벤트를 찾을 수 없습니다.' }, { ok: false, status: 404 });
  const inviteInfo = (teacherName) => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ valid: true, teacherName }) }));
  };
  const linkCalls = () => fetchWithAuth.mock.calls.filter(([url]) => url === '/api/parent/teachers');

  // 연결 전에는 404, [연결하고 사진 보기] 뒤에는 사진이 온다
  const serverThatLinks = () => {
    let linked = false;
    fetchWithAuth.mockImplementation((url) => {
      if (url === '/api/parent/teachers') { linked = true; return jsonResponse({ teachers: [], alreadyLinked: false }, { status: 201 }); }
      if (url.startsWith('/api/parent/events/3/media')) return linked ? jsonResponse(payload()) : notFound();
      return jsonResponse({});
    });
  };

  afterEach(() => { delete global.fetch; });

  it('이 선생님과 아직 연결되지 않았으면 누구의 사진인지 알리고 묻는다 — 링크를 눌렀다고 바로 연결하지 않는다', async () => {
    inviteInfo('이재림');
    serverThatLinks();

    await renderAlbum('/parent/photos/3?invite=tok');

    expect(global.fetch).toHaveBeenCalledWith('/api/invite/tok');
    expect(screen.getByText('이재림 선생님이 공유한 사진이에요')).toBeInTheDocument();
    expect(screen.getByText(/선생님의 학부모 목록에 내 이름이 보여요/)).toBeInTheDocument();
    expect(linkCalls()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /사진 열기/ })).not.toBeInTheDocument();
  });

  it('[연결하고 사진 보기] 를 누르면 그 초대로 연결한 뒤 사진을 다시 읽는다', async () => {
    inviteInfo('이재림');
    serverThatLinks();
    await renderAlbum('/parent/photos/3?invite=tok');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결하고 사진 보기' })); });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/teachers', { method: 'POST', body: JSON.stringify({ invite: 'tok' }) });
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
    expect(screen.queryByText(/공유한 사진이에요/)).not.toBeInTheDocument();
  });

  it('[취소] 를 누르면 연결하지 않고 사진 목록으로 간다', async () => {
    inviteInfo('이재림');
    serverThatLinks();
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/parent/photos/3?invite=tok']}>
          <Routes>
            <Route path="/parent/photos/:eventId" element={<ParentAlbum />} />
            <Route path="/parent/photos" element={<div>사진 목록</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '취소' })); });

    expect(linkCalls()).toHaveLength(0);
    expect(screen.getByText('사진 목록')).toBeInTheDocument();
  });

  it('연결에 실패하면 알리고 다시 묻지 않는다', async () => {
    inviteInfo('이재림');
    fetchWithAuth.mockImplementation((url) => {
      if (url === '/api/parent/teachers') return jsonResponse({ error: '유효하지 않은 초대 링크입니다.' }, { ok: false, status: 400 });
      return notFound();
    });
    await renderAlbum('/parent/photos/3?invite=tok');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '연결하고 사진 보기' })); });

    expect(linkCalls()).toHaveLength(1);
    expect(screen.getByText(/선생님과 연결하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연결하고 사진 보기' })).not.toBeInTheDocument();
  });

  it('이미 연결된 학부모에게는 묻지도 않고 초대를 쓰지도 않는다', async () => {
    inviteInfo('이재림');
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));

    await renderAlbum('/parent/photos/3?invite=tok');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(linkCalls()).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
  });

  it('초대가 죽었으면 묻지 않고 못 불러왔다고 알린다', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    fetchWithAuth.mockImplementation(() => notFound());

    await renderAlbum('/parent/photos/3?invite=gone');

    expect(linkCalls()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '연결하고 사진 보기' })).not.toBeInTheDocument();
    expect(screen.getByText(/사진을 불러오지 못했어요/)).toBeInTheDocument();
  });

  it('초대 없이 404 면 묻지 않는다', async () => {
    global.fetch = jest.fn();
    fetchWithAuth.mockImplementation(() => notFound());

    await renderAlbum('/parent/photos/3');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(linkCalls()).toHaveLength(0);
  });
});

describe('ParentAlbum — 학부모도 공유 링크를 복사한다 (docs/photo-menu FR-518)', () => {
  it('오른쪽 위 링크 아이콘을 누르면 선생님 것과 같은 공유 주소를 복사하고 알린다', async () => {
    copyToClipboard.mockResolvedValue(true);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ sharePath: '/parent/photos/3?invite=inv-tok' })));
    await renderAlbum();

    const button = screen.getByRole('button', { name: '공유 링크 복사' });
    expect(button.closest('.ui-mobile-app__head-action')).not.toBeNull();   // 제목 줄 오른쪽 끝
    await act(async () => { fireEvent.click(button); });

    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/photos/3?invite=inv-tok`);
    expect(screen.getByText(/공유 링크를 복사했어요/)).toBeInTheDocument();
  });

  it('서버가 공유 주소를 주지 않아도(옛 서버) 앨범 주소를 복사한다', async () => {
    copyToClipboard.mockResolvedValue(true);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유 링크 복사' })); });

    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/photos/3`);
  });

  it('복사가 막힌 브라우저에서는 주소를 그대로 보여 준다', async () => {
    copyToClipboard.mockResolvedValue(false);
    fetchWithAuth.mockImplementation(() => jsonResponse(payload({ sharePath: '/parent/photos/3?invite=inv-tok' })));
    await renderAlbum();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '공유 링크 복사' })); });

    expect(screen.getByText(`${window.location.origin}/parent/photos/3?invite=inv-tok`)).toBeInTheDocument();
  });

  it('볼 수 없는 앨범(미확정 · 비공개)에는 공유 아이콘이 없다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse({ error: '아직 볼 수 없어요', reason: 'not_confirmed' }, { ok: false, status: 403 }));
    await renderAlbum();

    expect(screen.queryByRole('button', { name: '공유 링크 복사' })).not.toBeInTheDocument();
  });
});

describe('ParentAlbum — 맨 위 얼굴 목록 (앨범의 사람마다 얼굴 하나)', () => {
  const cover = { url: 'https://lh3.googleusercontent.com/d/f1=s600', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
  const PEOPLE = [
    { key: 'p21', photoCount: 2, mine: true, cover },
    { key: 'p11', photoCount: 3, mine: false, cover }
  ];
  let peopleCalls;
  let missing;

  const serve = () => {
    peopleCalls = 0;
    missing = null;
    fetchWithAuth.mockImplementation((url) => {
      if (url.endsWith('/people')) { peopleCalls += 1; return jsonResponse({ people: PEOPLE }); }
      if (missing && url.includes(`person=${missing}`)) return jsonResponse(payload({ items: [], personMissing: true }));
      return jsonResponse(payload());
    });
  };
  const mediaUrls = () => fetchWithAuth.mock.calls.map(([url]) => url).filter((url) => url.includes('/media?'));
  const toggle = () => screen.getByRole('button', { name: /우리 아이 사진만 보기/ });

  it('앨범을 열면 맨 위에 얼굴이 우리 아이 먼저 보이고, 누르면 그 사람이 나온 사진만 불러온다', async () => {
    serve();
    await renderAlbum();

    const group = screen.getByRole('group', { name: '얼굴로 사진 찾기' });
    expect(group.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // 토글보다 위
    expect(screen.getByRole('button', { name: '우리 아이 · 사진 2장' })).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 3장' })); });

    expect(mediaUrls().at(-1)).toContain('person=p11');
    expect(screen.getByRole('button', { name: '얼굴 2 · 사진 3장' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('얼굴을 고르면 "우리 아이만" 은 꺼지고, "우리 아이만" 을 켜면 고른 얼굴은 풀린다', async () => {
    serve();
    await renderAlbum();

    await act(async () => { fireEvent.click(toggle()); });
    expect(mediaUrls().at(-1)).toContain('mine=1');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 3장' })); });
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(mediaUrls().at(-1)).toContain('person=p11');
    expect(mediaUrls().at(-1)).not.toContain('mine=1');

    await act(async () => { fireEvent.click(toggle()); });
    expect(mediaUrls().at(-1)).toContain('mine=1');
    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(screen.getByRole('button', { name: '모든 사진' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('고른 사람이 그 사이 묶음에서 사라졌으면 고른 것을 풀고 얼굴 목록을 다시 읽는다', async () => {
    serve();
    await renderAlbum();
    missing = 'p11';
    const before = peopleCalls;

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '얼굴 2 · 사진 3장' })); });

    expect(peopleCalls).toBeGreaterThan(before);
    expect(mediaUrls().at(-1)).not.toContain('person=');
    expect(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })).toHaveLength(2);
  });

  it('얼굴이 없는 앨범이면 목록을 그리지 않는다', async () => {
    fetchWithAuth.mockImplementation((url) => jsonResponse(url.endsWith('/people') ? { people: [] } : payload()));
    await renderAlbum();

    expect(screen.queryByRole('group', { name: '얼굴로 사진 찾기' })).not.toBeInTheDocument();
  });

  it('볼 수 없는 앨범이면 얼굴 목록을 묻지도 않는다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse({ error: '아직 공개하지 않은 앨범이에요', reason: 'album_private' }, { ok: false, status: 403 }));
    await renderAlbum();

    expect(fetchWithAuth.mock.calls.some(([url]) => url.endsWith('/people'))).toBe(false);
  });
});

describe('ParentAlbum — 본 기록(선생님 보기 통계 · 관리자 로그)', () => {
  const views = () => fetchWithAuth.mock.calls
    .filter(([url, options]) => url === '/api/parent/events/3/views' && options?.method === 'POST')
    .map(([, options]) => JSON.parse(options.body));

  beforeEach(() => jest.clearAllMocks());

  it('앨범을 열면 한 번, 사진을 크게 보면 그 사진 — 넘겨 본 사진도, 같은 것은 이 화면에서 한 번만', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse(payload()));
    await renderAlbum();

    expect(views()).toEqual([{}]);

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /사진 열기|영상 열기/ })[0]); });
    expect(views()).toEqual([{}, { mediaId: 1 }]);

    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    await act(async () => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
    expect(views()).toEqual([{}, { mediaId: 1 }, { mediaId: 2 }]);
  });

  it('볼 수 없는 앨범이면 남기지 않는다', async () => {
    fetchWithAuth.mockImplementation(() => jsonResponse({ error: '선생님이 아직 공개하지 않은 앨범이에요', reason: 'album_private' }, { ok: false, status: 403 }));
    await renderAlbum();
    expect(views()).toEqual([]);
  });
});
